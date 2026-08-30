#!/usr/bin/env python3
"""Dianping public-signal harvester for the Shanghai Coffee Atlas.

Compliant route only: Dianping serves a full server-rendered shop page to its
Apple Maps integration channel (`m.dianping.com/shop/<id>?msource=applemaps`),
publicly, with no login and no captcha. We fetch exactly those pages, one shop
at a time, with polite delays, and cache everything so re-runs cost nothing.

No crawling of gated pages, no captcha/login bypass, no bulk spidering of
dianping.com listings. Shop ids are resolved via public search-engine results
(DuckDuckGo HTML endpoint), which index dianping shop URLs.

Stages (each resumable, each cached under tools/cache/dianping/):
  resolve  — cafes.ts -> ids.json           (search-engine id resolution)
  fetch    — ids.json -> <cafe-id>.html/.json (applemaps shop pages, parsed)
  emit     — *.json   -> src/data/dianping.json

Usage:
  python3 tools/dianping_harvest.py resolve [--limit N]
  python3 tools/dianping_harvest.py fetch   [--limit N]
  python3 tools/dianping_harvest.py emit
  python3 tools/dianping_harvest.py all
"""

from __future__ import annotations

import argparse
import difflib
import http.client
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
CACHE = ROOT / 'tools' / 'cache' / 'dianping'
IDS_JSON = CACHE / 'ids.json'
OUT_JSON = ROOT / 'src' / 'data' / 'dianping.json'

MOBILE_UA = (
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
)
DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

FETCH_DELAY_S = 6.0
SEARCH_DELAY_S = 3.0
BLOCK_BACKOFF_S = 120.0


class Blocked(Exception):
    """Meituan spider-defence redirect — back off, never bypass."""


def load_cafes() -> list[dict]:
    """Parse the café list out of cafes.ts (id, name, nameZh, lat, lng)."""
    src = CAFES_TS.read_text(encoding='utf-8')
    cafes = []
    quoted = r"(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")"

    def unq(a: str | None, b: str | None) -> str:
        return (a if a is not None else b or '').replace("\\'", "'")

    for block in re.finditer(
        r"\{\s*id:\s*'([^']+)',\s*name:\s*" + quoted
        + r",\s*nameZh:\s*" + quoted
        + r",.*?lat:\s*([\d.]+),\s*lng:\s*([\d.]+),",
        src,
        re.S,
    ):
        cafes.append(
            {
                'id': block.group(1),
                'name': unq(block.group(2), block.group(3)),
                'nameZh': unq(block.group(4), block.group(5)),
                'lat': float(block.group(6)),
                'lng': float(block.group(7)),
            }
        )
    return cafes


def http_get(url: str, ua: str, timeout: int = 25) -> str:
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': ua,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if 'verify.meituan.com' in resp.geturl():
            raise Blocked(resp.geturl())
        try:
            data = resp.read()
        except http.client.IncompleteRead as e:
            # Dianping's CDN sometimes truncates the chunked tail; the shop
            # JSON sits early in the document, so keep what arrived.
            data = e.partial
        return data.decode('utf-8', errors='ignore')


SHOP_ID_RE = re.compile(r'dianping\.com(?:%2F|/)shop(?:%2F|/)([A-Za-z0-9]+)')


def search_shop_ids(query: str) -> list[str]:
    """Public DuckDuckGo HTML search; returns dianping shop ids in rank order."""
    url = 'https://html.duckduckgo.com/html/?q=' + urllib.parse.quote(query)
    html = http_get(url, DESKTOP_UA)
    ids: list[str] = []
    for m in SHOP_ID_RE.finditer(html):
        sid = m.group(1)
        if sid.lower() in ('photos', 'review', 'shoplist'):
            continue
        if sid not in ids:
            ids.append(sid)
    return ids


def norm_name(s: str) -> str:
    s = s.lower()
    s = re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', s)
    return s


GENERIC = re.compile(
    r'coffee|coffe|café|cafe|roasters?|roastery|espresso|brew(?:ers)?|'
    r'咖啡馆|咖啡厅|咖啡|餐厅|烘焙|上海|旗舰店|店|shanghai'
)
BRANCH_RE = re.compile(r'[(（][^)）]*[)）]')


def core_name(s: str) -> str:
    """Strip branch suffixes and generic café words down to the brand core."""
    return GENERIC.sub('', norm_name(BRANCH_RE.sub('', s)))


def name_matches(cafe: dict, shop_name: str) -> bool:
    """Conservative brand-core comparison — generic words like “coffee” or
    “咖啡” must not carry a match on their own."""
    shop_cores = [core_name(shop_name)]
    latin = core_name(re.sub(r'[\u4e00-\u9fff]+', '', BRANCH_RE.sub('', shop_name)))
    if latin and latin not in shop_cores:
        shop_cores.append(latin)
    for cand in (cafe['name'], cafe['nameZh']):
        cn = core_name(cand)
        if len(cn) < 2:
            continue
        for sn in shop_cores:
            if len(sn) < 2:
                continue
            if cn in sn or sn in cn:
                return True
            if difflib.SequenceMatcher(None, cn, sn).ratio() >= 0.75:
                return True
    return False


def parse_shop_page(html: str) -> dict | None:
    """Pull the embedded JSON fields out of an applemaps shop page."""

    def s(pattern: str) -> str | None:
        m = re.search(pattern, html)
        return m.group(1) if m else None

    shop_name = s(r'"shopName":"((?:[^"\\]|\\.)*)"')
    if not shop_name:
        return None
    out: dict = {'shopName': json.loads('"%s"' % shop_name)}
    rate = s(r'"shopPowerRate":"([\d.]+)"')
    if rate:
        out['rating'] = float(rate)
    price = s(r'"avgPrice":([\d.]+)')
    if price:
        out['avgPrice'] = float(price)
    cat = s(r'"categoryName":"((?:[^"\\]|\\.)*)"')
    if cat:
        out['categoryName'] = json.loads('"%s"' % cat)
    region = s(r'"regionName":"((?:[^"\\]|\\.)*)"')
    if region:
        out['regionName'] = json.loads('"%s"' % region)
    city = s(r'"cityId":(\d+)')
    if city:
        out['cityId'] = int(city)
    # Review-count text when present; picture-count string as a fallback
    # popularity proxy (both are of the "4万+" form).
    rc = s(r'"reviewCountText":"((?:[^"\\]|\\.)*)"') or s(
        r'"defaultReviewCount":"((?:[^"\\]|\\.)*)"'
    )
    if rc:
        out['reviewCountText'] = json.loads('"%s"' % rc)
    pc = s(r'"picCountStr":"((?:[^"\\]|\\.)*)"')
    if pc:
        out['picCountStr'] = json.loads('"%s"' % pc)
    return out


def fetch_shop(shop_id: str) -> dict | None:
    url = f'https://m.dianping.com/shop/{shop_id}?msource=applemaps'
    html = None
    for attempt in range(3):
        try:
            html = http_get(url, MOBILE_UA)
            break
        except Blocked:
            wait = BLOCK_BACKOFF_S * (2**attempt)
            print(
                f'    spider-defence for {shop_id}; backing off {wait:.0f}s',
                file=sys.stderr,
            )
            time.sleep(wait)
            if attempt == 2:
                raise
        except Exception as e:  # noqa: BLE001 — network flake (IncompleteRead etc.)
            print(f'    fetch error {shop_id} (try {attempt + 1}): {e}', file=sys.stderr)
            time.sleep(FETCH_DELAY_S * (attempt + 1))
    if html is None:
        return None
    parsed = parse_shop_page(html)
    if parsed is not None:
        parsed['_html'] = html
    return parsed


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n',
        encoding='utf-8',
    )


CANDIDATES_JSON = CACHE / 'search_candidates.json'


def cmd_resolve(limit: int | None) -> None:
    """Verify search-engine candidates against fetched shop pages.

    Candidates come from tools/cache/dianping/search_candidates.json
    (cafeId -> [shopId, ...], built from public search-engine results); as a
    fallback for cafés with no entry there, the DuckDuckGo HTML endpoint is
    queried directly.
    """
    cafes = load_cafes()
    candidates = load_json(CANDIDATES_JSON, {})
    ids = load_json(IDS_JSON, {})
    done = 0
    for cafe in cafes:
        if ids.get(cafe['id'], {}).get('status') == 'ok':
            continue
        if cafe['id'] in ids and cafe['id'] not in candidates:
            continue  # already tried, nothing new to try
        if limit is not None and done >= limit:
            break
        done += 1
        cand = list(candidates.get(cafe['id'], []))
        if not cand:
            for q in (
                f"{cafe['nameZh']} 上海 dianping.com shop",
                f"{cafe['name']} 上海 咖啡 dianping.com",
            ):
                try:
                    cand += [s for s in search_shop_ids(q) if s not in cand]
                except Exception as e:  # noqa: BLE001 — network flake
                    print(f'  search error for {cafe["id"]}: {e}', file=sys.stderr)
                time.sleep(SEARCH_DELAY_S)
        record = {'status': 'not-found', 'candidates': []}
        for sid in cand[:4]:
            record['candidates'].append(sid)
            try:
                parsed = fetch_shop(sid)
            except Blocked:
                # Persistent spider-defence: keep what we have, stop the run
                # (partial coverage is fine; re-run resumes later).
                print('  still blocked — stopping this run', file=sys.stderr)
                return
            time.sleep(FETCH_DELAY_S)
            if not parsed:
                continue
            if parsed.get('cityId') not in (None, 1):
                continue
            if name_matches(cafe, parsed['shopName']):
                record = {
                    'status': 'ok',
                    'shopId': sid,
                    'shopName': parsed['shopName'],
                    'candidates': record['candidates'],
                }
                (CACHE / f"{cafe['id']}.html").write_text(
                    parsed.pop('_html'), encoding='utf-8'
                )
                parsed['shopId'] = sid
                parsed['fetchedAt'] = datetime.now(timezone.utc).strftime(
                    '%Y-%m-%dT%H:%M:%SZ'
                )
                save_json(CACHE / f"{cafe['id']}.json", parsed)
                break
        ids[cafe['id']] = record
        save_json(IDS_JSON, ids)
        print(
            f"[{sum(1 for v in ids.values() if v['status'] == 'ok')} ok / "
            f"{len(ids)} tried] {cafe['id']}: {record['status']}"
            + (f" -> {record.get('shopName', '')}" if record['status'] == 'ok' else '')
        )


def cmd_fetch(limit: int | None) -> None:
    ids = load_json(IDS_JSON, {})
    done = 0
    for cafe_id, rec in ids.items():
        if rec.get('status') != 'ok':
            continue
        if (CACHE / f'{cafe_id}.json').exists():
            continue
        if limit is not None and done >= limit:
            break
        done += 1
        try:
            parsed = fetch_shop(rec['shopId'])
        except Blocked:
            print('  still blocked — stopping this run', file=sys.stderr)
            return
        time.sleep(FETCH_DELAY_S)
        if not parsed:
            print(f'  {cafe_id}: fetch failed', file=sys.stderr)
            continue
        (CACHE / f'{cafe_id}.html').write_text(
            parsed.pop('_html'), encoding='utf-8'
        )
        parsed['shopId'] = rec['shopId']
        parsed['fetchedAt'] = datetime.now(timezone.utc).strftime(
            '%Y-%m-%dT%H:%M:%SZ'
        )
        save_json(CACHE / f'{cafe_id}.json', parsed)
        print(f'  {cafe_id}: fetched {parsed["shopName"]}')


def cmd_emit() -> None:
    out = {}
    for path in sorted(CACHE.glob('*.json')):
        if path.name in ('ids.json', 'search_candidates.json'):
            continue
        parsed = load_json(path, None)
        if not parsed:
            continue
        entry = {
            'shopId': parsed['shopId'],
            'fetchedAt': parsed['fetchedAt'],
        }
        for k in (
            'rating',
            'avgPrice',
            'reviewCountText',
            'picCountStr',
            'categoryName',
            'regionName',
        ):
            if k in parsed:
                entry[k] = parsed[k]
        out[path.stem] = entry
    save_json(OUT_JSON, out)
    print(f'emitted {len(out)} cafés -> {OUT_JSON.relative_to(ROOT)}')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('stage', choices=['resolve', 'fetch', 'emit', 'all'])
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    if args.stage in ('resolve', 'all'):
        cmd_resolve(args.limit)
    if args.stage in ('fetch', 'all'):
        cmd_fetch(args.limit)
    if args.stage in ('emit', 'all'):
        cmd_emit()


if __name__ == '__main__':
    main()
