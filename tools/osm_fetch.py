#!/usr/bin/env python3
"""Refresh the OpenStreetMap extracts under tools/cache/osm from Overpass.

Two caches feed the offline importers:

* cafes.json  — every amenity=cafe / shop=coffee element on the sheet; read by
  expand_atlas.py (which keeps only elements OSM itself marks as coffee shops).
* metro.json  — railway=station + station=subway nodes on the sheet; read by
  build_metro.py together with the city-wide route relations (routes.json /
  routenodes.json, fetched here too) to derive which lines call at each one.

Politeness: one request per bbox tile, 2 s apart, a descriptive User-Agent,
and the public mirrors tried in turn. Existing caches are only overwritten
once a complete fetch succeeded, so a mid-run failure never leaves a half
cache behind.

Usage:
    python3 tools/osm_fetch.py [cafes] [metro] [routes]     (default: all)

Source data (c) OpenStreetMap contributors, ODbL.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / 'tools' / 'cache' / 'osm'

# Whole-city sheet: S, W, N, E (matches build_basemap.BBOX plus a hair).
BBOX = (31.121, 121.340, 31.330, 121.625)
TILES = (2, 2)  # rows, cols — Overpass copes better with four small asks

OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
]
USER_AGENT = 'shanghai-coffee-atlas/1.0 (+https://github.com/SupersonicMan12/shanghai-coffee-atlas; osm cache refresh)'
PAUSE_S = 2.0


def tiles() -> list[str]:
    s, w, n, e = BBOX
    rows, cols = TILES
    dy, dx = (n - s) / rows, (e - w) / cols
    out = []
    for j in range(rows):
        for i in range(cols):
            out.append(f'{s + j * dy:.4f},{w + i * dx:.4f},{s + (j + 1) * dy:.4f},{w + (i + 1) * dx:.4f}')
    return out


def cafe_query(bb: str) -> str:
    return f"""[out:json][timeout:120];
(
  nwr["amenity"="cafe"]({bb});
  nwr["shop"="coffee"]({bb});
);
out center tags;"""


def metro_query(bb: str) -> str:
    return f"""[out:json][timeout:120];
(
  nwr["railway"="station"]["station"~"^(subway|light_rail)$"]({bb});
  nwr["railway"="station"]["subway"="yes"]({bb});
  nwr["public_transport"="station"]["subway"="yes"]({bb});
);
out center tags;"""


ROUTES_QUERY = """[out:json][timeout:180];
relation["route"="subway"]["network"="上海地铁"];
out;"""

ROUTE_NODES_QUERY = """[out:json][timeout:180];
relation["route"="subway"]["network"="上海地铁"];
node(r:"stop");
out;"""


def ask(query: str) -> dict:
    last: Exception | None = None
    for url in OVERPASS_URLS:
        try:
            resp = requests.post(url, data={'data': query}, timeout=200,
                                 headers={'User-Agent': USER_AGENT})
            if resp.status_code != 200:
                raise RuntimeError(f'HTTP {resp.status_code}')
            data = resp.json()
            if 'elements' not in data:
                raise RuntimeError('no elements in reply')
            return data
        except Exception as exc:  # noqa: BLE001 — try the next mirror
            last = exc
            print(f'  {url}: {exc}', file=sys.stderr)
            time.sleep(5)
    raise SystemExit(f'all Overpass mirrors failed: {last}')


def merge(replies: list[dict]) -> dict:
    seen: set[tuple[str, int]] = set()
    elements = []
    for reply in replies:
        for el in reply['elements']:
            key = (el['type'], el['id'])
            if key in seen:
                continue
            seen.add(key)
            elements.append(el)
    head = dict(replies[0])
    head['elements'] = elements
    return head


def fetch_tiled(make_query, name: str) -> None:
    replies = []
    for k, bb in enumerate(tiles()):
        print(f'{name}: tile {k + 1}/{len(tiles())} {bb}')
        replies.append(ask(make_query(bb)))
        time.sleep(PAUSE_S)
    data = merge(replies)
    (CACHE_DIR / name).write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    print(f'{name}: {len(data["elements"])} elements')


def fetch_routes() -> None:
    print('routes.json: city-wide subway route relations')
    routes = ask(ROUTES_QUERY)
    time.sleep(PAUSE_S)
    print('routenodes.json: their stop positions')
    nodes = ask(ROUTE_NODES_QUERY)
    (CACHE_DIR / 'routes.json').write_text(json.dumps(routes, ensure_ascii=False), encoding='utf-8')
    (CACHE_DIR / 'routenodes.json').write_text(json.dumps(nodes, ensure_ascii=False), encoding='utf-8')
    print(f'routes: {len(routes["elements"])} relations, {len(nodes["elements"])} stop nodes')


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    what = set(sys.argv[1:]) or {'cafes', 'metro', 'routes'}
    if 'cafes' in what:
        fetch_tiled(cafe_query, 'cafes.json')
        time.sleep(PAUSE_S)
    if 'metro' in what:
        fetch_tiled(metro_query, 'metro.json')
        time.sleep(PAUSE_S)
    if 'routes' in what:
        fetch_routes()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
