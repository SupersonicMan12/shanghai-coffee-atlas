"""Second-opinion check for editorial cafés that no external source has confirmed.

An editorial café with no Amap match, no web facts and no Dianping record is
either listed under a name the register does not use, or is not (or no longer)
at that address. Amap's POI register is dense enough in Shanghai that a café
absent from it within 400 m under a name resembling ours deserves a caveat.

This script widens the net (any food/drink POI, three pages, city-wide text
search landing within 250 m) but keeps the strict name comparison of
enrich_amap_detail — a shared generic word ('lounge', 'bread') is not a match.
Results land in tools/cache/verify/<id>.json; a confirmed POI also becomes the
café's amap-detail record so build_details.py can draw on its photos and hours.
Cafés still unconfirmed are written to src/data/unverified.json. The app keeps
showing them — Amap's register misses real independents — but the Compass marks
their verdicts as estimates rather than presenting them as checked.

    AMAP_WEB_API_KEY=... python3 tools/verify_editorial.py [--refresh]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from amap_harvest import wgs84_to_gcj02  # noqa: E402
from enrich_amap_detail import get, is_cafe_poi, metres, record, similar  # noqa: E402
from enrich_common import AMAP_DETAIL, CACHE, ROOT, cafes, now_iso, read_json, write_json  # noqa: E402

VERIFY = CACHE / 'verify'
WEB = CACHE / 'web'
DIANPING = CACHE / 'dianping'
UNVERIFIED_JSON = ROOT / 'src' / 'data' / 'unverified.json'
DELAY = 0.36
AROUND_M = 400
TEXT_MAX_M = 250
FOOD_TYPES = '050000'


def unconfirmed(cafe: dict) -> bool:
    if cafe['source'] != 'editorial':
        return False
    amap = read_json(AMAP_DETAIL / f"{cafe['id']}.json") or {}
    web = read_json(WEB / f"{cafe['id']}.json") or {}
    return not amap.get('matched') and not web.get('facts') and not (DIANPING / f"{cafe['id']}.json").exists()


def look(cafe: dict) -> dict:
    glng, glat = wgs84_to_gcj02(cafe['lng'], cafe['lat'])
    loc = f'{glng:.6f},{glat:.6f}'
    for page in ('1', '2', '3'):
        around = get('around', {'location': loc, 'radius': str(AROUND_M), 'types': FOOD_TYPES,
                                'sortrule': 'distance', 'offset': '25', 'page': page})
        pois = around.get('pois') or []
        for p in pois:
            if similar(cafe, p):
                return {'found': True, 'how': 'around', 'name': p.get('name'), 'amapId': p.get('id'),
                        'address': p.get('address'), 'cafe': is_cafe_poi(p)}
        if len(pois) < 25:
            break
        time.sleep(DELAY)
    time.sleep(DELAY)
    for keyword in dict.fromkeys(k for k in (re.sub(r'\s·\s.*$', '', cafe['nameZh'] or ''), cafe['name']) if k):
        text = get('text', {'keywords': keyword, 'city': '上海', 'citylimit': 'true', 'offset': '20', 'page': '1'})
        for p in text.get('pois') or []:
            ploc = str(p.get('location') or '')
            if ',' not in ploc:
                continue
            plng, plat = (float(x) for x in ploc.split(','))
            d = metres(glng, glat, plng, plat)
            if d <= TEXT_MAX_M and similar(cafe, p):
                return {'found': True, 'how': 'text', 'name': p.get('name'), 'amapId': p.get('id'),
                        'address': p.get('address'), 'metres': round(d), 'cafe': is_cafe_poi(p)}
        time.sleep(DELAY)
    return {'found': False}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--refresh', action='store_true', help='re-check cafés that already have a verify record')
    ap.add_argument('--offline', action='store_true', help='only rewrite src/data/unverified.json from the cache')
    args = ap.parse_args()
    if not args.offline and not os.environ.get('AMAP_WEB_API_KEY'):
        raise SystemExit('AMAP_WEB_API_KEY is required')
    checked = found = 0
    for cafe in cafes():
        if not unconfirmed(cafe):
            continue
        path = VERIFY / f"{cafe['id']}.json"
        if args.offline or (path.exists() and not args.refresh):
            continue
        try:
            rec = look(cafe)
        except SystemExit:
            raise
        except Exception as exc:  # noqa: BLE001 — resumable
            print(f"{cafe['id']}: {exc}", file=sys.stderr)
            continue
        rec.update({'cafeId': cafe['id'], 'checkedAt': now_iso()})
        write_json(path, rec)
        if rec['found']:
            time.sleep(DELAY)
            write_json(AMAP_DETAIL / f"{cafe['id']}.json",
                       record(cafe, get('detail', {'id': rec['amapId']}), True, rec['amapId']))
        checked += 1
        found += int(rec['found'])
        print(f"{cafe['id']}: {'found ' + str(rec.get('name')) if rec['found'] else 'unconfirmed'}")
        time.sleep(DELAY)
    unverified = sorted(
        c['id'] for c in cafes()
        if unconfirmed(c) and not (read_json(VERIFY / f"{c['id']}.json") or {}).get('found')
    )
    UNVERIFIED_JSON.write_text(json.dumps(unverified, indent=2) + '\n', encoding='utf-8')
    print(f'checked={checked} found={found} unverified={len(unverified)} -> {UNVERIFIED_JSON.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
