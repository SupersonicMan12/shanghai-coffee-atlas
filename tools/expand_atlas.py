#!/usr/bin/env python3
"""Turn the discover caches (Amap grid sweep + OSM Overpass) into Cafe records.

Purely offline and deterministic: reads tools/cache/amap/discover/*.json and
tools/cache/osm/cafes.json, dedupes against the curated cafés already in
src/data/cafes.ts and among sources, generates conservative bulk-import
records, and rewrites the `// ── Imported coverage` section of cafes.ts.

The bulk-import heuristics, in one place so they can be audited:

* Coffee filter — Amap POIs arrive pre-typed 050500 (咖啡厅); tea-chain
  impostors (奶茶/新式茶饮 brands that Amap still types as café) are dropped
  unless the name itself says coffee. OSM elements must be amenity=cafe with
  cuisine~coffee_shop, shop=coffee, or a name that says coffee/咖啡.
* Datum — Amap locations are GCJ-02 and are converted to WGS-84 (iterative
  inverse of the standard transform) so they live on the same sheet as the
  OSM-sourced curated cafés.
* Dedupe — two records are the same shop when they sit within 60 m and their
  brand-stripped names are similar (ratio ≥ 0.66, or one contains the other).
  Curated cafés always win; Amap beats OSM (it carries signals).
* District — Amap adname; OSM points take the majority district of their 5
  nearest Amap POIs. Anything outside the seven atlas districts is dropped.
* Hood — nearest curated café's hood when one sits within 1.5 km, else a
  per-district catch-all ("Hongkou at large" etc.).
* Archetype — brand table for the big chains (Manner/Nowwa/Cotti/luckin →
  standing-bar, Starbucks/Tims/Costa → neighborhood, …), then name keywords
  (烘焙/roast → roastery, bake/面包 → bakery, 实验/lab → laboratory), default
  neighborhood.
* Axes — conservative priors per archetype (table below), spend nudged by the
  Amap 人均 cost band. Published to evidence.axes with confidence 0.20 and
  source 'editorial' so bulk imports render as the faintest ink on the map.
* Chain cap — brands with more branches than MAX_BRANCHES keep a deterministic
  farthest-point-sampled subset, so one delivery-coffee brand cannot flood the
  atlas.
* Import budget — the inner ring holds ~2,400 café-typed POIs; the atlas stays
  a readable sheet, not a phonebook. TARGET_IMPORT bounds the bulk import:
  capped chains and confirmed OSM shops enter first, then the remaining budget
  goes to independents in Amap-rating order (ties broken by POI id, so the
  selection is stable run-to-run). Everything else stays in the cache for the
  next expansion round.

Usage:
    python3 tools/expand_atlas.py
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

from pypinyin import Style, pinyin

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
DISCOVER_DIR = ROOT / 'tools' / 'cache' / 'amap' / 'discover'
OSM_CAFES = ROOT / 'tools' / 'cache' / 'osm' / 'cafes.json'

_spec = importlib.util.spec_from_file_location('amap_harvest', Path(__file__).parent / 'amap_harvest.py')
_harvest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_harvest)

MARKER = '// ── Imported coverage'

DISTRICTS = {
    '徐汇区': 'Xuhui', '静安区': "Jing'an", '黄浦区': 'Huangpu',
    '长宁区': 'Changning', '普陀区': 'Putuo', '虹口区': 'Hongkou',
    '浦东新区': 'Pudong',
}

HOOD_FALLBACK = {
    'Xuhui': 'Xuhui at large', "Jing'an": "Jing'an at large",
    'Huangpu': 'Huangpu at large', 'Changning': 'Changning at large',
    'Putuo': 'Putuo at large', 'Hongkou': 'Hongkou at large',
    'Pudong': 'Pudong at large',
}

TEA_IMPOSTORS = re.compile(
    r'奶茶|蜜雪冰城|霸王茶姬|喜茶|奈雪|沪上阿姨|茶百道|一点点|CoCo都可|古茗|柠季|茉酸奶|益禾堂',
    re.I)
SAYS_COFFEE = re.compile(r'咖啡|coffee|caf[eé]|espresso|latte|roast', re.I)

# brand pattern -> (canonical brand key, archetype, price 1..3)
CHAINS: list[tuple[re.Pattern[str], str, str, int]] = [
    (re.compile(r'瑞幸|luckin', re.I), 'luckin', 'standing-bar', 1),
    (re.compile(r'库迪|cotti', re.I), 'cotti', 'standing-bar', 1),
    (re.compile(r'挪瓦|nowwa', re.I), 'nowwa', 'standing-bar', 1),
    (re.compile(r'manner', re.I), 'manner', 'standing-bar', 1),
    (re.compile(r'm\s*stand', re.I), 'm-stand', 'standing-bar', 2),
    (re.compile(r'星巴克|starbucks', re.I), 'starbucks', 'neighborhood', 2),
    (re.compile(r'tims|天好咖啡', re.I), 'tims', 'neighborhood', 2),
    (re.compile(r'costa', re.I), 'costa', 'neighborhood', 2),
    (re.compile(r'皮爷|peet', re.I), 'peets', 'neighborhood', 2),
    (re.compile(r'seesaw', re.I), 'seesaw', 'roastery', 2),
    (re.compile(r'代数学家|algebraist', re.I), 'algebraist', 'standing-bar', 1),
    (re.compile(r'阿拉比卡|%\s*arabica|arabica', re.I), 'arabica', 'standing-bar', 3),
    (re.compile(r'鹰集|fisheye', re.I), 'fisheye', 'roastery', 2),
    (re.compile(r'麦隆|mellower', re.I), 'mellower', 'neighborhood', 2),
    (re.compile(r'太平洋咖啡|pacific coffee', re.I), 'pacific', 'neighborhood', 2),
    (re.compile(r'幸运咖', re.I), 'xingyunka', 'standing-bar', 1),
]
MAX_BRANCHES = 5
TARGET_IMPORT = 350
# OSM-only shops (the ones Amap misses) enter without ratings, so they get a
# bounded, geographically spread allocation instead of competing on rating.
OSM_CAP = 80

# Conservative axis priors per archetype: middle-of-the-road numbers that let
# the measured signals and future votes do the talking.
AXIS_PRIORS = {
    'standing-bar': dict(focus=25, energy=55, linger=20, adventure=30, spend=30),
    'roastery': dict(focus=45, energy=45, linger=50, adventure=55, spend=50),
    'bakery': dict(focus=30, energy=60, linger=45, adventure=30, spend=45),
    'laboratory': dict(focus=45, energy=40, linger=50, adventure=65, spend=55),
    'neighborhood': dict(focus=45, energy=48, linger=52, adventure=32, spend=40),
}
SEATS = {'standing-bar': 6, 'roastery': 28, 'bakery': 26, 'laboratory': 20, 'neighborhood': 22}
SIGNATURE = {
    'standing-bar': 'Espresso at the counter',
    'roastery': 'House-roasted pour-over',
    'bakery': 'Coffee and something from the oven',
    'laboratory': 'Rotating brew bar',
    'neighborhood': 'Flat white, no fuss',
}
ROAD_SUFFIX = [('大道', 'Ave'), ('高架路', 'Elevated Rd'), ('支路', 'Branch Rd'),
               ('中路', 'Middle Rd'), ('东路', 'East Rd'), ('西路', 'West Rd'),
               ('南路', 'S Rd'), ('北路', 'N Rd'), ('路', 'Rd'), ('街', 'St'), ('弄', 'Lane')]


def gcj02_to_wgs84(lng: float, lat: float) -> tuple[float, float]:
    """Iterative inverse of wgs84_to_gcj02 (converges to < 1e-7 deg)."""
    wlng, wlat = lng, lat
    for _ in range(6):
        glng, glat = _harvest.wgs84_to_gcj02(wlng, wlat)
        wlng += lng - glng
        wlat += lat - glat
    return wlng, wlat


def py(s: str) -> str:
    """Title-cased pinyin of a Chinese string, syllables joined."""
    return ''.join(p[0] for p in pinyin(s, style=Style.NORMAL)).title()


def zh_road_to_en(road: str) -> str:
    for zh, en in ROAD_SUFFIX:
        if road.endswith(zh):
            return f'{py(road[: -len(zh)])} {en}'
    return py(road)


def parse_address(addr: str) -> tuple[str, str]:
    """address → (street EN, street ZH). Keeps '<road><number>号' when present."""
    addr = re.sub(r'[（(].*?[)）]', '', addr or '').strip()
    m = re.match(r'(.+?(?:路|街|大道|弄))(\d+(?:-\d+)?)号?', addr)
    if m:
        road, num = m.group(1), m.group(2)
        return f'{zh_road_to_en(road)} {num}', f'{road}{num}号'
    if addr:
        short = addr[:18]
        return py(short), short
    return '', ''


CJK = re.compile(r'[\u4e00-\u9fff]')


def split_name(raw: str) -> tuple[str, str, str]:
    """Amap name → (EN name, ZH name, branch). '瑞幸咖啡(长清路店)' style."""
    m = re.search(r'[（(]([^（）()]*)[)）]\s*$', raw)
    branch = m.group(1).strip() if m else ''
    base = raw[: m.start()].strip() if m else raw.strip()
    latin = re.sub(r'\s+', ' ', CJK.sub(' ', base)).strip(' ·-—|')
    han = ''.join(CJK.findall(base))
    en = latin if len(latin) >= 3 else (py(han) if han else latin)
    zh = han if han else base
    return en or base, zh or base, branch


def branch_en(branch: str) -> str:
    b = re.sub(r'店$', '', branch)
    if not b:
        return ''
    for zh, en in ROAD_SUFFIX:
        if b.endswith(zh):
            return f'{py(b[: -len(zh)])} {en}'
    return py(b) if CJK.search(b) else b


def parse_hours(open_time: str | None) -> tuple[float, float] | None:
    if not open_time:
        return None
    m = re.search(r'(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})', open_time)
    if not m:
        return None
    opens = int(m.group(1)) + int(m.group(2)) / 60
    closes = int(m.group(3)) + int(m.group(4)) / 60
    if closes == 0:
        closes = 24
    return round(opens * 4) / 4, round(closes * 4) / 4


def chain_of(name: str) -> tuple[str, str, int] | None:
    for pat, key, archetype, price in CHAINS:
        if pat.search(name):
            return key, archetype, price
    return None


def archetype_of(name: str) -> str:
    c = chain_of(name)
    if c:
        return c[1]
    if re.search(r'烘焙|焙煎|roast', name, re.I):
        return 'roastery'
    if re.search(r'面包|bak(e|ery)|bread|croissant|貝果|贝果|bagel', name, re.I):
        return 'bakery'
    if re.search(r'实验|研究所|lab\b|laboratory', name, re.I):
        return 'laboratory'
    return 'neighborhood'


def norm_core(s: str) -> str:
    return _harvest.core_name(s) or _harvest.norm(s)


def same_shop(a_names: list[str], b_names: list[str]) -> bool:
    # two branches of the same chain within dedupe range are the same shop,
    # even when one source names it in English and the other in Chinese
    a_chain = next((chain_of(x) for x in a_names if x and chain_of(x)), None)
    b_chain = next((chain_of(y) for y in b_names if y and chain_of(y)), None)
    if a_chain and b_chain:
        return a_chain[0] == b_chain[0]
    for x in a_names:
        for y in b_names:
            nx, ny = norm_core(x), norm_core(y)
            if not nx or not ny:
                continue
            if min(len(nx), len(ny)) >= 3 and (nx in ny or ny in nx):
                return True
            if SequenceMatcher(None, nx, ny).ratio() >= 0.66:
                return True
    return False


def slugify(s: str) -> str:
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return s or 'cafe'


def load_amap() -> list[dict]:
    seen: dict[str, dict] = {}
    for f in sorted(DISCOVER_DIR.glob('*.json')):
        for poi in json.loads(f.read_text(encoding='utf-8')).get('pois', []):
            pid = poi.get('id')
            name = poi.get('name', '')
            if not pid or pid in seen:
                continue
            if '050500' not in str(poi.get('typecode', '')):
                continue
            if TEA_IMPOSTORS.search(name) and not SAYS_COFFEE.search(name):
                continue
            loc = poi.get('location')
            if not isinstance(loc, str) or ',' not in loc:
                continue
            district = DISTRICTS.get(poi.get('adname', ''))
            if not district:
                continue
            glng, glat = (float(x) for x in loc.split(',')[:2])
            lng, lat = gcj02_to_wgs84(glng, glat)
            biz = poi.get('biz_ext') or {}

            def scalar(v: object) -> str | None:
                return v if isinstance(v, str) and v.strip() else None

            seen[pid] = {
                'src': 'amap', 'amapId': pid, 'raw': name,
                'lng': round(lng, 5), 'lat': round(lat, 5),
                'district': district, 'address': poi.get('address') if isinstance(poi.get('address'), str) else '',
                'rating': scalar(biz.get('rating')), 'cost': scalar(biz.get('cost')),
                'openTime': scalar(biz.get('open_time')) or scalar(biz.get('opentime2')),
            }
    return list(seen.values())


def load_osm() -> list[dict]:
    out = []
    for el in json.loads(OSM_CAFES.read_text(encoding='utf-8')).get('elements', []):
        tags = el.get('tags') or {}
        name = tags.get('name') or tags.get('name:en') or tags.get('name:zh') or ''
        if not name:
            continue
        # Strict: only elements OSM itself marks as coffee shops. Name-only
        # matches are too often stale or tea houses wearing a latin name.
        coffee = (
            'coffee_shop' in (tags.get('cuisine') or '')
            or tags.get('shop') == 'coffee'
        )
        if not coffee:
            continue
        lat = el.get('lat') or (el.get('center') or {}).get('lat')
        lon = el.get('lon') or (el.get('center') or {}).get('lon')
        if lat is None or lon is None:
            continue
        out.append({
            'src': 'osm', 'osmId': f"{el['type']}/{el['id']}", 'raw': name,
            'nameEn': tags.get('name:en', ''), 'nameZh': tags.get('name:zh', ''),
            'lng': round(float(lon), 5), 'lat': round(float(lat), 5),
            'street': tags.get('addr:street', ''), 'housenumber': tags.get('addr:housenumber', ''),
            'openTime': tags.get('opening_hours', ''),
        })
    return out


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")


def fmt_hours(v: float) -> str:
    return str(int(v)) if v == int(v) else str(v)


def cafe_ts(c: dict) -> str:
    axes = c['axes']
    lines = [
        '  {',
        f"    id: '{esc(c['id'])}',",
        f"    name: '{esc(c['name'])}',",
        f"    nameZh: '{esc(c['nameZh'])}',",
        f"    district: {json.dumps(c['district']) if chr(39) in c['district'] else chr(39) + c['district'] + chr(39)},",
        f"    hood: '{esc(c['hood'])}',",
        f"    street: '{esc(c['street'])}',",
        f"    streetZh: '{esc(c['streetZh'])}',",
        f"    lat: {c['lat']},",
        f"    lng: {c['lng']},",
        f"    archetype: '{c['archetype']}',",
        f"    axes: {{ focus: {axes['focus']}, energy: {axes['energy']}, linger: {axes['linger']}, adventure: {axes['adventure']}, spend: {axes['spend']} }},",
        f"    tags: [{', '.join(chr(39) + t + chr(39) for t in c['tags'])}],",
        f"    signature: '{esc(c['signature'])}',",
        f"    note: '{esc(c['note'])}',",
        f"    opens: {fmt_hours(c['opens'])},",
        f"    closes: {fmt_hours(c['closes'])},",
        f"    seats: {c['seats']},",
        f"    price: {c['price']},",
        "    source: 'imported',",
        '    evidence: {',
        '      axes: {',
    ]
    for k in ('focus', 'energy', 'linger', 'adventure', 'spend'):
        lines.append(
            f"        {k}: {{ value: {axes[k]}, confidence: 0.2, sources: ['editorial'] }},")
    lines.append('      },')
    if c.get('amapId'):
        lines.append('      amap: {')
        lines.append(f"        id: '{esc(c['amapId'])}',")
        if c.get('rating'):
            lines.append(f"        rating: {float(c['rating'])},")
        if c.get('cost'):
            lines.append(f"        cost: {float(c['cost'])},")
        if c.get('openTime') and re.search(r'\d{1,2}:\d{2}-\d{1,2}:\d{2}', c['openTime']):
            m = re.search(r'\d{1,2}:\d{2}-\d{1,2}:\d{2}', c['openTime'])
            lines.append(f"        openHours: '{esc(m.group(0))}',")
        lines.append(f"        fetchedAt: '{c['fetchedAt']}',")
        lines.append('      },')
    lines.append('    },')
    lines.append('  },')
    return '\n'.join(lines)


def farthest_point_sample(items: list[dict], k: int) -> list[dict]:
    """Deterministic spread: start from the best-rated, greedily add the
    branch farthest from everything already kept."""
    if len(items) <= k:
        return items
    items = sorted(items, key=lambda c: (-(float(c['rating']) if c.get('rating') else 0),
                                         c.get('amapId') or c.get('osmId') or c['raw']))
    kept = [items[0]]
    rest = items[1:]
    while len(kept) < k and rest:
        best_i, best_d = 0, -1.0
        for i, cand in enumerate(rest):
            d = min(_harvest.haversine_m(cand['lat'], cand['lng'], s['lat'], s['lng']) for s in kept)
            if d > best_d:
                best_i, best_d = i, d
        kept.append(rest.pop(best_i))
    return kept


def main() -> int:
    src = CAFES_TS.read_text(encoding='utf-8')
    curated = _harvest.parse_cafes()
    curated_hoods: list[dict] = []
    for block in re.finditer(r"\n\s*id:\s*'([^']+)',(.*?)\n  \}", src, re.S):
        m = re.search(r"hood:\s*'((?:[^'\\]|\\.)*)'", block.group(2))
        lat = re.search(r'\blat:\s*([-\d.]+)', block.group(2))
        lng = re.search(r'\blng:\s*([-\d.]+)', block.group(2))
        if m and lat and lng:
            curated_hoods.append({'hood': m.group(1).replace("\\'", "'"),
                                  'lat': float(lat.group(1)), 'lng': float(lng.group(1))})

    amap = load_amap()
    osm = load_osm()
    fetched_at = max((json.loads(f.read_text(encoding='utf-8'))['fetchedAt']
                      for f in DISCOVER_DIR.glob('*.json')), default='')

    # -- dedupe: curated wins, then Amap, then OSM ---------------------------
    def near_curated(c: dict) -> bool:
        for cur in curated:
            if _harvest.haversine_m(c['lat'], c['lng'], cur['lat'], cur['lng']) < 60 \
                    and same_shop([c['raw'], c.get('nameEn', ''), c.get('nameZh', '')],
                                  [cur['name'], cur['nameZh']]):
                return True
        return False

    amap = [c for c in amap if not near_curated(c)]

    kept_amap: list[dict] = []
    for c in amap:
        dup = False
        for k in kept_amap:
            if _harvest.haversine_m(c['lat'], c['lng'], k['lat'], k['lng']) < 60 \
                    and same_shop([c['raw']], [k['raw']]):
                dup = True
                break
        if not dup:
            kept_amap.append(c)

    kept_osm: list[dict] = []
    for c in osm:
        if near_curated(c):
            continue
        names = [c['raw'], c.get('nameEn', ''), c.get('nameZh', '')]
        dup = False
        for k in kept_amap + kept_osm:
            if _harvest.haversine_m(c['lat'], c['lng'], k['lat'], k['lng']) < 60 \
                    and same_shop(names, [k['raw'], k.get('nameEn', ''), k.get('nameZh', '')]):
                dup = True
                break
        if not dup:
            kept_osm.append(c)

    # district for OSM points: majority of the 5 nearest Amap POIs
    for c in kept_osm:
        nearest = sorted(kept_amap, key=lambda a: _harvest.haversine_m(c['lat'], c['lng'], a['lat'], a['lng']))[:5]
        votes: dict[str, int] = {}
        for n in nearest:
            votes[n['district']] = votes.get(n['district'], 0) + 1
        c['district'] = max(votes, key=lambda d: votes[d]) if votes else ''
    kept_osm = [c for c in kept_osm if c['district']]
    kept_osm = farthest_point_sample(kept_osm, OSM_CAP)

    # chain cap
    by_chain: dict[str, list[dict]] = {}
    independents: list[dict] = []
    for c in kept_amap:
        ch = chain_of(c['raw'])
        if ch:
            by_chain.setdefault(ch[0], []).append(c)
        else:
            independents.append(c)
    chains: list[dict] = []
    for key in sorted(by_chain):
        chains.extend(farthest_point_sample(by_chain[key], MAX_BRANCHES))

    # independents fill whatever budget the chains and OSM shops leave over,
    # best-rated first (stable tie-break on POI id)
    budget = max(0, TARGET_IMPORT - len(chains) - len(kept_osm))
    independents.sort(key=lambda c: (-(float(c['rating']) if c.get('rating') else 0), c['amapId']))
    capped: list[dict] = independents[:budget] + chains

    # -- build records -------------------------------------------------------
    used_ids = {c['id'] for c in curated}
    records: list[dict] = []

    def hood_for(lat: float, lng: float, district: str) -> str:
        best, best_d = None, 1e12
        for h in curated_hoods:
            d = _harvest.haversine_m(lat, lng, h['lat'], h['lng'])
            if d < best_d:
                best, best_d = h['hood'], d
        return best if best is not None and best_d <= 1500 else HOOD_FALLBACK[district]

    def uid(base: str) -> str:
        cand, i = base, 2
        while cand in used_ids:
            cand = f'{base}-{i}'
            i += 1
        used_ids.add(cand)
        return cand

    for c in capped:
        en, zh, branch = split_name(c['raw'])
        street, street_zh = parse_address(c['address'])
        ben = branch_en(branch)
        name = f'{en} ({ben})' if ben and chain_of(c['raw']) else en
        name_zh = f'{zh}（{branch}）' if branch and chain_of(c['raw']) else zh
        if not CJK.search(name_zh):
            name_zh = f'{name_zh} 咖啡'
        archetype = archetype_of(c['raw'])
        ch = chain_of(c['raw'])
        axes = dict(AXIS_PRIORS[archetype])
        cost = float(c['cost']) if c.get('cost') else None
        price = 1 if cost is not None and cost <= 20 else 2 if cost is not None and cost <= 45 else 3 if cost is not None else (ch[2] if ch else 2)
        axes['spend'] = 25 if price == 1 else 45 if price == 2 else 65
        hours = parse_hours(c.get('openTime')) or (8, 20)
        records.append({
            'id': uid(slugify(f'{en}-{ben or street or c["amapId"][-4:]}')[:48]),
            'name': name, 'nameZh': name_zh,
            'district': c['district'],
            'hood': hood_for(c['lat'], c['lng'], c['district']),
            'street': street or '—', 'streetZh': street_zh or '—',
            'lat': c['lat'], 'lng': c['lng'],
            'archetype': archetype, 'axes': axes, 'tags': ['standing-only'] if archetype == 'standing-bar' else [],
            'signature': SIGNATURE[archetype],
            'note': 'Imported from the Amap POI register; not yet field-checked.',
            'opens': hours[0], 'closes': hours[1],
            'seats': SEATS[archetype], 'price': price,
            'amapId': c['amapId'], 'rating': c.get('rating'), 'cost': c.get('cost'),
            'openTime': c.get('openTime'), 'fetchedAt': fetched_at,
        })

    for c in kept_osm:
        en = c.get('nameEn') or (c['raw'] if not CJK.search(c['raw']) else py(c['raw']))
        zh = c.get('nameZh') or (c['raw'] if CJK.search(c['raw']) else f"{c['raw']} 咖啡")
        street_zh = c.get('street', '')
        street = zh_road_to_en(street_zh) if CJK.search(street_zh or '') else (street_zh or '')
        if c.get('housenumber'):
            street = f"{street} {c['housenumber']}".strip()
            street_zh = f"{street_zh}{c['housenumber']}号" if CJK.search(street_zh or '') else street
        archetype = archetype_of(c['raw'])
        axes = dict(AXIS_PRIORS[archetype])
        hours = parse_hours(c.get('openTime')) or (8, 20)
        records.append({
            'id': uid(slugify(f'{en}-osm')[:48]),
            'name': en, 'nameZh': zh,
            'district': c['district'],
            'hood': hood_for(c['lat'], c['lng'], c['district']),
            'street': street or '—', 'streetZh': street_zh or '—',
            'lat': c['lat'], 'lng': c['lng'],
            'archetype': archetype, 'axes': axes, 'tags': ['standing-only'] if archetype == 'standing-bar' else [],
            'signature': SIGNATURE[archetype],
            'note': 'Imported from OpenStreetMap; not yet field-checked.',
            'opens': hours[0], 'closes': hours[1],
            'seats': SEATS[archetype], 'price': 2,
        })

    records.sort(key=lambda r: (r['district'], r['hood'], r['name'].lower()))

    # -- write ---------------------------------------------------------------
    idx = src.find(MARKER)
    if idx != -1:
        head = src[: src.rfind('\n', 0, idx) + 1]
    else:
        tail_idx = src.rfind('\n]')
        head = src[:tail_idx] + '\n'
    body = f'  {MARKER} (generated by tools/expand_atlas.py) ' + '─' * 12 + '\n'
    body += '\n'.join(cafe_ts(r) for r in records)
    CAFES_TS.write_text(head + body + '\n]\n', encoding='utf-8')

    by_district: dict[str, int] = {}
    for r in records:
        by_district[r['district']] = by_district.get(r['district'], 0) + 1
    n_amap = sum(1 for r in records if r.get('amapId'))
    print(f'curated: {len(curated)}  imported: {len(records)} '
          f'(amap {n_amap}, osm {len(records) - n_amap})  total: {len(curated) + len(records)}')
    print('imported by district:', json.dumps(by_district, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
