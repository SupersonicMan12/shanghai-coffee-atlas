#!/usr/bin/env python3
"""Every branch of the big coffee chains → src/data/chains.json.

The importer (expand_atlas.py) caps each chain at a handful of branches so the
sheet stays about independents. This script publishes the rest, from the same
Amap discover cache (no API calls), as a separate lazy-loaded layer the reader
switches on. Rows carry register facts only (name, address, coordinates, hours,
rating, per-head cost); the brand-level compass prior lives in src/lib/chains.ts.

Branches already in cafes.ts (same Amap id, or same brand within 60 m) are
skipped, so the two files never show one shop twice. Output is deterministic.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import expand_atlas as ea  # noqa: E402
from expand_atlas import _harvest  # noqa: E402

OUT = ea.ROOT / 'public' / 'data' / 'chains.json'
META = ea.ROOT / 'src' / 'data' / 'chains.meta.json'

# brand key -> (pattern, EN name, id prefix); order matters (first match wins)
BRANDS: list[tuple[str, re.Pattern[str], str]] = [
    ('luckin', re.compile(r'瑞幸|luckin', re.I), 'Luckin Coffee'),
    ('cotti', re.compile(r'库迪|cotti', re.I), 'Cotti Coffee'),
    ('manner', re.compile(r'manner', re.I), 'Manner Coffee'),
    ('mstand', re.compile(r'm\s*stand', re.I), 'M Stand'),
    ('starbucks', re.compile(r'星巴克|starbucks', re.I), 'Starbucks'),
    ('tims', re.compile(r'tims|tim\s*hortons|天好咖啡', re.I), 'Tims'),
    ('costa', re.compile(r'costa', re.I), 'Costa Coffee'),
    ('peets', re.compile(r'皮爷|peet', re.I), "Peet's Coffee"),
]
# register entries that are not a counter you can walk up to
NOT_A_SHOP = re.compile(r'办公|总部|仓库|自提柜|售卖机|自动|无人|配送|外卖专|装修|筹备|暂未营业|即将开业|培训')
FIELDS = ['id', 'chain', 'name', 'nameZh', 'district', 'hood', 'street', 'streetZh',
          'lat', 'lng', 'opens', 'closes', 'amapId', 'rating', 'cost', 'openHours']


def brand_of(name: str) -> tuple[str, str] | None:
    for key, pat, en in BRANDS:
        if pat.search(name):
            return key, en
    return None


def load_pois(files: list[Path]) -> list[dict]:
    """expand_atlas.load_amap, but for the whole 0505xx café family: Amap files
    Starbucks under its own typecode 050501, which the 050500 filter drops."""
    seen: dict[str, dict] = {}
    for f in files:
        for poi in json.loads(f.read_text(encoding='utf-8')).get('pois', []):
            pid, name, loc = poi.get('id'), poi.get('name', ''), poi.get('location')
            if not pid or pid in seen or '0505' not in str(poi.get('typecode', '')):
                continue
            if ea.CLOSED.search(name) or not isinstance(loc, str) or ',' not in loc:
                continue
            district = ea.DISTRICTS.get(poi.get('adname', ''))
            if not district:
                continue
            glng, glat = (float(x) for x in loc.split(',')[:2])
            lng, lat = ea.gcj02_to_wgs84(glng, glat)
            if not (ea.inside_old_sheet(lat, lng) or ea.in_band(lat, lng)):
                continue
            biz = poi.get('biz_ext') or {}

            def scalar(v: object) -> str | None:
                return v if isinstance(v, str) and v.strip() else None

            seen[pid] = {
                'amapId': pid, 'raw': name, 'lng': round(lng, 5), 'lat': round(lat, 5), 'district': district,
                'address': poi.get('address') if isinstance(poi.get('address'), str) else '',
                'rating': scalar(biz.get('rating')), 'cost': scalar(biz.get('cost')),
                'openTime': scalar(biz.get('open_time')) or scalar(biz.get('opentime2')),
            }
    return list(seen.values())


def existing() -> list[dict]:
    src = ea.CAFES_TS.read_text(encoding='utf-8')
    out = []
    for block in re.finditer(r"\n\s*id:\s*'([^']+)',(.*?)\n\s*\}(?: as Cafe)?,", src, re.S):
        body = block.group(2)
        g = lambda p: (re.search(p, body) or [None, None])[1]  # noqa: E731
        lat, lng = g(r'\blat:\s*([-\d.]+)'), g(r'\blng:\s*([-\d.]+)')
        if not lat or not lng:
            continue
        out.append({
            'id': block.group(1), 'lat': float(lat), 'lng': float(lng),
            'name': (g(r"\bname:\s*'((?:[^'\\]|\\.)*)'") or '') + ' ' + (g(r"nameZh:\s*'((?:[^'\\]|\\.)*)'") or ''),
            'hood': (g(r"hood:\s*'((?:[^'\\]|\\.)*)'") or '').replace("\\'", "'"),
            'amapId': g(r"amap: \{\s*id: '([^']+)'"),
            'district': (g(r'''district:\s*["']([A-Za-z']+?)["'],''') or ''),
        })
    return out


def main() -> int:
    have = existing()
    have_amap = {c['amapId'] for c in have if c['amapId']}
    have_ids = {c['id'] for c in have}
    have_brand = [(brand_of(c['name']), c) for c in have]
    have_brand = [(b[0], c) for b, c in have_brand if b]

    files = sorted(ea.DISCOVER_DIR.glob('*.json'))
    fetched_at = max(json.loads(f.read_text(encoding='utf-8'))['fetchedAt'] for f in files)
    pois = load_pois(files)
    pois.sort(key=lambda c: c['amapId'])

    # coarse spatial hash (~110 m cells) for the 60 m same-brand dedupe and hood lookup
    def cell(lat: float, lng: float) -> tuple[int, int]:
        return int(lat * 1000), int(lng * 1000)

    grid: dict[tuple[int, int], list[tuple[str, float, float]]] = {}
    for b, c in have_brand:
        grid.setdefault(cell(c['lat'], c['lng']), []).append((b, c['lat'], c['lng']))

    def taken(b: str, lat: float, lng: float) -> bool:
        cy, cx = cell(lat, lng)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for ob, olat, olng in grid.get((cy + dy, cx + dx), []):
                    if ob == b and _harvest.haversine_m(lat, lng, olat, olng) < 60:
                        return True
        return False

    hood_src = [c for c in have if c['hood']]

    def hood_for(lat: float, lng: float, district: str) -> str:
        best, best_d = None, 2500.0
        for c in hood_src:
            if c['district'] != district or abs(c['lat'] - lat) > 0.03 or abs(c['lng'] - lng) > 0.03:
                continue
            d = _harvest.haversine_m(lat, lng, c['lat'], c['lng'])
            if d < best_d:
                best, best_d = c['hood'], d
        return best if best is not None else ea.HOOD_FALLBACK[district]

    rows: list[list] = []
    counts: dict[str, int] = {}
    skipped = {'in-atlas': 0, 'not-a-shop': 0, 'duplicate': 0}
    for c in pois:
        b = brand_of(c['raw'])
        if not b:
            continue
        key, en = b
        if NOT_A_SHOP.search(c['raw']):
            skipped['not-a-shop'] += 1
            continue
        if c['amapId'] in have_amap:
            skipped['in-atlas'] += 1
            continue
        if taken(key, c['lat'], c['lng']):
            skipped['duplicate'] += 1
            continue
        grid.setdefault(cell(c['lat'], c['lng']), []).append((key, c['lat'], c['lng']))
        _, _, branch = ea.split_name(c['raw'])
        ben = ea.branch_en(branch)
        street, street_zh = ea.parse_address(c['address'])
        base = ea.slugify(f'{key}-{ben or street or c["amapId"][-6:]}')[:48].strip('-')
        cid, i = base, 2
        while cid in have_ids:
            cid, i = f'{base}-{i}', i + 1
        have_ids.add(cid)
        hours = ea.parse_hours(c.get('openTime'))
        m = re.search(r'\d{1,2}:\d{2}-\d{1,2}:\d{2}', c.get('openTime') or '')
        rows.append([
            cid, key, f'{en} ({ben})' if ben else en, c['raw'].strip(),
            c['district'], hood_for(c['lat'], c['lng'], c['district']),
            street or '—', street_zh or '—', c['lat'], c['lng'],
            hours[0] if hours else None, hours[1] if hours else None,
            c['amapId'],
            float(c['rating']) if c.get('rating') else None,
            float(c['cost']) if c.get('cost') else None,
            m.group(0) if m else None,
        ])
        counts[key] = counts.get(key, 0) + 1

    rows.sort(key=lambda r: r[0])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'fetchedAt': fetched_at, 'fields': FIELDS, 'rows': rows},
                              ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    # src copy: counts the app shows before it fetches the file; public copy: for any other consumer
    meta = {'file': 'chains.json', 'fetchedAt': fetched_at, 'total': len(rows),
            'byBrand': dict(sorted(counts.items())), 'fields': FIELDS}
    for target in (META, OUT.with_name('chains.meta.json')):
        target.write_text(json.dumps(meta, indent=2) + '\n', encoding='utf-8')
    print(f'{len(rows)} chain branches → {OUT.relative_to(ea.ROOT)} ({OUT.stat().st_size // 1024} KB)')
    print('  ' + ', '.join(f'{k} {n}' for k, n in sorted(counts.items(), key=lambda kv: -kv[1])))
    print(f'  skipped: {skipped}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
