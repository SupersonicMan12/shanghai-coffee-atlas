#!/usr/bin/env python3
"""List café records whose name or Amap category looks like a non-café.

Read-only: prints candidates for human review before adding ids to
prune_noncafes.REMOVE.

Usage:
    python3 tools/audit_noncafes.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_common import CAFES_TS, ROOT  # noqa: E402

DETAIL_DIR = ROOT / 'tools' / 'cache' / 'amap-detail'

NAME_WORDS = re.compile(
    r'餐厅|餐馆|食堂|饭店|酒店|宾馆|酒馆|酒吧|清吧|烧烤|火锅|川菜|粤菜|日料|寿司|拉面|面馆|饺|米线|'
    r'披萨|pizza|burger|汉堡|牛排|steak|brunch|bistro|restaurant|kitchen|canteen|diner|grill|'
    r'wine|vino|cocktail|whisky|whiskey|beer|精酿|pub\b|tavern|lounge|ktv|棋牌|麻将|桌游|剧本|'
    r'茶楼|茶馆|茶室|奶茶|tea house|teahouse|甜品|dessert|蛋糕|烘焙|面包|bakery|boulangerie|patisserie|'
    r'花店|florist|书店|bookstore|理发|salon|美甲|nail|酒廊|hotel|民宿|hostel|inn\b|健身|gym|'
    r'ice cream|冰淇淋|gelato|juice|果汁|smoothie',
    re.I,
)
# Amap categories that are not 咖啡厅
TYPE_OK = re.compile(r'咖啡厅|咖啡')
TYPE_BAD = re.compile(
    r'中餐厅|外国餐厅|西餐厅|快餐厅|休闲餐饮场所;茶艺馆|酒吧|甜品店|糕饼店|冷饮店|茶艺馆|'
    r'住宿服务|购物服务|生活服务|体育休闲|风景名胜|商务住宅|科教文化|医疗保健'
)

src = CAFES_TS.read_text(encoding='utf-8')
rec_re = re.compile(
    r"\{\s*id:\s*'([^']+)',\s*name:\s*'((?:[^'\\]|\\.)*)',\s*nameZh:\s*'((?:[^'\\]|\\.)*)'",
    re.S,
)
rows = []
for m in rec_re.finditer(src):
    cid, name, name_zh = m.group(1), m.group(2), m.group(3)
    detail_path = DETAIL_DIR / f'{cid}.json'
    amap_type = amap_name = ''
    if detail_path.exists():
        d = json.loads(detail_path.read_text(encoding='utf-8'))
        if d.get('matched'):
            amap_type = d.get('type') or ''
            amap_name = d.get('name') or ''
    hay = f'{name} {name_zh} {amap_name}'
    name_hit = NAME_WORDS.search(hay)
    type_hit = bool(amap_type) and not TYPE_OK.search(amap_type) and TYPE_BAD.search(amap_type)
    if name_hit or type_hit:
        rows.append((cid, name, name_zh, amap_name, amap_type, name_hit.group(0) if name_hit else ''))

print(f'{len(rows)} candidates')
for r in rows:
    print(' | '.join(r))
