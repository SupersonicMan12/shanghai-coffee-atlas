#!/usr/bin/env python3
"""Append the metro stations that the wider sheet now covers to src/data/metro.ts.

Purely offline: reads tools/cache/osm/metro.json (station nodes on the sheet)
and routes.json / routenodes.json (city-wide subway route relations and their
stop positions, both from tools/osm_fetch.py), derives which lines call at
each station, and appends every station whose Chinese name is not already in
metro.ts before the closing bracket of METRO_STATIONS. Existing entries are
never touched — their ids are stable anchors in shared URLs.

Rules, so the output can be audited:
* stations tagged as under construction (…（在建）) are skipped;
* several OSM elements with the same name within 600 m are one station
  (nodes are preferred over way/relation centres; the first one is kept);
* a line calls at a station when one of that route's stop positions lies
  within 250 m; only lines listed in METRO_LINES are kept, and a station
  with no such line is skipped;
* ids follow the existing convention: "North Zhongshan Road" → zhongshan-rd-n.

Usage:
    python3 tools/build_metro.py
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OSM = ROOT / 'tools' / 'cache' / 'osm'
METRO_TS = ROOT / 'src' / 'data' / 'metro.ts'

MERGE_M = 600.0
STOP_M = 250.0


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def slug(name_en: str) -> str:
    s = name_en.strip()
    m = re.match(r'^(North|South|East|West|Middle)\s+(.+)$', s)
    if m:
        s = f'{m.group(2)} {m.group(1)[0]}'
    s = re.sub(r'\bRoad\b', 'Rd', s)
    s = re.sub(r'\bAvenue\b', 'Ave', s)
    s = re.sub(r'\bHighway\b', 'Hwy', s)
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return s or 'station'


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")


def load(name: str) -> list[dict]:
    return json.loads((OSM / name).read_text(encoding='utf-8'))['elements']


def main() -> int:
    ts = METRO_TS.read_text(encoding='utf-8')
    have_zh = set(re.findall(r"nameZh: '((?:[^'\\]|\\.)*)'", ts))
    have_id = set(re.findall(r"id: '([^']+)'", ts))
    lines_ok = {int(x) for x in re.search(r'METRO_LINES = \[([^\]]*)\]', ts).group(1).split(',') if x.strip()}

    # line number -> stop node positions
    node_pos = {n['id']: (n['lat'], n['lon']) for n in load('routenodes.json') if 'lat' in n}
    stops_by_line: dict[int, list[tuple[float, float]]] = {}
    for rel in load('routes.json'):
        m = re.match(r'(\d+)号线', rel.get('tags', {}).get('name', ''))
        if not m:
            continue
        line = int(m.group(1))
        for mem in rel.get('members', []):
            if mem.get('type') == 'node' and mem.get('ref') in node_pos:
                stops_by_line.setdefault(line, []).append(node_pos[mem['ref']])

    # merge same-name nodes
    stations: list[dict] = []
    order = {'node': 0, 'way': 1, 'relation': 2}
    for el in sorted(load('metro.json'), key=lambda e: (order.get(e['type'], 9), e['id'])):
        tags = el.get('tags', {})
        zh = tags.get('name', '')
        lat = el.get('lat') or (el.get('center') or {}).get('lat')
        lon = el.get('lon') or (el.get('center') or {}).get('lon')
        if not zh or lat is None or lon is None:
            continue
        if '在建' in zh or 'construction' in tags.get('name:en', '').lower() \
                or tags.get('railway') == 'proposed' or tags.get('railway') == 'construction':
            continue
        dup = next((s for s in stations if s['nameZh'] == zh
                    and haversine_m(s['lat'], s['lng'], lat, lon) < MERGE_M), None)
        if dup:
            continue
        stations.append({
            'nameZh': zh,
            'name': tags.get('name:en') or zh,
            'lat': round(lat, 5), 'lng': round(lon, 5),
        })

    added = []
    for s in stations:
        if s['nameZh'] in have_zh:
            continue
        lines = sorted(
            line for line, stops in stops_by_line.items()
            if line in lines_ok and any(haversine_m(s['lat'], s['lng'], a, b) < STOP_M for a, b in stops)
        )
        if not lines:
            continue
        base = slug(s['name'])
        sid, i = base, 2
        while sid in have_id:
            sid = f'{base}-{i}'
            i += 1
        have_id.add(sid)
        s['id'], s['lines'] = sid, lines
        added.append(s)

    if not added:
        print('metro.ts already has every station on the sheet')
        return 0

    added.sort(key=lambda s: (s['lines'][0], s['lng']))
    block = ['  // Whole-city sheet (tools/build_metro.py): middle-ring and outer-cluster',
             '  // stations from OSM, lines from the subway route relations.']
    for s in added:
        block.append(
            f"  {{ id: '{s['id']}', name: '{esc(s['name'])}', nameZh: '{esc(s['nameZh'])}', "
            f"lines: [{', '.join(map(str, s['lines']))}], lng: {s['lng']}, lat: {s['lat']} }},")

    end = ts.index('\n]\n', ts.index('export const METRO_STATIONS'))
    ts = ts[:end] + '\n' + '\n'.join(block) + ts[end:]
    METRO_TS.write_text(ts, encoding='utf-8')
    print(f'appended {len(added)} stations to metro.ts')
    for s in added:
        print(f"  {s['nameZh']} ({s['name']}) lines {s['lines']}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
