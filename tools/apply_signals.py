#!/usr/bin/env python3
"""Merge cached Amap signals (tools/cache/amap/*.json) into src/data/cafes.ts.

Purely offline and deterministic: reads the committed cache, recomputes the
best POI match with the same matcher the harvester uses, and patches each
café object's `evidence.amap` block in place. Editorial fields are never
touched. Safe to re-run; existing evidence.amap blocks are replaced.

Usage:
    python3 tools/apply_signals.py
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
CACHE_DIR = ROOT / 'tools' / 'cache' / 'amap'

_spec = importlib.util.spec_from_file_location('amap_harvest', Path(__file__).parent / 'amap_harvest.py')
_harvest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_harvest)


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")


def signals_block(match: dict, fetched_at: str, indent: str = '    ') -> str:
    biz = match.get('biz_ext') or {}

    def scalar(v: object) -> str | None:
        return v if isinstance(v, str) and v.strip() else None

    rating = scalar(biz.get('rating'))
    cost = scalar(biz.get('cost'))
    open_time = scalar(biz.get('open_time')) or scalar(biz.get('opentime2'))

    lines = [f"{indent}evidence: {{", f"{indent}  amap: {{"]
    lines.append(f"{indent}    id: '{esc(match['id'])}',")
    if rating is not None:
        lines.append(f"{indent}    rating: {float(rating)},")
    if cost is not None:
        lines.append(f"{indent}    cost: {float(cost)},")
    if open_time is not None:
        lines.append(f"{indent}    openHours: '{esc(open_time)}',")
    lines.append(f"{indent}    fetchedAt: '{esc(fetched_at)}',")
    lines.append(f"{indent}  }},")
    lines.append(f"{indent}}},")
    return '\n'.join(lines)


def main() -> int:
    src = CAFES_TS.read_text(encoding='utf-8')
    cafes = {c['id']: c for c in _harvest.parse_cafes()}

    applied = 0
    for cache_file in sorted(CACHE_DIR.glob('*.json')):
        record = json.loads(cache_file.read_text(encoding='utf-8'))
        cafe = cafes.get(record['cafeId'])
        if cafe is None:
            continue
        match = _harvest.pick_match(cafe, record['response'].get('pois') or [])
        if match is None:
            continue

        anchor = f"    id: '{cafe['id']}',\n"
        start = src.find(anchor)
        end = src.find('\n  },', start)
        if start == -1 or end == -1:
            print(f"warning: could not locate café block for {cafe['id']}", file=sys.stderr)
            continue
        body = src[start:end]
        ev = body.find('\n    evidence: {')
        if ev != -1:
            body = body[:ev]
        block = signals_block(match, record['fetchedAt'])
        src = src[:start] + body + '\n' + block.rstrip(',\n') + ',' + src[end:]
        applied += 1

    CAFES_TS.write_text(src, encoding='utf-8')
    print(f'applied evidence.amap to {applied} cafés')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
