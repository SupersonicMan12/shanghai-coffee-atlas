"""Deterministic compass evidence: evidence caches → per-axis hints.

Every hint is a weighted mean of *readings*, and every reading is one fact a
reader can check: a structured field the photo pass confirmed (people on
laptops, a stand-up bar, a roaster), a quoted public snippet from the web
axes pass, or a listed number (Amap 人均, Dianping avg price, a menu price
in a photo). Nothing here is inferred from the café's archetype, tags, seat
guess or opening span — when no reading speaks for an axis, no hint is
produced and the app falls back to the editorial prior at low confidence.

    hint.value      = Σ w·v / Σ w
    hint.confidence = min(0.85, 0.3 + 0.2·Σ w)      (one firm reading → 0.5)
    hint.because    = the two heaviest readings, in words
"""

from __future__ import annotations

import re
import statistics

AXES = ('focus', 'energy', 'linger', 'adventure', 'spend')

SITE = {'sohu': '搜狐', 'dianping': '大众点评', 'xiaohongshu': '小红书', 'smartshanghai': 'SmartShanghai',
        'timeout': 'Time Out', 'thatsmags': "That's", 'douban': '豆瓣', 'zhihu': '知乎', 'weixin': '微信'}


def cost_to_spend(cost: float) -> int:
    # ¥ per head → 0..100 spend axis (everyday 15 ≈ 15, premium 100+ ≈ 90)
    pts = [(12, 8), (20, 18), (30, 32), (40, 46), (50, 58), (65, 70), (85, 82), (120, 92)]
    if cost <= pts[0][0]:
        return pts[0][1]
    for (c0, s0), (c1, s1) in zip(pts, pts[1:]):
        if cost <= c1:
            return round(s0 + (s1 - s0) * (cost - c0) / (c1 - c0))
    return 95


def reading(axis: str, value: int, weight: float, en: str, zh: str, evidence: str, url: str | None = None) -> dict:
    return {'axis': axis, 'value': value, 'weight': weight, 'en': en, 'zh': zh, 'evidence': evidence, 'url': url}


def site_of(url: str | None, site: str | None) -> str:
    if site and len(site) <= 12:
        return site
    host = (url or '').split('/')[2] if url and url.count('/') >= 2 else ''
    for key, name in SITE.items():
        if key in host:
            return name
    return host.removeprefix('www.') or 'web'


def from_vision(vis: dict) -> list[dict]:
    r: list[dict] = []
    if not vis or vis.get('promptVersion') is None:
        return r  # v1 vision files predate the structured room fields
    room, seats, crowd = vis.get('room'), vis.get('seats'), vis.get('crowd')
    if vis.get('laptops') is True:
        r.append(reading('focus', 78, 1.0, 'people working on laptops in the photos', '照片里有人在用电脑办公', 'photo'))
        r.append(reading('linger', 74, 0.6, 'people working on laptops in the photos', '照片里有人在用电脑办公', 'photo'))
        r.append(reading('energy', 32, 0.5, 'a laptop room in the photos', '照片里是办公氛围', 'photo'))
    if vis.get('sockets') is True:
        r.append(reading('focus', 70, 0.6, 'sockets by the seats', '座位旁可见插座', 'photo'))
        r.append(reading('linger', 70, 0.4, 'sockets by the seats', '座位旁可见插座', 'photo'))
    if room == 'bar' or seats == 'none':
        why_en, why_zh = ('stand-up bar, no seating', '站喝吧台，没有座位') if seats == 'none' else ('a stand-up bar counter', '吧台站喝店')
        r.append(reading('linger', 12, 1.0, why_en, why_zh, 'photo'))
        r.append(reading('focus', 15, 0.7, why_en, why_zh, 'photo'))
        r.append(reading('energy', 58, 0.4, why_en, why_zh, 'photo'))
    elif seats == 'few' or room == 'small':
        r.append(reading('linger', 38, 0.6, 'a small room with a few seats', '小店，座位不多', 'photo'))
    elif seats == 'many' or room == 'large':
        r.append(reading('linger', 72, 0.7, 'a big room with plenty of seats', '大空间，座位多', 'photo'))
    if room == 'courtyard':
        r.append(reading('linger', 74, 0.6, 'a courtyard to sit out in', '有院子可以坐', 'photo'))
    if room == 'mall':
        r.append(reading('energy', 60, 0.4, 'a mall unit', '商场内档口', 'photo'))
        r.append(reading('linger', 40, 0.3, 'a mall unit', '商场内档口', 'photo'))
    if vis.get('outdoor') is True:
        r.append(reading('linger', 62, 0.3, 'outdoor tables', '有室外座', 'photo'))
    if crowd == 'busy':
        r.append(reading('energy', 72, 0.7, 'a full room in the photos', '照片里客人很多', 'photo'))
    elif crowd == 'empty':
        r.append(reading('energy', 38, 0.3, 'an empty room in the photos', '照片里客人很少', 'photo'))
    if vis.get('roastingGear') is True:
        r.append(reading('adventure', 85, 1.0, 'a roaster on the premises', '店内有烘豆机', 'photo'))
    if vis.get('brewBar') is True:
        r.append(reading('adventure', 74, 0.9, 'a pour-over / siphon brew bar', '有手冲台或虹吸等器具', 'photo'))
    if vis.get('specialtyMenu') is True:
        r.append(reading('adventure', 70, 0.7, 'single-origin / pour-over on the menu', '菜单上有手冲、单品或特调', 'photo'))
    prices = [p for p in vis.get('menuPrices') or [] if 5 <= p <= 300]
    if len(prices) >= 2:
        med = statistics.median(prices)
        r.append(reading('spend', cost_to_spend(med), 0.7, f'menu prices around ¥{med:.0f}', f'菜单可见约 ¥{med:.0f} 一杯', 'photo'))
    return r


SUPPORT = {
    ('laptop', 'yes'): r'电脑|笔记本|办公|插座|充电|wi-?fi|无线|laptop|work|remote|插头',
    ('laptop', 'no'): r'不(能|可|欢迎|接受).{0,4}(电脑|办公|笔记本)|禁止.{0,4}(电脑|办公)|no laptop|laptop-?free',
    ('noise', 'quiet'): r'安静|静谧|清静|幽静|宁静|取静|不吵|安安静静|音乐声不大|quiet|hushed|calm|peaceful',
    ('noise', 'lively'): r'热闹|喧|吵|嘈杂|火爆|排队|人很多|人满|人潮|爆满|lively|busy|bustling|crowded|buzz',
    ('stay', 'long'): r'久坐|坐一下午|待一下午|一下午|整个下午|一整天|放空|消磨|待上|一坐就|久留|坐很久|待很久|坐着|linger|hours|afternoon|settle|停留|歇脚|休憩|发呆',
    ('stay', 'short'): r'外带|带走|站着|快取|窗口|无座|没有座位|不适合久坐|拥挤|很难.{0,6}坐|take-?away|to-?go|grab|standing|no seat',
    ('brew', 'yes'): r'手冲|单品|SOE|豆|烘焙|自烘|拼配|产地|特调|创意|冠军|filter|pour|single.origin|roast|espresso|brew|signature',
    ('brew', 'no'): r'连锁|只有|仅有|基础|美式和拿铁|chain|basic|standard',
}


def supported(question: str, a: dict) -> bool:
    """A web answer counts only when its own quote uses the vocabulary of that
    answer; a vibe piece about the street outside is not evidence about the room."""
    pat = SUPPORT.get((question, str(a.get('answer'))))
    quote = str(a.get('quote') or '')
    if question == 'noise' and re.search(r'(热闹|繁忙|安静|宁静).{0,4}(路|街|巷|弄)', quote):
        return False
    return bool(pat and re.search(pat, quote, re.I))


def from_web(web_axes: dict) -> list[dict]:
    r: list[dict] = []
    raw = (web_axes or {}).get('answers') or {}
    answers = {q: a for q, a in raw.items() if q == 'price' or supported(q, a)}

    def quoted(a: dict) -> tuple[str, str, str | None]:
        site = site_of(a.get('url'), a.get('site'))
        q = str(a.get('quote') or '').strip()[:40]
        return f'“{q}” — {site}', f'「{q}」— {site}', a.get('url')

    a = answers.get('laptop')
    if a:
        en, zh, url = quoted(a)
        r.append(reading('focus', 80 if a['answer'] == 'yes' else 20, 1.0, en, zh, 'web', url))
    a = answers.get('noise')
    if a:
        en, zh, url = quoted(a)
        quiet = a['answer'] == 'quiet'
        r.append(reading('energy', 25 if quiet else 78, 1.0, en, zh, 'web', url))
        r.append(reading('focus', 62 if quiet else 35, 0.4, en, zh, 'web', url))
    a = answers.get('stay')
    if a:
        en, zh, url = quoted(a)
        r.append(reading('linger', 80 if a['answer'] == 'long' else 18, 1.0, en, zh, 'web', url))
    a = answers.get('brew')
    if a:
        en, zh, url = quoted(a)
        r.append(reading('adventure', 78 if a['answer'] == 'yes' else 22, 1.0, en, zh, 'web', url))
    a = answers.get('price')
    if a and isinstance(a.get('value'), (int, float)) and 5 <= a['value'] <= 400:
        en, zh, url = quoted(a)
        r.append(reading('spend', cost_to_spend(float(a['value'])), 0.8, en, zh, 'web', url))
    return r


def from_listings(amap: dict, dianping: dict) -> list[dict]:
    r: list[dict] = []
    try:
        cost = float((amap or {}).get('cost') or 0)
    except (TypeError, ValueError):
        cost = 0
    if 5 <= cost <= 400:
        # 人均 at a restaurant that also pours coffee is a meal, not a cup
        is_cafe = '咖啡' in str(amap.get('type') or '') or '咖啡' in str(amap.get('name') or '')
        r.append(reading('spend', cost_to_spend(cost), 1.0 if is_cafe else 0.5,
                         f'Amap avg ¥{cost:.0f} per head' + ('' if is_cafe else ' (restaurant listing)'),
                         f'高德人均 ¥{cost:.0f}' + ('' if is_cafe else '（餐厅口径）'), 'amap'))
    try:
        dp = float((dianping or {}).get('avgPrice') or 0)
    except (TypeError, ValueError):
        dp = 0
    if 5 <= dp <= 400:
        r.append(reading('spend', cost_to_spend(dp), 1.0, f'Dianping avg ¥{dp:.0f} per head', f'点评人均 ¥{dp:.0f}', 'dianping'))
    return r


def derive(vis: dict, web_axes: dict, amap: dict, dianping: dict) -> dict[str, dict]:
    readings = from_vision(vis) + from_web(web_axes) + from_listings(amap, dianping)
    hints: dict[str, dict] = {}
    for axis in AXES:
        rs = sorted((x for x in readings if x['axis'] == axis), key=lambda x: -x['weight'])
        if not rs:
            continue
        w = sum(x['weight'] for x in rs)
        value = round(sum(x['weight'] * x['value'] for x in rs) / w)
        top = rs[:2]
        hint = {
            'value': max(0, min(100, value)),
            'confidence': round(min(0.85, 0.3 + 0.2 * w), 2),
            'because': '; '.join(x['en'] for x in top)[:160],
            'becauseZh': '；'.join(x['zh'] for x in top)[:80],
            'sources': list(dict.fromkeys(x['evidence'] for x in rs)),
        }
        hints[axis] = hint
    return hints


def seen_room(vis: dict) -> dict:
    """The structured photo readings worth shipping to the card."""
    if not vis or vis.get('promptVersion') is None:
        return {}
    out: dict = {}
    for k in ('room', 'seats', 'crowd'):
        if vis.get(k):
            out[k] = vis[k]
    for k in ('laptops', 'sockets', 'outdoor', 'roastingGear', 'brewBar'):
        if isinstance(vis.get(k), bool):
            out[k] = vis[k]
    return out
