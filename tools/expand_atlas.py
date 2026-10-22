#!/usr/bin/env python3
"""Turn the discover caches (Amap grid sweep + OSM Overpass) into Cafe records.

Purely offline and deterministic: reads tools/cache/amap/discover/*.json and
tools/cache/osm/cafes.json, dedupes against the curated cafés already in
src/data/cafes.ts and among sources, generates conservative bulk-import
records, and by default writes only a trailing beyond-ring section.

The bulk-import heuristics, in one place so they can be audited:

* Coffee filter — Amap POIs arrive pre-typed 050500 (咖啡厅); tea-chain
  impostors (奶茶/新式茶饮 brands that Amap still types as café) are dropped
  unless the name itself says coffee. OSM elements must have cuisine=coffee_shop
  or shop=coffee.
* Datum — Amap locations are GCJ-02 and are converted to WGS-84 (iterative
  inverse of the standard transform) so they live on the same sheet as the
  OSM-sourced curated cafés.
* Dedupe — two records are the same shop when they sit within 60 m and their
  brand-stripped names are similar (ratio ≥ 0.66, or one contains the other).
  Curated cafés always win; Amap beats OSM (it carries signals).
* District — Amap adname; OSM points take the majority district of their 5
  nearest Amap POIs. Only mapped Shanghai districts enter the atlas.
* Hood — old-sheet records use curated cafés and HOOD_ZONES anchors. Band
  business areas drop a leading 上海/上海市, then map the longest matching
  suffix: 国际中央商务区/中央商务区/商务区 → Business District;
  工业园区/工业区/开发区/园区 → Industrial Park; 新城 → New Town;
  镇/街道/商圈 are removed. The core place's per-character pinyin is joined
  without spaces, so equivalent business-area variants share one readable hood.
* Archetype — brand table for the big chains (Manner/Nowwa/Cotti/luckin →
  standing-bar, Starbucks/Tims/Costa → neighborhood, …), then name keywords
  (烘焙/roast → roastery, bake/面包 → bakery, 实验/lab → laboratory), default
  neighborhood.
* Axes — conservative priors per archetype (table below), spend nudged by the
  Amap 人均 cost band. Published to evidence.axes with confidence 0.20 and
  source 'editorial' so bulk imports render as the faintest ink on the map.
* Chain cap — brands with more branches than MAX_BRANCHES keep a deterministic
  farthest-point-sampled subset. Stage 2 uses MAX_BRANCHES_BAND, seeded by
  previously imported band branches; OSM-mapped branches count too.
* Import budget — TARGET_IMPORT bounds stage 1; TARGET_IMPORT_BAND separately
  bounds stage 2. In each stage capped chains and OSM shops enter first, then
  independents are selected with HOOD_FLOOR representation and stable Amap
  rating order. Everything else stays in the cache for the next round.
* Re-runs — existing band records are admitted first so ids that people may
  have shared or stamped survive an expansion round. The existing imported
  coverage remains an immutable dedupe base during the default band-only run.

Usage:
    python3 tools/expand_atlas.py
    python3 tools/expand_atlas.py --rebuild-core

The default run only writes the trailing beyond-ring section. Rebuilding the
core pool can resurrect records removed by prune_noncafes.py; rerun that tool
after --rebuild-core.

Stage 1 stays inside the previously published sheet. Stage 2 adds up to 700
records from the 10 km outer-ring band, with its own chain and OSM caps.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

from pypinyin import Style, pinyin
from prune_noncafes import REMOVE
from ring import OLD_SHEET_BBOX, in_band

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
DISCOVER_DIR = ROOT / 'tools' / 'cache' / 'amap' / 'discover'
OSM_CAFES = ROOT / 'tools' / 'cache' / 'osm' / 'cafes.json'

_spec = importlib.util.spec_from_file_location('amap_harvest', Path(__file__).parent / 'amap_harvest.py')
_harvest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_harvest)

MARKER = '// ── Imported coverage'
BAND_MARKER = '// ── Imported coverage · beyond 外环'

DISTRICTS = {
    '徐汇区': 'Xuhui', '静安区': "Jing'an", '黄浦区': 'Huangpu',
    '长宁区': 'Changning', '普陀区': 'Putuo', '虹口区': 'Hongkou',
    '浦东新区': 'Pudong', '杨浦区': 'Yangpu', '闵行区': 'Minhang',
    '宝山区': 'Baoshan', '嘉定区': 'Jiading', '青浦区': 'Qingpu',
    '松江区': 'Songjiang', '奉贤区': 'Fengxian',
}
OLD_DISTRICTS = {
    'Xuhui', "Jing'an", 'Huangpu', 'Changning', 'Putuo', 'Hongkou',
    'Pudong', 'Yangpu', 'Minhang',
}

HOOD_FALLBACK = {
    'Xuhui': 'Xuhui at large', "Jing'an": "Jing'an at large",
    'Huangpu': 'Huangpu at large', 'Changning': 'Changning at large',
    'Putuo': 'Putuo at large', 'Hongkou': 'Hongkou at large',
    'Pudong': 'Pudong at large', 'Yangpu': 'Yangpu at large',
    'Minhang': 'Minhang at large',
    'Baoshan': 'Baoshan at large', 'Jiading': 'Jiading at large',
    'Qingpu': 'Qingpu at large', 'Songjiang': 'Songjiang at large',
    'Fengxian': 'Fengxian at large',
}

# Hood anchors for the parts of the sheet with no curated café to borrow a
# hood from: (hood, metro stations in src/data/metro.ts, radius m). A café
# takes the zone whose anchor station is nearest, if within that radius.
HOOD_ZONES: list[tuple[str, list[str], int]] = [
    # Yangpu
    ('Daxue Rd · Wujiaochang', ['江湾体育场', '五角场'], 1000),
    ('Fudan · Guoquan Rd', ['复旦大学', '国权路'], 800),
    ('Tongji · Anshan', ['同济大学', '鞍山新村'], 800),
    ('Changyang Creative Valley', ['江浦路', '江浦公园'], 900),
    ('Yangshupu Riverside', ['宁国路', '隆昌路'], 1100),
    ('Dabaishu', ['大柏树'], 900),
    ('Xinjiangwan', ['殷高东路'], 1200),
    # Hongkou north
    ('Lu Xun Park', ['虹口足球场'], 800),
    ('Quyang', ['曲阳路'], 900),
    # Pudong east / south
    ('Qiantan', ['东方体育中心'], 1500),
    ('Sanlin', ['三林', '三林东'], 1200),
    ('Century Park · Lianyang', ['世纪公园', '上海科技馆'], 1200),
    ('Huamu', ['花木路', '龙阳路'], 1000),
    ('Zhangjiang', ['张江高科', '金科路', '广兰路'], 1300),
    ('Beicai', ['北蔡'], 1000),
    ('Jinqiao · Biyun', ['金桥', '蓝天路', '金桥路'], 1200),
    ('Yuanshen · Minsheng Rd', ['源深体育中心', '民生路'], 900),
    # Xuhui south
    ('West Bund', ['云锦路', '龙耀路'], 1000),
    ('Shanghai South Station', ['上海南站'], 1000),
    ('Caohejing', ['漕河泾开发区', '桂林路'], 1000),
    ('Tianlin · Caobao Rd', ['漕宝路'], 900),
    # Changning west
    ('Gubei · Huangjincheng', ['水城路', '伊犁路'], 1000),
    ('Tianshan', ['威宁路'], 1000),
    ('Beixinjing', ['北新泾', '淞虹路'], 1200),
    ('Longbai · Zoo', ['龙柏新村', '上海动物园'], 1000),
    # Putuo / Jing'an north
    ('Changfeng', ['大渡河路', '长风公园'], 1200),
    ('Zhenru', ['真如', '铜川路'], 1200),
    ('Taopu', ['桃浦新村', '武威路'], 1000),
    ('Pengpu', ['彭浦新村', '汶水路', '共康路'], 1200),
    # Minhang edge
    ('Gumei', ['东兰路', '顾戴路'], 1000),
    ('Xinzhuang North', ['虹莘路'], 900),
]
METRO_TS = ROOT / 'src' / 'data' / 'metro.ts'


def load_zone_anchors() -> list[dict]:
    ts = METRO_TS.read_text(encoding='utf-8')
    pos = {m.group(1): (float(m.group(3)), float(m.group(2))) for m in re.finditer(
        r"nameZh: '((?:[^'\\]|\\.)*)', lines: \[[^\]]*\], lng: ([\d.]+), lat: ([\d.]+)", ts)}
    anchors = []
    for hood, stations, radius in HOOD_ZONES:
        for s in stations:
            if s not in pos:
                sys.exit(f'HOOD_ZONES: station {s!r} is not in metro.ts')
            anchors.append({'hood': hood, 'lat': pos[s][0], 'lng': pos[s][1], 'radius': radius})
    return anchors

TEA_IMPOSTORS = re.compile(
    r'奶茶|蜜雪冰城|霸王茶姬|喜茶|奈雪|沪上阿姨|茶百道|一点点|CoCo都可|古茗|柠季|茉酸奶|益禾堂',
    re.I)
SAYS_COFFEE = re.compile(r'咖啡|coffee|caf[eé]|espresso|latte|roast', re.I)
# Amap keeps closed shops in the register with a status suffix in the name
CLOSED = re.compile(r'暂停营业|已停业|已关闭|已闭店|停业中|已搬迁')

# brand pattern -> (canonical brand key, archetype, price 1..3)
CHAINS: list[tuple[re.Pattern[str], str, str, int]] = [
    (re.compile(r'瑞幸|luckin', re.I), 'luckin', 'standing-bar', 1),
    (re.compile(r'库迪|cotti', re.I), 'cotti', 'standing-bar', 1),
    (re.compile(r'挪瓦|nowwa', re.I), 'nowwa', 'standing-bar', 1),
    (re.compile(r'manner', re.I), 'manner', 'standing-bar', 1),
    (re.compile(r'm\s*stand', re.I), 'm-stand', 'standing-bar', 2),
    (re.compile(r'星巴克|starbucks', re.I), 'starbucks', 'neighborhood', 2),
    (re.compile(r'tims|tim\s*hortons|天好咖啡', re.I), 'tims', 'neighborhood', 2),
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
# any other name that shows up more than MAX_BRANCHES times on the sheet is
# a chain too (Wagas, 85°C, 一尺花园 …); filled in by main() from the candidate pool
GENERIC_CHAINS: dict[str, str] = {}
TARGET_IMPORT = 850
# every hood keeps at least this many of its best-rated independents before
# the city-wide rating order fills the rest of the budget
HOOD_FLOOR = 6
# OSM-only shops (the ones Amap misses) enter without ratings, so they get a
# bounded, geographically spread allocation instead of competing on rating.
OSM_CAP = 150
TARGET_IMPORT_BAND = 700
MAX_BRANCHES_BAND = 3
OSM_CAP_BAND = 60

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


BAND_HOOD_SUFFIXES = sorted([
    ('国际中央商务区', 'Business District'),
    ('中央商务区', 'Business District'),
    ('工业园区', 'Industrial Park'),
    ('商务区', 'Business District'),
    ('工业区', 'Industrial Park'),
    ('开发区', 'Industrial Park'),
    ('园区', 'Industrial Park'),
    ('新城', 'New Town'),
    ('街道', ''),
    ('商圈', ''),
    ('镇', ''),
], key=lambda item: len(item[0]), reverse=True)


def normalize_band_hood(area: str) -> str:
    core = re.sub(r'^上海(?:市)?', '', (area or '').strip())
    suffix_en = ''
    for suffix, english in BAND_HOOD_SUFFIXES:
        if core.endswith(suffix):
            core = core[:-len(suffix)]
            suffix_en = english
            break
    core_en = ''.join(py(core).split()) if core else ''
    return ' '.join(part for part in (core_en, suffix_en) if part)


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


def brand_key(name: str) -> str:
    """'Wagas(前滩太古里店)' / 'WAGAS' / 'Wagas 沃歌斯' → one key."""
    base = re.sub(r'[（(].*?[)）]', '', name).lower()
    base = re.sub(r'coffee|caf[eé]|roaster[sy]?|espresso|咖啡馆|咖啡店|咖啡', '', base)
    return re.sub(r'[^0-9a-z]+', '', base) + ''.join(CJK.findall(base))


def chain_of(name: str) -> tuple[str, str, int] | None:
    for pat, key, archetype, price in CHAINS:
        if pat.search(name):
            return key, archetype, price
    key = brand_key(name)
    if key in GENERIC_CHAINS:
        return GENERIC_CHAINS[key], 'neighborhood', 2
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


def inside_old_sheet(lat: float, lng: float) -> bool:
    south, west, north, east = OLD_SHEET_BBOX
    return south <= lat <= north and west <= lng <= east


def in_outer_band(lat: float, lng: float) -> bool:
    return not inside_old_sheet(lat, lng) and in_band(lat, lng)


def load_amap(files=None, districts=None, location_filter=None, raw_counts=None) -> list[dict]:
    seen: dict[str, dict] = {}
    files = sorted(files if files is not None else DISCOVER_DIR.glob('*.json'))
    raw_seen: set[str] = set()
    for f in files:
        for poi in json.loads(f.read_text(encoding='utf-8')).get('pois', []):
            pid = poi.get('id')
            name = poi.get('name', '')
            if not pid or pid in seen:
                continue
            if raw_counts is not None and pid not in raw_seen:
                raw_seen.add(pid)
                raw_location = poi.get('location')
                raw_district = DISTRICTS.get(poi.get('adname', ''))
                if isinstance(raw_location, str) and ',' in raw_location and raw_district:
                    raw_lng, raw_lat = (float(x) for x in raw_location.split(',')[:2])
                    raw_lng, raw_lat = gcj02_to_wgs84(raw_lng, raw_lat)
                    if (districts is None or raw_district in districts) and (
                        location_filter is None or location_filter(raw_lat, raw_lng)
                    ):
                        raw_counts[raw_district] = raw_counts.get(raw_district, 0) + 1
            if '050500' not in str(poi.get('typecode', '')):
                continue
            if TEA_IMPOSTORS.search(name) and not SAYS_COFFEE.search(name):
                continue
            if CLOSED.search(name):
                continue
            loc = poi.get('location')
            if not isinstance(loc, str) or ',' not in loc:
                continue
            district = DISTRICTS.get(poi.get('adname', ''))
            if not district or (districts is not None and district not in districts):
                continue
            glng, glat = (float(x) for x in loc.split(',')[:2])
            lng, lat = gcj02_to_wgs84(glng, glat)
            if location_filter is not None and not location_filter(lat, lng):
                continue
            biz = poi.get('biz_ext') or {}
            business_area = poi.get('business_area') or poi.get('business') or ''
            if isinstance(business_area, dict):
                business_area = business_area.get('name', '')
            if not isinstance(business_area, str):
                business_area = ''

            def scalar(v: object) -> str | None:
                return v if isinstance(v, str) and v.strip() else None

            seen[pid] = {
                'src': 'amap', 'amapId': pid, 'raw': name,
                'lng': round(lng, 5), 'lat': round(lat, 5),
                'district': district, 'address': poi.get('address') if isinstance(poi.get('address'), str) else '',
                'rating': scalar(biz.get('rating')), 'cost': scalar(biz.get('cost')),
                'openTime': scalar(biz.get('open_time')) or scalar(biz.get('opentime2')),
                'businessArea': business_area,
            }
    return list(seen.values())


def load_osm(location_filter=None) -> list[dict]:
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
        lat, lon = float(lat), float(lon)
        if location_filter is not None and not location_filter(lat, lon):
            continue
        out.append({
            'src': 'osm', 'osmId': f"{el['type']}/{el['id']}", 'raw': name,
            'nameEn': tags.get('name:en', ''), 'nameZh': tags.get('name:zh', ''),
            'lng': round(lon, 5), 'lat': round(lat, 5),
            'street': tags.get('addr:street', ''), 'housenumber': tags.get('addr:housenumber', ''),
            'openTime': tags.get('opening_hours', ''),
        })
    return out


def esc(s: str) -> str:
    return s.replace('\\', '\\\\').replace("'", "\\'")


def fmt_hours(v: float) -> str:
    return str(int(v)) if v == int(v) else str(v)


def cafe_ts(c: dict, type_assert=False) -> str:
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
    lines.append(f"  }}{' as Cafe' if type_assert else ''},")
    return '\n'.join(lines)


def farthest_point_sample(items: list[dict], k: int, seed: list[dict] | None = None) -> list[dict]:
    """Deterministic spread: start from the seed (or the best-rated), greedily
    add the branch farthest from everything already kept."""
    if len(items) <= k:
        return items
    items = sorted(items, key=lambda c: (-(float(c['rating']) if c.get('rating') else 0),
                                         c.get('amapId') or c.get('osmId') or c['raw']))
    seed = seed or []
    kept = list(seed) if seed else [items[0]]
    rest = [c for c in items if c not in kept]
    if len(kept) >= k:
        return kept
    while len(kept) < k and rest:
        best_i, best_d = 0, -1.0
        for i, cand in enumerate(rest):
            d = min(_harvest.haversine_m(cand['lat'], cand['lng'], s['lat'], s['lng']) for s in kept)
            if d > best_d:
                best_i, best_d = i, d
        kept.append(rest.pop(best_i))
    return kept


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--rebuild-core', action='store_true',
                        help='rebuild the old imported section; rerun prune_noncafes.py afterward')
    args = parser.parse_args()

    src = CAFES_TS.read_text(encoding='utf-8')
    marker_at = src.find(MARKER)
    band_marker_at = src.find(BAND_MARKER)
    core_end = band_marker_at if band_marker_at != -1 else len(src)
    curated_src = src if args.rebuild_core else src[:core_end]
    if args.rebuild_core and marker_at != -1:
        curated_src = src[:marker_at]
    curated = _harvest.parse_cafes(curated_src)
    imported_core = src[marker_at:core_end] if marker_at != -1 else ''
    prior_amap = set(re.findall(r"amap: \{\s*id: '([^']+)'", imported_core))
    prior_ids = {c['id'] for c in _harvest.parse_cafes(imported_core)}
    curated_hoods: list[dict] = []
    for block in re.finditer(r"\n\s*id:\s*'([^']+)',(.*?)\n  \}", curated_src, re.S):
        m = re.search(r"hood:\s*'((?:[^'\\]|\\.)*)'", block.group(2))
        lat = re.search(r'\blat:\s*([-\d.]+)', block.group(2))
        lng = re.search(r'\blng:\s*([-\d.]+)', block.group(2))
        if m and lat and lng:
            curated_hoods.append({'hood': m.group(1).replace("\\'", "'"),
                                  'lat': float(lat.group(1)), 'lng': float(lng.group(1)), 'radius': 1500})
    hood_anchors = curated_hoods + load_zone_anchors()

    stage1_files = sorted([*DISCOVER_DIR.glob('r*.json'), *DISCOVER_DIR.glob('o*.json')]) \
        if args.rebuild_core else []
    stage1_amap = load_amap(stage1_files, OLD_DISTRICTS, inside_old_sheet) if args.rebuild_core else []
    stage1_amap_ids = {c['amapId'] for c in stage1_amap} if args.rebuild_core else set(prior_amap)
    amap = stage1_amap
    osm = load_osm(inside_old_sheet) if args.rebuild_core else []
    fetched_at = max((json.loads(f.read_text(encoding='utf-8'))['fetchedAt']
                      for f in stage1_files), default='')

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

    # chain cap — one pool per brand across both sources, so an OSM-mapped
    # Starbucks counts against the same MAX_BRANCHES as the Amap ones
    brand_count: dict[str, int] = {}
    for c in kept_amap + kept_osm:
        if not chain_of(c['raw']):
            k = brand_key(c['raw'])
            brand_count[k] = brand_count.get(k, 0) + 1
    GENERIC_CHAINS.update({k: f'brand:{k}' for k, n in brand_count.items() if k and n > MAX_BRANCHES})
    by_chain: dict[str, list[dict]] = {}
    independents: list[dict] = []
    osm_independents: list[dict] = []
    for c in kept_amap + kept_osm:
        ch = chain_of(c['raw'])
        if ch:
            by_chain.setdefault(ch[0], []).append(c)
        elif c['src'] == 'amap':
            independents.append(c)
        else:
            osm_independents.append(c)
    chains: list[dict] = []
    for key in sorted(by_chain):
        chains.extend(farthest_point_sample(by_chain[key], MAX_BRANCHES))

    for c in osm_independents:
        en = c.get('nameEn') or (c['raw'] if not CJK.search(c['raw']) else py(c['raw']))
        c['prior'] = slugify(f'{en}-osm')[:48] in prior_ids
    kept_osm = farthest_point_sample(osm_independents, OSM_CAP,
                                     seed=[c for c in osm_independents if c['prior']])
    kept_osm += [c for c in chains if c['src'] == 'osm']

    def hood_for(lat: float, lng: float, district: str) -> str:
        best, best_d = None, 1e12
        for h in hood_anchors:
            d = _harvest.haversine_m(lat, lng, h['lat'], h['lng'])
            if d < best_d and d <= h['radius']:
                best, best_d = h['hood'], d
        return best if best is not None else HOOD_FALLBACK[district]

    # independents fill whatever budget the chains and OSM shops leave over:
    # shops already on the sheet first, then the HOOD_FLOOR best-rated of
    # every hood (so the outer clusters get ink, not just the dense core),
    # then best-rated city-wide (stable tie-break on POI id)
    amap_chains = [c for c in chains if c['src'] == 'amap']
    budget = max(0, TARGET_IMPORT - len(amap_chains) - len(kept_osm))
    independents.sort(key=lambda c: (c['amapId'] not in prior_amap,
                                     -(float(c['rating']) if c.get('rating') else 0), c['amapId']))
    per_hood: dict[str, int] = {}
    floor: list[dict] = []
    rest: list[dict] = []
    for c in independents:
        c['hood'] = hood_for(c['lat'], c['lng'], c['district'])
        n = per_hood.get(c['hood'], 0)
        if c['amapId'] in prior_amap or n < HOOD_FLOOR:
            floor.append(c)
            per_hood[c['hood']] = n + 1
        else:
            rest.append(c)
    capped: list[dict] = (floor + rest)[:budget] + amap_chains
    stage1_candidates = capped + kept_osm

    # -- build records -------------------------------------------------------
    used_ids = {c['id'] for c in _harvest.parse_cafes(src)} if not args.rebuild_core \
        else {c['id'] for c in curated}
    records: list[dict] = []

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

    if not args.rebuild_core:
        band_files = sorted(DISCOVER_DIR.glob('x*.json'))
        raw_band_by_district: dict[str, int] = {}
        band_amap_all = load_amap(
            band_files, set(DISTRICTS.values()), in_outer_band, raw_band_by_district)
        band_amap = [c for c in band_amap_all if c['amapId'] not in stage1_amap_ids]
        band_amap_for_osm = band_amap

        def names_for(c: dict) -> list[str]:
            return [c.get('raw', ''), c.get('nameEn', ''), c.get('nameZh', '')]

        def near_entities(c: dict, entities: list[dict]) -> bool:
            for other in entities:
                if _harvest.haversine_m(c['lat'], c['lng'], other['lat'], other['lng']) < 60 \
                        and same_shop(names_for(c), names_for(other)):
                    return True
            return False

        filtered_amap_by_district: dict[str, int] = {}
        deduped_band_amap: list[dict] = []
        for c in band_amap:
            if near_curated(c) or near_entities(c, stage1_candidates) \
                    or near_entities(c, deduped_band_amap):
                continue
            deduped_band_amap.append(c)
            filtered_amap_by_district[c['district']] = (
                filtered_amap_by_district.get(c['district'], 0) + 1)
        band_amap = deduped_band_amap

        band_osm_all = load_osm(in_outer_band)
        for c in band_osm_all:
            nearest = sorted(
                band_amap_for_osm,
                key=lambda a: _harvest.haversine_m(
                    c['lat'], c['lng'], a['lat'], a['lng']),
            )[:5]
            votes: dict[str, int] = {}
            for nearest_poi in nearest:
                votes[nearest_poi['district']] = votes.get(nearest_poi['district'], 0) + 1
            c['district'] = max(votes, key=lambda d: votes[d]) if votes else ''
        band_osm_all = [c for c in band_osm_all if c['district']]
        raw_osm_by_district: dict[str, int] = {}
        for c in band_osm_all:
            raw_osm_by_district[c['district']] = raw_osm_by_district.get(c['district'], 0) + 1

        band_osm: list[dict] = []
        filtered_osm_by_district: dict[str, int] = {}
        for c in band_osm_all:
            if near_curated(c) or near_entities(c, stage1_candidates) \
                    or near_entities(c, band_amap) or near_entities(c, band_osm):
                continue
            band_osm.append(c)
            filtered_osm_by_district[c['district']] = (
                filtered_osm_by_district.get(c['district'], 0) + 1)

        prior_band_ids: set[str] = set()
        prior_band_amap: set[str] = set()
        prior_band_amap_ids: dict[str, str] = {}
        if band_marker_at != -1:
            imported_src = src[band_marker_at:]
            band_record_pattern = (
                r"(?m)^(?P<indent> *)\{\n(?P=indent)  id:\s*'(?P<id>[^']+)',"
                r"(?P<body>.*?)\n(?P=indent)\}(?: as Cafe)?"
            )
            for block in re.finditer(
                band_record_pattern, imported_src, re.S
            ):
                body = block.group('body')
                lat = re.search(r'\blat:\s*([-\d.]+)', body)
                lng = re.search(r'\blng:\s*([-\d.]+)', body)
                if not lat or not lng or not in_outer_band(float(lat.group(1)), float(lng.group(1))):
                    continue
                prior_band_ids.add(block.group('id'))
                amap_id = re.search(r"amap: \{\s*id: '([^']+)'", body)
                if amap_id:
                    prior_band_amap.add(amap_id.group(1))
                    prior_band_amap_ids[amap_id.group(1)] = block.group('id')

        for c in band_amap:
            c['prior'] = c['amapId'] in prior_band_amap
            c['priorId'] = prior_band_amap_ids.get(c['amapId'])
        for c in band_osm:
            en = c.get('nameEn') or (c['raw'] if not CJK.search(c['raw']) else py(c['raw']))
            prior_id = slugify(f'{en}-osm')[:48]
            c['priorId'] = prior_id if prior_id in prior_band_ids else None
            c['prior'] = c['priorId'] is not None

        brand_count_band: dict[str, int] = {}
        for c in band_amap + band_osm:
            if not chain_of(c['raw']):
                key = brand_key(c['raw'])
                brand_count_band[key] = brand_count_band.get(key, 0) + 1
        GENERIC_CHAINS.update({
            key: f'brand:{key}' for key, count in brand_count_band.items()
            if key and count > MAX_BRANCHES_BAND
        })

        by_chain_band: dict[str, list[dict]] = {}
        amap_independents_band: list[dict] = []
        osm_independents_band: list[dict] = []
        for c in band_amap + band_osm:
            chain = chain_of(c['raw'])
            if chain:
                by_chain_band.setdefault(chain[0], []).append(c)
            elif c['src'] == 'amap':
                amap_independents_band.append(c)
            else:
                osm_independents_band.append(c)
        band_candidate_pool_size = len(band_amap) + len(band_osm)
        osm_independent_pool_size = len(osm_independents_band)
        chains_band: list[dict] = []
        for key in sorted(by_chain_band):
            branches = by_chain_band[key]
            chains_band.extend(farthest_point_sample(
                branches, MAX_BRANCHES_BAND, [c for c in branches if c['prior']]))

        osm_independents_band = farthest_point_sample(
            osm_independents_band, OSM_CAP_BAND,
            seed=[c for c in osm_independents_band if c['prior']])
        osm_chains_band = [c for c in chains_band if c['src'] == 'osm']
        kept_osm_band = osm_independents_band + osm_chains_band

        def hood_for_band(lat: float, lng: float, district: str) -> str:
            best_area, best_distance = '', 1500.0
            for poi in band_amap_for_osm:
                if not poi.get('businessArea'):
                    continue
                distance = _harvest.haversine_m(lat, lng, poi['lat'], poi['lng'])
                if distance <= best_distance:
                    best_area, best_distance = poi['businessArea'], distance
            return normalize_band_hood(best_area) if best_area else HOOD_FALLBACK[district]

        amap_chains_band = [c for c in chains_band if c['src'] == 'amap']
        for c in amap_independents_band:
            c['hood'] = hood_for_band(c['lat'], c['lng'], c['district'])
        amap_independents_band.sort(key=lambda c: (
            not c['prior'], -(float(c['rating']) if c.get('rating') else 0), c['amapId']))
        per_hood_band: dict[str, int] = {}
        floor_band: list[dict] = []
        rest_band: list[dict] = []
        for c in amap_independents_band:
            n = per_hood_band.get(c['hood'], 0)
            if c['prior'] or n < HOOD_FLOOR:
                floor_band.append(c)
                per_hood_band[c['hood']] = n + 1
            else:
                rest_band.append(c)
        budget_band = max(
            0, TARGET_IMPORT_BAND - len(amap_chains_band) - len(kept_osm_band))
        selected_independents_band = (floor_band + rest_band)[:budget_band]
        capped_band = selected_independents_band + amap_chains_band
        budget_left_out = len(amap_independents_band) - len(selected_independents_band)

        band_fetched_at = max(
            (json.loads(f.read_text(encoding='utf-8'))['fetchedAt'] for f in band_files),
            default=fetched_at,
        )

        def unique_band_id(base: str, prior_id: str | None = None) -> str | None:
            if prior_id:
                candidate = prior_id
            else:
                candidate, suffix = base, 2
                while candidate in used_ids:
                    candidate = f'{base}-{suffix}'
                    suffix += 1
            if candidate in REMOVE:
                return None
            if not prior_id:
                used_ids.add(candidate)
            return candidate

        band_records: list[dict] = []
        for c in capped_band:
            en, zh, branch = split_name(c['raw'])
            street, street_zh = parse_address(c['address'])
            ben = branch_en(branch)
            name = f'{en} ({ben})' if ben and chain_of(c['raw']) else en
            name_zh = f'{zh}（{branch}）' if branch and chain_of(c['raw']) else zh
            if not CJK.search(name_zh):
                name_zh = f'{name_zh} 咖啡'
            archetype = archetype_of(c['raw'])
            chain = chain_of(c['raw'])
            axes = dict(AXIS_PRIORS[archetype])
            cost = float(c['cost']) if c.get('cost') else None
            price = 1 if cost is not None and cost <= 20 else 2 if cost is not None and cost <= 45 \
                else 3 if cost is not None else (chain[2] if chain else 2)
            axes['spend'] = 25 if price == 1 else 45 if price == 2 else 65
            hours = parse_hours(c.get('openTime')) or (8, 20)
            record_id = unique_band_id(
                slugify(f'{en}-{ben or street or c["amapId"][-4:]}')[:48],
                c.get('priorId'),
            )
            if record_id is None:
                continue
            band_records.append({
                'id': record_id,
                'name': name, 'nameZh': name_zh,
                'district': c['district'],
                'hood': normalize_band_hood(c['businessArea']) if c.get('businessArea') else
                    hood_for_band(c['lat'], c['lng'], c['district']),
                'street': street or '—', 'streetZh': street_zh or '—',
                'lat': c['lat'], 'lng': c['lng'],
                'archetype': archetype, 'axes': axes,
                'tags': ['standing-only'] if archetype == 'standing-bar' else [],
                'signature': SIGNATURE[archetype],
                'note': 'Imported from the Amap POI register; not yet field-checked.',
                'opens': hours[0], 'closes': hours[1],
                'seats': SEATS[archetype], 'price': price,
                'amapId': c['amapId'], 'rating': c.get('rating'), 'cost': c.get('cost'),
                'openTime': c.get('openTime'), 'fetchedAt': band_fetched_at,
            })

        for c in kept_osm_band:
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
            record_id = unique_band_id(slugify(f'{en}-osm')[:48], c.get('priorId'))
            if record_id is None:
                continue
            band_records.append({
                'id': record_id,
                'name': en, 'nameZh': zh,
                'district': c['district'],
                'hood': hood_for_band(c['lat'], c['lng'], c['district']),
                'street': street or '—', 'streetZh': street_zh or '—',
                'lat': c['lat'], 'lng': c['lng'],
                'archetype': archetype, 'axes': axes,
                'tags': ['standing-only'] if archetype == 'standing-bar' else [],
                'signature': SIGNATURE[archetype],
                'note': 'Imported from OpenStreetMap; not yet field-checked.',
                'opens': hours[0], 'closes': hours[1],
                'seats': SEATS[archetype], 'price': 2,
            })

        records.extend(band_records)
        raw_band_total = sum(raw_band_by_district.values()) + sum(raw_osm_by_district.values())
        filtered_amap_total = sum(filtered_amap_by_district.values())
        filtered_osm_total = sum(filtered_osm_by_district.values())
        print(f'band pool before filters: {raw_band_total} '
              f'(Amap {sum(raw_band_by_district.values())}, OSM {sum(raw_osm_by_district.values())}); '
              f'by district: {json.dumps({"Amap": raw_band_by_district, "OSM": raw_osm_by_district}, ensure_ascii=False)}')
        print(f'band pool after filters/dedupe: {filtered_amap_total + filtered_osm_total} '
              f'(Amap {filtered_amap_total}, OSM {filtered_osm_total})')
        print('band Amap after filters/dedupe by district:',
              json.dumps(filtered_amap_by_district, ensure_ascii=False))
        print('band OSM after filters/dedupe by district:',
              json.dumps(filtered_osm_by_district, ensure_ascii=False))
        selected_by_district: dict[str, int] = {}
        for record in band_records:
            selected_by_district[record['district']] = selected_by_district.get(record['district'], 0) + 1
        print('band selected by district:', json.dumps(selected_by_district, ensure_ascii=False))
        print('band selected chains/independents/OSM:',
              json.dumps({
                  'amap_chains': len(amap_chains_band),
                  'amap_independents': len(selected_independents_band),
                  'osm_chains': len(osm_chains_band),
                  'osm_independents': len(osm_independents_band),
              }, ensure_ascii=False))
        hoods: dict[str, int] = {}
        for record in band_records:
            hoods[record['hood']] = hoods.get(record['hood'], 0) + 1
        print('band top hoods:', json.dumps(
            sorted(hoods.items(), key=lambda item: (-item[1], item[0]))[:25],
            ensure_ascii=False))
        cap_excluded = band_candidate_pool_size - (
            len(chains_band) + len(amap_independents_band) + osm_independent_pool_size)
        print(f'band candidates left out by budget: {budget_left_out} Amap independents')
        print(f'band candidates left out by chain/OSM caps: {cap_excluded}; '
              f'total eligible but not selected: {band_candidate_pool_size - len(band_records)}')
        ratings = sorted(float(c['rating']) for c in selected_independents_band if c.get('rating'))
        if ratings:
            middle = len(ratings) // 2
            rating_median = ratings[middle] if len(ratings) % 2 else (
                ratings[middle - 1] + ratings[middle]) / 2
            print(f'band selected Amap independent ratings: n={len(ratings)}, '
                  f'min={ratings[0]:g}, median={rating_median:g}')
        else:
            print('band selected Amap independent ratings: none')

    records.sort(key=lambda r: (r['district'], r['hood'], r['name'].lower()))

    # -- write ---------------------------------------------------------------
    if args.rebuild_core:
        idx = src.find(MARKER)
        if idx != -1:
            head = src[: src.rfind('\n', 0, idx) + 1]
        else:
            tail_idx = src.rfind('\n]')
            head = src[:tail_idx] + '\n'
        body = f'  {MARKER} (generated by tools/expand_atlas.py) ' + '─' * 12 + '\n'
        body += '\n'.join(cafe_ts(r) for r in records)
        if band_marker_at != -1:
            closing = src.rfind('\n]')
            body += '\n'
            CAFES_TS.write_text(head + body + src[band_marker_at:closing] + src[closing:],
                                encoding='utf-8')
        else:
            CAFES_TS.write_text(head + body + '\n]\n', encoding='utf-8')
    else:
        closing = src.rfind('\n]')
        if closing == -1:
            raise RuntimeError('could not find CAFES array terminator')
        if band_marker_at != -1:
            line_start = src.rfind('\n', 0, band_marker_at) + 1
            if src[line_start:band_marker_at].strip():
                head = src[:band_marker_at]
                body_prefix = '\n'
            else:
                head = src[:line_start]
                body_prefix = ''
        else:
            head = src[:closing]
            body_prefix = '\n'
        tail = src[closing:]
        body = f'{body_prefix}  {BAND_MARKER}\n  ...[\n'
        body += '\n'.join(
            '\n'.join(f'  {line}' for line in cafe_ts(r, type_assert=True).splitlines())
            for r in records
        )
        body += '\n  ],\n'
        CAFES_TS.write_text(head + body + tail, encoding='utf-8')

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
