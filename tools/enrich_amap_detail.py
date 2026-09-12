#!/usr/bin/env python3
"""Fetch Amap (高德) place *detail* for every café: photos, weekly hours, dishes.

Resumable and quota-aware: one JSON per café under tools/cache/amap-detail/;
cafés with a cache file are skipped. Cafés that carry `evidence.amap.id` are
fetched by id; the rest are matched by a 150 m around-search on name.

Usage:
    AMAP_WEB_API_KEY=... python3 tools/enrich_amap_detail.py [--limit N] [--refresh-unmatched]
"""

from __future__ import annotations

import argparse
import difflib
import os
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_common import AMAP_DETAIL, cafes, now_iso, read_json, write_json  # noqa: E402

API = 'https://restapi.amap.com/v3/place'
DELAY = 0.36
QUOTA_INFOCODES = {'10003', '10014', '10044'}


def get(path: str, params: dict[str, str]) -> dict:
    r = requests.get(f'{API}/{path}', params={'key': os.environ['AMAP_WEB_API_KEY'], 'output': 'json', **params},
                     timeout=30)
    r.raise_for_status()
    data = r.json()
    if data.get('infocode') in QUOTA_INFOCODES:
        raise SystemExit(f'Amap quota exhausted ({data.get("infocode")} {data.get("info")}); rerun later')
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


def similar(cafe: dict, poi: dict) -> bool:
    cand = str(poi.get('name') or '').lower()
    for target in (cafe['name'], cafe['nameZh']):
        t = (target or '').lower()
        if t and (t in cand or cand in t or difflib.SequenceMatcher(None, cand, t).ratio() >= 0.6):
            return True
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--refresh-unmatched', action='store_true',
                    help='retry cafés whose cache says matched=false')
    args = ap.parse_args()
    if not os.environ.get('AMAP_WEB_API_KEY'):
        raise SystemExit('AMAP_WEB_API_KEY is required')
    done = matched = 0
    for cafe in cafes():
        path = AMAP_DETAIL / f"{cafe['id']}.json"
        cached = read_json(path)
        if cached is not None and not (args.refresh_unmatched and not cached.get('matched')):
            continue
        if args.limit and done >= args.limit:
            break
        try:
            if cafe['amapId']:
                rec = record(cafe, get('detail', {'id': cafe['amapId']}), True, cafe['amapId'])
            else:
                around = get('around', {'location': f"{cafe['lng']},{cafe['lat']}", 'radius': '150',
                                        'types': '050500', 'sortrule': 'distance', 'offset': '20', 'page': '1'})
                poi = next((p for p in around.get('pois') or [] if similar(cafe, p)), None)
                if poi is None:
                    rec = {'cafeId': cafe['id'], 'matched': False, 'photos': [], 'fetchedAt': now_iso()}
                else:
                    time.sleep(DELAY)
                    rec = record(cafe, get('detail', {'id': poi['id']}), True, poi['id'])
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
