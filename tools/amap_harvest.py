#!/usr/bin/env python3
"""Harvest Amap (高德) POI signals for every café in src/data/cafes.ts.

Quota-aware, cached and resumable:
- every raw API response is written to tools/cache/amap/<cafe-id>.json
- cafés with an existing cache file are skipped, so re-running never
  re-spends quota
- on quota exhaustion (infocode 10003/10044) the run stops gracefully

Usage:
    AMAP_WEB_API_KEY=... python3 tools/amap_harvest.py [--limit N]

The key is read from the environment only; it is never written to disk.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
CACHE_DIR = ROOT / 'tools' / 'cache' / 'amap'

API_URL = 'https://restapi.amap.com/v3/place/around'
QUOTA_INFOCODES = {'10003', '10044'}
MAX_DISTANCE_M = 300.0
GENERIC_WORDS = ['coffeeshop', 'coffee', 'café', 'cafe', 'roastery', 'roasters', 'roaster',
                 'espresso', 'studio', 'shanghai', '咖啡馆', '咖啡店', '咖啡', '烘焙', '工作室', '上海']


def wgs84_to_gcj02(lng: float, lat: float) -> tuple[float, float]:
    """Convert WGS-84 (OSM) to GCJ-02 (Amap) — mainland China offset."""
    a, ee = 6378245.0, 0.00669342162296594323

    def transform_lat(x: float, y: float) -> float:
        ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * math.sqrt(abs(x))
        ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
        ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
        ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
        return ret

    def transform_lng(x: float, y: float) -> float:
        ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * math.sqrt(abs(x))
        ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
        ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
        ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
        return ret

    dlat = transform_lat(lng - 105.0, lat - 35.0)
    dlng = transform_lng(lng - 105.0, lat - 35.0)
    radlat = lat / 180.0 * math.pi
    magic = 1 - ee * math.sin(radlat) ** 2
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * math.pi)
    dlng = (dlng * 180.0) / (a / sqrtmagic * math.cos(radlat) * math.pi)
    return lng + dlng, lat + dlat


def parse_cafes() -> list[dict]:
    """Extract id/name/nameZh/lat/lng from cafes.ts without executing it."""
    src = CAFES_TS.read_text(encoding='utf-8')
    cafes = []
    for block in re.finditer(r'\{\s*\n\s*id:\s*\'([^\']+)\',(.*?)\n  \}', src, re.S):
        body = block.group(2)

        def field(name: str) -> str | None:
            m = re.search(r"\b%s:\s*(?:'((?:[^'\\]|\\.)*)'|([-\d.]+))" % name, body)
            if not m:
                return None
            return m.group(1) if m.group(1) is not None else m.group(2)

        cafes.append({
            'id': block.group(1),
            'name': (field('name') or '').replace("\\'", "'"),
            'nameZh': (field('nameZh') or '').replace("\\'", "'"),
            'lat': float(field('lat') or 0),
            'lng': float(field('lng') or 0),
        })
    return cafes


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def norm(s: str) -> str:
    return re.sub(r'[^0-9a-z\u4e00-\u9fff]+', '', s.lower())


def core_name(s: str) -> str:
    """Strip branch parentheticals and generic café words, keep the brand."""
    s = re.sub(r'[（(].*?[)）]', '', s.lower())
    for w in GENERIC_WORDS:
        s = s.replace(w, '')
    return norm(s)


def name_similarity(cafe: dict, poi_name: str) -> float:
    best = 0.0
    for candidate in (cafe['name'], cafe['nameZh']):
        cn, pn = core_name(candidate), core_name(poi_name)
        if not cn or not pn:
            cn, pn = norm(candidate), norm(poi_name)
        if not cn or not pn:
            continue
        if min(len(cn), len(pn)) >= 3 and (cn in pn or pn in cn):
            best = max(best, 0.95)
        best = max(best, SequenceMatcher(None, cn, pn).ratio())
    return best


def pick_match(cafe: dict, pois: list[dict]) -> dict | None:
    glng, glat = wgs84_to_gcj02(cafe['lng'], cafe['lat'])
    best, best_score = None, 0.0
    for poi in pois:
        loc = poi.get('location')
        if not isinstance(loc, str) or ',' not in loc:
            continue
        lng, lat = (float(x) for x in loc.split(',')[:2])
        dist = haversine_m(glat, glng, lat, lng)
        if dist > MAX_DISTANCE_M:
            continue
        sim = name_similarity(cafe, poi.get('name', ''))
        if sim < 0.66:
            continue
        score = sim - dist / 3000.0
        if score > best_score:
            best, best_score = poi, score
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='max API calls this run')
    args = ap.parse_args()

    key = os.environ.get('AMAP_WEB_API_KEY')
    if not key:
        print('AMAP_WEB_API_KEY is not set', file=sys.stderr)
        return 1

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cafes = parse_cafes()
    pending = [c for c in cafes if not (CACHE_DIR / f"{c['id']}.json").exists()]
    print(f'{len(cafes)} cafés, {len(pending)} not yet cached')

    calls = 0
    for cafe in pending:
        if args.limit and calls >= args.limit:
            print(f'reached --limit {args.limit}, stopping')
            break
        glng, glat = wgs84_to_gcj02(cafe['lng'], cafe['lat'])
        try:
            resp = requests.get(API_URL, params={
                'key': key,
                'location': f'{glng:.6f},{glat:.6f}',
                'radius': 300,
                'types': '050500',
                'sortrule': 'distance',
                'offset': 25,
                'extensions': 'all',
            }, timeout=20)
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            print(f"{cafe['id']}: request failed ({exc}), stopping")
            break
        calls += 1

        infocode = str(data.get('infocode', ''))
        if infocode in QUOTA_INFOCODES:
            print(f"{cafe['id']}: quota exhausted (infocode {infocode}), stopping")
            break
        if data.get('status') != '1':
            print(f"{cafe['id']}: API error infocode={infocode} info={data.get('info')}, stopping")
            break

        pois = data.get('pois') or []
        match = pick_match(cafe, pois)
        record = {
            'cafeId': cafe['id'],
            'query': {'location': f'{glng:.6f},{glat:.6f}', 'radius': 300, 'types': '050500', 'sortrule': 'distance'},
            'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'matchedPoiId': match.get('id') if match else None,
            'response': data,
        }
        (CACHE_DIR / f"{cafe['id']}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        status = f"matched {match['name']}" if match else f'no match ({len(pois)} pois)'
        print(f"{cafe['id']}: {status}")
        time.sleep(0.35)

    print(f'done: {calls} API calls this run')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
