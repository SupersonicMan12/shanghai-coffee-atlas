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

import hashlib
import json
import os
import sys
import time
from pathlib import Path

import requests
from ring import SHEET_BBOX

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / 'tools' / 'cache' / 'osm'

# Whole-city sheet: S, W, N, E (matches build_basemap.BBOX plus a hair).
BBOX = SHEET_BBOX
TILES = (6, 6)

OVERPASS_URLS = [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
]
USER_AGENT = 'shanghai-coffee-atlas/1.0 (+https://github.com/SupersonicMan12/shanghai-coffee-atlas; osm cache refresh)'
PAUSE_S = 2.0
RETRY_BACKOFF_S = (20, 40)
TILE_CACHE_DIR = CACHE_DIR / '.tiles'


def tiles(bbox=BBOX, rows=TILES[0], cols=TILES[1]) -> list[str]:
    s, w, n, e = bbox
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


def atomic_json(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(tmp, path)


def query_hash(query: str) -> str:
    return hashlib.sha256(query.encode()).hexdigest()


def read_tile(path: Path, bbox: str, query: str) -> dict | None:
    if not path.exists():
        return None
    cached = json.loads(path.read_text(encoding='utf-8'))
    if cached.get('bbox') != bbox or cached.get('queryHash') != query_hash(query):
        return None
    return cached.get('reply')


def ask(query: str, label: str) -> dict:
    last: Exception | None = None
    for round_index in range(3):
        for url in OVERPASS_URLS:
            try:
                resp = requests.post(url, data={'data': query}, timeout=(10, 60),
                                     headers={'User-Agent': USER_AGENT})
                if resp.status_code != 200:
                    raise RuntimeError(f'HTTP {resp.status_code}')
                data = resp.json()
                if 'elements' not in data:
                    raise RuntimeError('no elements in reply')
                return data
            except Exception as exc:  # noqa: BLE001 — try the next mirror
                last = exc
                print(f'{label}: {url} round {round_index + 1}: {exc}', file=sys.stderr)
        if round_index < len(RETRY_BACKOFF_S):
            delay = RETRY_BACKOFF_S[round_index]
            print(f'{label}: retrying after {delay}s', file=sys.stderr)
            time.sleep(delay)
    raise SystemExit(f'{label}: all mirrors failed after 3 rounds: {last}')


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


def split_bbox(bb: str) -> list[str]:
    south, west, north, east = map(float, bb.split(','))
    mid_lat, mid_lng = (south + north) / 2, (west + east) / 2
    return [
        f'{south:.4f},{west:.4f},{mid_lat:.4f},{mid_lng:.4f}',
        f'{south:.4f},{mid_lng:.4f},{mid_lat:.4f},{east:.4f}',
        f'{mid_lat:.4f},{west:.4f},{north:.4f},{mid_lng:.4f}',
        f'{mid_lat:.4f},{mid_lng:.4f},{north:.4f},{east:.4f}',
    ]


def fetch_tiled(make_query, name: str, force=False) -> bool:
    bboxes = tiles()
    tile_dir = TILE_CACHE_DIR / Path(name).stem
    tile_dir.mkdir(parents=True, exist_ok=True)
    state_path = tile_dir / '_state.json'
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() \
        else {'failures': {}, 'splits': {}}

    def save_state() -> None:
        atomic_json(state_path, state)

    def fetch_one(bb: str, tile_id: str, depth: int = 0) -> dict | None:
        query = make_query(bb)
        path = tile_dir / f'{tile_id}.json'
        reply = None if force else read_tile(path, bb, query)
        if reply is not None:
            print(f'{name}: tile {tile_id} cached')
            return reply

        child_ids = state['splits'].get(tile_id)
        if child_ids:
            child_boxes = split_bbox(bb)
            children = [fetch_one(child_bb, child_id, depth + 1)
                        for child_bb, child_id in zip(child_boxes, child_ids)]
            if any(child is None for child in children):
                return None
            reply = merge(children)
            atomic_json(path, {'bbox': bb, 'queryHash': query_hash(query), 'reply': reply})
            return reply

        print(f'{name}: tile {tile_id} {bb}')
        try:
            reply = ask(query, f'{name} {tile_id}')
        except SystemExit:
            failures = state['failures'].get(tile_id, 0) + 1
            state['failures'][tile_id] = failures
            if failures >= 2 and depth < 2:
                child_boxes = split_bbox(bb)
                child_ids = [f'{tile_id}-{index}' for index in range(4)]
                state['splits'][tile_id] = child_ids
                save_state()
                print(f'{name}: splitting {tile_id} after {failures} failed fetches')
                children = [fetch_one(child_bb, child_id, depth + 1)
                            for child_bb, child_id in zip(child_boxes, child_ids)]
                if any(child is None for child in children):
                    return None
                reply = merge(children)
                atomic_json(path, {'bbox': bb, 'queryHash': query_hash(query), 'reply': reply})
                return reply
            save_state()
            print(f'{name}: tile {tile_id} remains pending after failed fetch {failures}',
                  file=sys.stderr)
            return None

        state['failures'].pop(tile_id, None)
        atomic_json(path, {'bbox': bb, 'queryHash': query_hash(query), 'reply': reply})
        save_state()
        time.sleep(PAUSE_S)
        return reply

    replies = []
    missing = []
    for k, bb in enumerate(bboxes):
        tile_id = f'r{k // TILES[1]:02d}c{k % TILES[1]:02d}'
        reply = fetch_one(bb, tile_id)
        if reply is None:
            missing.append(tile_id)
        else:
            replies.append(reply)
    if missing:
        print(f'{name}: {len(missing)} base tiles pending: {", ".join(missing)}', file=sys.stderr)
        return False
    data = merge(replies)
    atomic_json(CACHE_DIR / name, data)
    print(f'{name}: {len(data["elements"])} elements')
    return True


def fetch_routes(force=False) -> None:
    print('routes.json: city-wide subway route relations')
    routes = fetch_single('routes', 'relations', ROUTES_QUERY, force)
    time.sleep(PAUSE_S)
    print('routenodes.json: their stop positions')
    nodes = fetch_single('routes', 'nodes', ROUTE_NODES_QUERY, force)
    atomic_json(CACHE_DIR / 'routes.json', routes)
    atomic_json(CACHE_DIR / 'routenodes.json', nodes)
    print(f'routes: {len(routes["elements"])} relations, {len(nodes["elements"])} stop nodes')


def fetch_single(group: str, name: str, query: str, force=False) -> dict:
    path = TILE_CACHE_DIR / group / f'{name}.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    reply = None if force else read_tile(path, 'citywide', query)
    if reply is None:
        reply = ask(query, f'{group} {name}')
        atomic_json(path, {'bbox': 'citywide', 'queryHash': query_hash(query), 'reply': reply})
    else:
        print(f'{group} {name}: cached')
    return reply


def status() -> int:
    pending = False
    for name, query_fn in (('cafes.json', cafe_query), ('metro.json', metro_query)):
        tile_dir = TILE_CACHE_DIR / Path(name).stem
        state_path = tile_dir / '_state.json'
        state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() \
            else {'splits': {}}

        def missing_leaves(bb: str, tile_id: str) -> list[str]:
            query = query_fn(bb)
            if read_tile(tile_dir / f'{tile_id}.json', bb, query) is not None:
                return []
            child_ids = state.get('splits', {}).get(tile_id)
            if not child_ids:
                return [tile_id]
            return [
                missing
                for child_bb, child_id in zip(split_bbox(bb), child_ids)
                for missing in missing_leaves(child_bb, child_id)
            ]

        missing = []
        for index, bb in enumerate(tiles()):
            tile_id = f'r{index // TILES[1]:02d}c{index % TILES[1]:02d}'
            missing.extend(missing_leaves(bb, tile_id))
        print(f'{name} missing tiles: {missing}')
        pending |= bool(missing)

    for name, query in (('relations', ROUTES_QUERY), ('nodes', ROUTE_NODES_QUERY)):
        if read_tile(TILE_CACHE_DIR / 'routes' / f'{name}.json', 'citywide', query) is None:
            print(f'routes missing cache: {name}')
            pending = True
    return 1 if pending else 0


def main() -> int:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    args = [arg for arg in sys.argv[1:] if arg != '--force']
    force = '--force' in sys.argv[1:]
    if '--status' in args:
        return status()
    what = set(args) or {'cafes', 'metro', 'routes'}
    unknown = what - {'cafes', 'metro', 'routes'}
    if unknown:
        raise SystemExit(f'unknown layer(s): {", ".join(sorted(unknown))}')
    complete = True
    if 'cafes' in what:
        complete &= fetch_tiled(cafe_query, 'cafes.json', force=force)
        time.sleep(PAUSE_S)
    if 'metro' in what:
        complete &= fetch_tiled(metro_query, 'metro.json', force=force)
        time.sleep(PAUSE_S)
    if 'routes' in what:
        try:
            fetch_routes(force=force)
        except SystemExit as exc:
            print(exc, file=sys.stderr)
            complete = False
    return 0 if complete else 1


if __name__ == '__main__':
    raise SystemExit(main())
