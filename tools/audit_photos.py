#!/usr/bin/env python3
"""Offline photo-coverage audit: which active cafés have no photos, and what
the caches already know about them (no network).

For every café without photos it looks for
  * another active café within 120 m with a similar name (editorial ↔ imported
    duplicates: the imported twin usually carries the Amap photos), and
  * café POIs with photos in the cached Amap around-search responses within
    250 m whose name matches — candidates `enrich_amap_detail.py` never saw
    because the café is an old, unmatched editorial record.

Usage: python3 tools/audit_photos.py [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from amap_harvest import wgs84_to_gcj02  # noqa: E402
from enrich_amap_detail import is_cafe_poi, metres, similar  # noqa: E402
from enrich_common import AMAP_DETAIL, CACHE, DETAILS_JSON, cafes, read_json  # noqa: E402

AMAP_SEARCH = CACHE / 'amap'
TWIN_M = 120
POI_M = 250


def cached_pois() -> dict[str, dict]:
    pois: dict[str, dict] = {}
    for path in AMAP_SEARCH.glob('*.json'):
        data = read_json(path)
        if not isinstance(data, dict):
            continue
        for p in (data.get('response') or {}).get('pois') or []:
            if p.get('id') and ',' in str(p.get('location') or ''):
                pois.setdefault(p['id'], p)
    return pois


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--json', type=Path)
    args = ap.parse_args()

    all_cafes = cafes()
    details = read_json(DETAILS_JSON) or {}
    photos = {c['id']: (details.get(c['id']) or {}).get('photos') or [] for c in all_cafes}
    missing = [c for c in all_cafes if not photos[c['id']]]
    pois = cached_pois()

    report = []
    for cafe in missing:
        glng, glat = wgs84_to_gcj02(cafe['lng'], cafe['lat'])
        detail = read_json(AMAP_DETAIL / f"{cafe['id']}.json") or {}
        twins = [
            {'id': o['id'], 'name': o['name'], 'nameZh': o['nameZh'], 'source': o['source'],
             'photos': len(photos[o['id']]),
             'm': round(metres(cafe['lng'], cafe['lat'], o['lng'], o['lat']))}
            for o in all_cafes
            if o['id'] != cafe['id']
            and metres(cafe['lng'], cafe['lat'], o['lng'], o['lat']) <= TWIN_M
            and (similar(cafe, {'name': o['name']}) or similar(cafe, {'name': o['nameZh']}))
        ]
        cands = []
        for p in pois.values():
            plng, plat = (float(x) for x in str(p['location']).split(','))
            d = metres(glng, glat, plng, plat)
            if d <= POI_M and is_cafe_poi(p) and similar(cafe, p):
                cands.append({'id': p['id'], 'name': p['name'], 'm': round(d),
                              'photos': len(p.get('photos') or []),
                              'address': p.get('address')})
        cands.sort(key=lambda c: c['m'])
        report.append({
            'id': cafe['id'], 'name': cafe['name'], 'nameZh': cafe['nameZh'], 'source': cafe['source'],
            'street': cafe['streetZh'] or cafe['street'],
            'amapMatched': bool(detail.get('matched')), 'amapId': detail.get('amapId') or cafe['amapId'],
            'amapName': detail.get('name'), 'rejected': detail.get('rejected') or [],
            'twins': twins, 'cachedPois': cands,
        })

    n_twin = sum(1 for r in report if any(t['photos'] for t in r['twins']))
    n_poi = sum(1 for r in report if not any(t['photos'] for t in r['twins']) and any(c['photos'] for c in r['cachedPois']))
    n_matched_empty = sum(1 for r in report if r['amapMatched'])
    print(f"active={len(all_cafes)} noPhotos={len(missing)} "
          f"twinWithPhotos={n_twin} cachedPoiWithPhotos={n_poi} matchedButEmpty={n_matched_empty}")
    for r in report:
        flag = 'TWIN' if any(t['photos'] for t in r['twins']) else ('POI ' if any(c['photos'] for c in r['cachedPois']) else ('AMAP0' if r['amapMatched'] else '----'))
        extra = ''
        if flag == 'TWIN':
            t = max(r['twins'], key=lambda t: t['photos'])
            extra = f"-> {t['id']} ({t['m']} m, {t['photos']} photos)"
        elif flag == 'POI ':
            c = next(c for c in r['cachedPois'] if c['photos'])
            extra = f"-> {c['id']} {c['name']} ({c['m']} m, {c['photos']} photos)"
        elif flag == 'AMAP0':
            extra = f"-> {r['amapId']} {r['amapName']}"
        print(f"{flag} {r['source'][:3]} {r['id']:<34} {r['nameZh'] or r['name']:<24} {extra}")
    if args.json:
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
