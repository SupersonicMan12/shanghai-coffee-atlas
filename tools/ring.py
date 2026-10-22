#!/usr/bin/env python3
"""Outer Ring Expressway geometry and local distance helpers.

The committed cache is populated by ``python3 tools/ring.py --fetch``. Importing
this module is always offline.
"""

from __future__ import annotations

import argparse
from functools import lru_cache
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache' / 'osm' / 'ring.json'
OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
]
USER_AGENT = 'shanghai-coffee-atlas/1.0 (+https://github.com/SupersonicMan12/shanghai-coffee-atlas; osm cache refresh)'
QUERY = """[out:json][timeout:180];
way["highway"="motorway"]["ref"~"S20"](30.9,121.1,31.5,121.9);
out geom;"""

SHEET_BBOX = (31.025, 121.230, 31.475, 121.755)  # S, W, N, E
OLD_SHEET_BBOX = (31.121, 121.340, 31.330, 121.625)

CENTRE_LAT = 31.23
CENTRE_LNG = 121.48
LOCAL_COS = math.cos(math.radians(31.25))
METRES_PER_DEGREE = 111_320.0


def fetch() -> dict:
    last: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            response = requests.post(
                url, data={'data': QUERY}, timeout=240,
                headers={'User-Agent': USER_AGENT})
            if response.status_code != 200:
                raise RuntimeError(f'HTTP {response.status_code}')
            data = response.json()
            ways = []
            for element in data.get('elements', []):
                geometry = element.get('geometry') or []
                points = [[round(p['lon'], 5), round(p['lat'], 5)] for p in geometry
                          if 'lon' in p and 'lat' in p]
                if len(points) >= 2:
                    ways.append(points)
            if not ways:
                raise RuntimeError('Overpass returned no S20 way geometry')
            result = {
                'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'ways': ways,
            }
            CACHE.parent.mkdir(parents=True, exist_ok=True)
            CACHE.write_text(json.dumps(result, separators=(',', ':')) + '\n',
                             encoding='utf-8')
            print(f'cached {len(ways)} ways / {sum(map(len, ways))} vertices to {CACHE}')
            return result
        except Exception as exc:  # noqa: BLE001 - try the next public mirror
            last = exc
            print(f'{url} failed: {exc}', file=sys.stderr)
            time.sleep(2)
    raise SystemExit(f'could not fetch S20 geometry: {last}')


@lru_cache(maxsize=1)
def _load_ways() -> list[list[tuple[float, float]]]:
    data = json.loads(CACHE.read_text(encoding='utf-8'))
    return [[(float(lng), float(lat)) for lng, lat in way]
            for way in data['ways']]


def _local(lng: float, lat: float) -> tuple[float, float]:
    return ((lng - CENTRE_LNG) * LOCAL_COS * METRES_PER_DEGREE,
            (lat - CENTRE_LAT) * METRES_PER_DEGREE)


@lru_cache(maxsize=1)
def _polygon() -> list[tuple[float, float]]:
    radial: dict[int, tuple[float, tuple[float, float]]] = {}
    for way in _load_ways():
        for lng, lat in way:
            x, y = _local(lng, lat)
            bearing = math.degrees(math.atan2(x, y)) % 360
            radius = math.hypot(x, y)
            bucket = int(bearing)
            if bucket not in radial or radius > radial[bucket][0]:
                radial[bucket] = (radius, (x, y))
    return [radial[degree][1] for degree in sorted(radial)]


def _point_in_polygon(x: float, y: float, polygon: list[tuple[float, float]]) -> bool:
    inside = False
    previous = polygon[-1]
    for current in polygon:
        x1, y1 = previous
        x2, y2 = current
        if (y1 > y) != (y2 > y):
            crossing_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing_x:
                inside = not inside
        previous = current
    return inside


def inside_ring(lat: float, lng: float) -> bool:
    """Return whether a WGS-84 point is inside the star-shaped S20 polygon."""
    x, y = _local(lng, lat)
    return _point_in_polygon(x, y, _polygon())


def _segment_distance(px: float, py: float, ax: float, ay: float,
                      bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def km_outside_ring(lat: float, lng: float) -> float:
    """Distance in km outside S20; points inside the ring return zero."""
    if inside_ring(lat, lng):
        return 0.0
    px, py = _local(lng, lat)
    nearest = math.inf
    for way in _load_ways():
        points = [_local(lon, latitude) for lon, latitude in way]
        for a, b in zip(points, points[1:]):
            nearest = min(nearest, _segment_distance(px, py, *a, *b))
    return nearest / 1000


def in_band(lat: float, lng: float, max_km: float = 10.0) -> bool:
    """Return whether a point is inside S20 or no farther than max_km outside."""
    return km_outside_ring(lat, lng) <= max_km


def self_check() -> None:
    checks = [
        ("People's Square", 31.2317, 121.4737),
        ('Hongqiao Airport T2', 31.1979, 121.3363),
        ('Jiading old town', 31.383, 121.250),
        ('Songjiang Xincheng', 31.03, 121.22),
        ('Anting', 31.29, 121.16),
    ]
    for name, lat, lng in checks:
        distance = km_outside_ring(lat, lng)
        print(f'{name}: inside={inside_ring(lat, lng)}, km_outside={distance:.2f}, in_band={distance <= 10.0}')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true', help='refresh the committed Overpass cache')
    args = parser.parse_args()
    if args.fetch:
        fetch()
    if not CACHE.exists():
        parser.error(f'missing {CACHE}; run with --fetch')
    self_check()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
