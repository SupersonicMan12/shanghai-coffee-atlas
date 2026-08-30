#!/usr/bin/env python3
"""Discover every coffee shop inside the inner-ring bbox via Amap polygon search.

Adaptive grid sweep, cached and resumable:
- the bbox is cut into a coarse grid; any cell reporting more POIs than one
  cell can reliably page through (>80) is split into four and re-queried,
  recursively (a quadtree over the city centre)
- every finished cell is written to tools/cache/amap/discover/<cell>.json
  (all pages merged, raw POIs kept verbatim); cached cells are skipped on
  rerun, so re-running never re-spends quota
- on quota exhaustion (infocode 10003/10044/10014) the run stops gracefully
  and can simply be re-run later

Usage:
    AMAP_WEB_API_KEY=... python3 tools/amap_discover.py [--limit N]

The key is read from the environment only; it is never written to disk.
Coordinates in the cache are GCJ-02 (Amap's datum) — the importer converts
back to WGS-84.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / 'tools' / 'cache' / 'amap' / 'discover'

API_URL = 'https://restapi.amap.com/v3/place/polygon'
QUOTA_INFOCODES = {'10003', '10014', '10044'}

# Inner-ring core, WGS-84-ish (the ~500 m GCJ offset is absorbed by overlap).
BBOX = (121.400, 31.170, 121.550, 31.280)  # W, S, E, N
COLS, ROWS = 10, 9          # coarse grid ≈ 1.4 km × 1.4 km cells
SPLIT_THRESHOLD = 80        # subdivide when a cell claims more than this
MAX_PAGES = 4               # 25 per page → up to 100 POIs per leaf cell
MAX_DEPTH = 3


class QuotaExhausted(Exception):
    pass


def fetch_cell(key: str, w: float, s: float, e: float, n: float) -> tuple[int, list[dict]]:
    """Return (declared_count, pois) for one rectangle, paging as needed."""
    pois: list[dict] = []
    count = 0
    for page in range(1, MAX_PAGES + 1):
        resp = requests.get(API_URL, params={
            'key': key,
            'polygon': f'{w:.6f},{n:.6f}|{e:.6f},{s:.6f}',
            'types': '050500',
            'offset': 25,
            'page': page,
            'extensions': 'all',
        }, timeout=20)
        data = resp.json()
        infocode = str(data.get('infocode', ''))
        if infocode in QUOTA_INFOCODES:
            raise QuotaExhausted(infocode)
        if data.get('status') != '1':
            raise RuntimeError(f'API error infocode={infocode} info={data.get("info")}')
        count = int(data.get('count') or 0)
        batch = data.get('pois') or []
        pois.extend(batch)
        time.sleep(0.35)
        if len(batch) < 25:
            break
    return count, pois


def sweep(key: str, cell_id: str, w: float, s: float, e: float, n: float,
          depth: int, budget: list[int]) -> None:
    out = CACHE_DIR / f'{cell_id}.json'
    if out.exists():
        return
    if budget[0] <= 0:
        return
    budget[0] -= 1
    count, pois = fetch_cell(key, w, s, e, n)
    if count > SPLIT_THRESHOLD and depth < MAX_DEPTH:
        mx, my = (w + e) / 2, (s + n) / 2
        for suffix, box in (
            ('a', (w, s, mx, my)), ('b', (mx, s, e, my)),
            ('c', (w, my, mx, n)), ('d', (mx, my, e, n)),
        ):
            sweep(key, f'{cell_id}{suffix}', *box, depth + 1, budget)
        return
    out.write_text(json.dumps({
        'cell': cell_id,
        'bbox': {'w': w, 's': s, 'e': e, 'n': n},
        'declaredCount': count,
        'fetchedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'pois': pois,
    }, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{cell_id}: {len(pois)} pois (declared {count})')


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='max cell fetches this run (0 = unlimited)')
    args = ap.parse_args()

    key = os.environ.get('AMAP_WEB_API_KEY')
    if not key:
        print('AMAP_WEB_API_KEY is not set', file=sys.stderr)
        return 1

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    w0, s0, e0, n0 = BBOX
    dx, dy = (e0 - w0) / COLS, (n0 - s0) / ROWS
    budget = [args.limit if args.limit else 10 ** 9]
    try:
        for j in range(ROWS):
            for i in range(COLS):
                sweep(key, f'r{j:02d}c{i:02d}',
                      w0 + i * dx, s0 + j * dy, w0 + (i + 1) * dx, s0 + (j + 1) * dy,
                      0, budget)
    except QuotaExhausted as exc:
        print(f'quota exhausted (infocode {exc}), stopping — rerun later to resume')
        return 0
    except RuntimeError as exc:
        print(f'stopping: {exc}', file=sys.stderr)
        return 1
    done = len(list(CACHE_DIR.glob('*.json')))
    print(f'sweep complete: {done} leaf cells cached')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
