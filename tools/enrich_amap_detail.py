#!/usr/bin/env python3
"""Fetch Amap (高德) place *detail* for every café: photos, weekly hours, dishes.

Resumable and quota-aware: one JSON per café under tools/cache/amap-detail/;
cafés with a cache file are skipped. Cafés that carry `evidence.amap.id` are
fetched by id; the rest are matched by name — first a 200 m around-search,
then a city text search kept only within 400 m. Café coordinates are WGS-84 and
Amap speaks GCJ-02, so both searches convert first.

tools/amap_aliases.json pins cafés whose Amap listing carries a different name
(RAC → RACBAR, Rumors → 鲁马滋); each entry was checked against the address by hand.

Usage:
    AMAP_WEB_API_KEY=... python3 tools/enrich_amap_detail.py [--limit N] [--refresh-unmatched] [--retry-rejected]
"""

from __future__ import annotations

import argparse
import difflib
import math
import os
import re
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from amap_harvest import wgs84_to_gcj02  # noqa: E402
from enrich_common import AMAP_DETAIL, cafes, now_iso, read_json, write_json  # noqa: E402

API = 'https://restapi.amap.com/v3/place'
ALIASES = Path(__file__).resolve().parent / 'amap_aliases.json'
DELAY = 0.36
# --refresh only re-fetches records older than this (ISO date); bump per recrawl
REFRESH_BEFORE = '2026-09-19'
QUOTA_INFOCODES = {'10003', '10014', '10044'}
AROUND_M = 200
TEXT_MAX_M = 400
NOISE = re.compile(
    r'[\(（].*?[\)）]|^上海市?|\b(coffee|caf[eé]|roaster[sy]?|roastery|espresso|bar|studio)\b'
    r'|咖啡馆|咖啡店|咖啡厅|咖啡|烘焙|[\s.\-&,，、\'’!！·]',
    re.I,
)
CJK = re.compile(r'[\u4e00-\u9fff]')


def get(path: str, params: dict[str, str]) -> dict:
    r = requests.get(f'{API}/{path}', params={'key': os.environ['AMAP_WEB_API_KEY'], 'output': 'json', **params},
                     timeout=30)
    r.raise_for_status()
    data = r.json()
    if data.get('infocode') in QUOTA_INFOCODES:
        raise SystemExit(f'Amap quota exhausted ({data.get("infocode")} {data.get("info")}); rerun later')
    if data.get('infocode') != '10000':
        # rate limit (10021), key errors etc.: never mistake these for an empty result
        raise RuntimeError(f'Amap {data.get("infocode")} {data.get("info")}')
    return data


def record(cafe: dict, payload: dict, matched: bool, source_id: str | None) -> dict:
    pois = payload.get('pois') or []
    poi = pois[0] if pois else {}
    biz = poi.get('biz_ext') or {}
    photos = [p.get('url') for p in poi.get('photos') or [] if p.get('url')]
    return {
        'cafeId': cafe['id'],
        'matched': matched,
        'amapId': source_id,
        'photos': photos[:6],
        'opentime2': biz.get('opentime2') or poi.get('opentime2') or None,
        'open_time': biz.get('open_time') or poi.get('open_time') or None,
        'rating': biz.get('rating') or poi.get('rating') or None,
        'cost': biz.get('cost') or poi.get('cost') or None,
        'tag': poi.get('tag') or None,
        'type': poi.get('type'),
        'address': poi.get('address'),
        'business_area': poi.get('business_area'),
        'name': poi.get('name'),
        'fetchedAt': now_iso(),
    }


def core(name: str | None) -> str:
    return NOISE.sub('', (name or '').lower())


def substantive(s: str) -> bool:
    return len(s) >= 4 or (len(s) >= 2 and bool(CJK.search(s)))


def similar(cafe: dict, poi: dict) -> bool:
    """Compare names with branch suffixes and 'coffee/咖啡' noise stripped, so
    'Maancat Coffee' never matches 'La casbah coffee 咖啡店'."""
    cand = core(poi.get('name'))
    if not cand:
        return False
    # the atlas writes branches as 'Seesaw 咖啡 · 愚园路'; the road is not part of the name
    for target in (cafe['name'], re.sub(r'\s·\s.*$', '', cafe['nameZh'] or '')):
        t = core(target)
        if not t:
            continue
        if t == cand:
            return True
        if substantive(t) and substantive(cand) and (t in cand or cand in t):
            return True
        # 'rac' → 'racbar', 'egg' → 'eggcafe': a short latin name the listing extends
        if len(t) >= 3 and t.isascii() and cand.startswith(t) and len(cand) <= len(t) + 4:
            return True
        if difflib.SequenceMatcher(None, cand, t).ratio() >= 0.75:
            return True
    return False


def is_cafe_poi(poi: dict) -> bool:
    return str(poi.get('typecode') or '').startswith('0505') or '咖啡' in str(poi.get('type') or '')


def metres(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def find_poi(cafe: dict, rejected: set[str]) -> dict | None:
    glng, glat = wgs84_to_gcj02(cafe['lng'], cafe['lat'])
    around = get('around', {'location': f'{glng:.6f},{glat:.6f}', 'radius': str(AROUND_M),
                            'types': '050500', 'sortrule': 'distance', 'offset': '25', 'page': '1'})
    poi = next((p for p in around.get('pois') or [] if p.get('id') not in rejected and similar(cafe, p)), None)
    if poi is not None:
        return poi
    time.sleep(DELAY)
    for keyword in dict.fromkeys(k for k in (cafe['nameZh'], cafe['name']) if k):
        text = get('text', {'keywords': keyword, 'city': '上海', 'citylimit': 'true', 'offset': '20', 'page': '1'})
        for p in text.get('pois') or []:
            loc = str(p.get('location') or '')
            if p.get('id') in rejected or ',' not in loc or not is_cafe_poi(p) or not similar(cafe, p):
                continue
            plng, plat = (float(x) for x in loc.split(','))
            if metres(glng, glat, plng, plat) <= TEXT_MAX_M:
                return p
        time.sleep(DELAY)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--refresh-unmatched', action='store_true',
                    help='retry cafés whose cache says matched=false')
    ap.add_argument('--refresh', action='store_true',
                    help='re-fetch every matched café by its Amap id; photos seen before are kept')
    ap.add_argument('--retry-rejected', action='store_true',
                    help='forget ids rejected earlier (a rate-limited detail call used to look like a vanished POI)')
    ap.add_argument('--only', nargs='*', default=[], help='café ids to (re)fetch regardless of cache')
    args = ap.parse_args()
    if not os.environ.get('AMAP_WEB_API_KEY'):
        raise SystemExit('AMAP_WEB_API_KEY is required')
    aliases: dict[str, dict] = read_json(ALIASES) or {}
    only = set(args.only)
    done = matched = 0
    for cafe in cafes():
        path = AMAP_DETAIL / f"{cafe['id']}.json"
        cached = read_json(path)
        alias = aliases.get(cafe['id']) or {}
        stale = cached is not None and (
            cafe['id'] in only
            or (alias.get('amapId') and cached.get('amapId') != alias['amapId'])
            or (args.retry_rejected and cached.get('rejected') and not cached.get('matched'))
            or (args.refresh_unmatched and not cached.get('matched'))
            or (args.refresh and cached.get('matched') and cached.get('amapId')
                and cached.get('fetchedAt', '') < REFRESH_BEFORE))
        if cached is not None and not stale:
            continue
        if args.limit and done >= args.limit:
            break
        try:
            rejected = set() if args.retry_rejected else set((cached or {}).get('rejected') or [])
            known_id = alias.get('amapId') or cafe['amapId'] or ((cached or {}).get('amapId') if stale else None)
            rec = None
            if known_id and known_id not in rejected:
                rec = record(cafe, get('detail', {'id': known_id}), True, known_id)
                if not rec.get('name'):
                    # the POI is gone from Amap: forget it and search afresh
                    rejected.add(known_id)
                    rec = None
                    time.sleep(DELAY)
                elif cached:
                    old = [p for p in cached.get('photos') or [] if p not in rec['photos']]
                    rec['photos'] = (rec['photos'] + old)[:6]
            if rec is None:
                poi = find_poi(cafe, rejected)
                if poi is None:
                    rec = {'cafeId': cafe['id'], 'matched': False, 'photos': [], 'fetchedAt': now_iso()}
                else:
                    time.sleep(DELAY)
                    rec = record(cafe, get('detail', {'id': poi['id']}), True, poi['id'])
            if rejected:
                rec['rejected'] = sorted(rejected)
            write_json(path, rec)
            done += 1
            matched += int(bool(rec.get('matched')))
            print(f"{cafe['id']}: {'matched' if rec.get('matched') else 'no match'}")
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 — resumable
            print(f"{cafe['id']}: {exc}", file=sys.stderr)
        time.sleep(DELAY)
    print(f'fetched={done} matched={matched}')


if __name__ == '__main__':
    main()
