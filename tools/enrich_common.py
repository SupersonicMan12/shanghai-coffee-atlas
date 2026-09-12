#!/usr/bin/env python3
"""Shared plumbing for the enrichment pipeline (tools/enrich_*.py, build_details.py).

The pipeline turns the raw caches (Amap detail, Dianping aggregates, the
curated editorial text) plus two model passes (vision over Amap photos, web
grounding via Qwen search) into evidence-backed, per-café traits — the
"unique attributes" the atlas shows instead of generic tags.

Everything here is offline except `dashscope_chat`. Keys come from the
environment only and are never written to disk.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CAFES_TS = ROOT / 'src' / 'data' / 'cafes.ts'
CACHE = ROOT / 'tools' / 'cache'
AMAP_DETAIL = CACHE / 'amap-detail'
DIANPING = CACHE / 'dianping'
VISION = CACHE / 'vision'
WEB = CACHE / 'web'
TRAITS = CACHE / 'traits'
DETAILS_JSON = ROOT / 'src' / 'data' / 'details.json'

DASHSCOPE_CHAT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
DASHSCOPE_GEN = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation'

# brand pattern -> canonical brand key. Branches of these share a brand-level
# web profile instead of one search per branch (results would be identical).
CHAINS: list[tuple[re.Pattern[str], str, str]] = [
    (re.compile(r'瑞幸|luckin|ruixing', re.I), 'luckin', '瑞幸咖啡 luckin'),
    (re.compile(r'库迪|cotti|kudi', re.I), 'cotti', '库迪咖啡 Cotti'),
    (re.compile(r'挪瓦|nowwa', re.I), 'nowwa', '挪瓦咖啡 NOWWA'),
    (re.compile(r'manner', re.I), 'manner', 'Manner Coffee 上海'),
    (re.compile(r'm\s*stand', re.I), 'm-stand', 'M Stand 咖啡'),
    (re.compile(r'星巴克|starbucks|xingbake', re.I), 'starbucks', '星巴克 上海 门店 特色'),
    (re.compile(r'tims|tim hortons|天好咖啡', re.I), 'tims', 'Tims 天好咖啡'),
    (re.compile(r'costa', re.I), 'costa', 'Costa Coffee 上海'),
    (re.compile(r'皮爷|peet', re.I), 'peets', "Peet's Coffee 皮爷咖啡"),
    (re.compile(r'seesaw', re.I), 'seesaw', 'Seesaw Coffee 上海'),
    (re.compile(r'代数学家|algebraist', re.I), 'algebraist', '代数学家咖啡 algebraist'),
    (re.compile(r'阿拉比卡|%\s*arabica|arabica', re.I), 'arabica', '% Arabica 上海'),
    (re.compile(r'鹰集|fisheye', re.I), 'fisheye', '鹰集咖啡 Fisheye'),
    (re.compile(r'麦隆|mellower', re.I), 'mellower', '麦隆咖啡 Mellower'),
    (re.compile(r'太平洋咖啡|pacific coffee', re.I), 'pacific', '太平洋咖啡 Pacific Coffee'),
    (re.compile(r'幸运咖', re.I), 'xingyunka', '幸运咖 蜜雪冰城'),
    (re.compile(r'85°?c|85度c', re.I), '85c', '85°C 咖啡'),
    (re.compile(r'blue bottle|蓝瓶', re.I), 'blue-bottle', 'Blue Bottle 上海'),
    (re.compile(r'一尺花园|yichihuayuan', re.I), 'yichihuayuan', '一尺花园 咖啡'),
    (re.compile(r'grid coffee', re.I), 'grid', 'Grid Coffee 上海'),
    (re.compile(r'peace\s*coffee|和平咖啡', re.I), 'peace', 'Peace Coffee 上海'),
    (re.compile(r'lavazza|拉瓦萨', re.I), 'lavazza', 'Lavazza 拉瓦萨 上海'),
    (re.compile(r'illy|意利', re.I), 'illy', 'illy caffè 上海'),
    (re.compile(r'wagas|沃歌斯', re.I), 'wagas', 'Wagas 上海'),
    (re.compile(r'baker\s*&\s*spice', re.I), 'baker-spice', 'Baker & Spice 上海'),
]


def chain_of(*names: str | None) -> tuple[str, str] | None:
    for n in names:
        if not n:
            continue
        for pat, key, query in CHAINS:
            if pat.search(n):
                return key, query
    return None


def _field(body: str, pattern: str, default: str = '') -> str:
    m = re.search(pattern, body)
    if not m:
        return default
    return next((g for g in m.groups() if g is not None), default)


def cafes() -> list[dict]:
    """Parse src/data/cafes.ts without a TS toolchain (the file is generated in a fixed shape)."""
    source = CAFES_TS.read_text(encoding='utf-8')
    result: list[dict] = []
    for chunk in source.split('\n  {\n    id: ')[1:]:
        header = chunk.split('\n  },', 1)[0]
        m = re.match(r"'([^']+)',\n", header)
        if not m:
            continue
        body = header
        amap = re.search(r"amap:\s*\{\s*id:\s*'([^']+)'", body, re.S)
        tags = re.search(r'tags:\s*\[([^\]]*)\]', body)
        result.append({
            'id': m.group(1),
            'name': _field(body, r"\n    name:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'nameZh': _field(body, r"nameZh:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'district': _field(body, r"district:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'hood': _field(body, r"hood:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'street': _field(body, r"\n    street:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'streetZh': _field(body, r"streetZh:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'lat': float(_field(body, r'lat:\s*([\d.]+)', '0')),
            'lng': float(_field(body, r'lng:\s*([\d.]+)', '0')),
            'archetype': _field(body, r"archetype:\s*'([^']*)'"),
            'axes': {k: int(v) for k, v in re.findall(r'(focus|energy|linger|adventure|spend):\s*(\d+)', body)[:5]},
            'tags': [t.strip().strip("'\"") for t in tags.group(1).split(',') if t.strip()] if tags else [],
            'signature': _field(body, r"signature:\s*(?:'([^']*)'|\"([^\"]*)\")"),
            'note': _field(body, r"note:\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\")"),
            'opens': float(_field(body, r'opens:\s*([\d.]+)', '0')),
            'closes': float(_field(body, r'closes:\s*([\d.]+)', '0')),
            'seats': int(_field(body, r'seats:\s*(\d+)', '0')),
            'price': int(_field(body, r'price:\s*([123])', '2')),
            'source': _field(body, r"source:\s*'([^']*)'", 'editorial'),
            'amapId': amap.group(1) if amap else None,
            'amapCost': float(_field(body, r'amap:\s*\{[^}]*?cost:\s*([\d.]+)', '0')) or None,
        })
    return result


def read_json(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return None


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def digest(obj) -> str:
    return hashlib.sha1(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode('utf-8')).hexdigest()[:12]


def dashscope_key() -> str:
    key = os.environ.get('DASHSCOPE_API_KEY')
    if not key:
        raise SystemExit('DASHSCOPE_API_KEY is required (read from the environment only)')
    return key


def dashscope_chat(model: str, messages: list[dict], *, json_mode: bool = True,
                   retries: int = 3, timeout: int = 150, extra: dict | None = None) -> str:
    """OpenAI-compatible chat call; returns the assistant text. Retries on transient errors."""
    body: dict = {'model': model, 'messages': messages}
    if json_mode:
        body['response_format'] = {'type': 'json_object'}
    if extra:
        body.update(extra)
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = requests.post(DASHSCOPE_CHAT, headers={'Authorization': f'Bearer {dashscope_key()}'},
                              json=body, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                raise RuntimeError(f'HTTP {r.status_code}: {r.text[:200]}')
            r.raise_for_status()
            return r.json()['choices'][0]['message']['content']
        except Exception as exc:  # noqa: BLE001 — resumable batch job, one failure must not stop it
            last = exc
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f'dashscope failed after {retries} attempts: {last}')


def dashscope_search(model: str, prompt: str, *, strategy: str = 'max', retries: int = 3,
                     timeout: int = 170) -> tuple[str, list[dict]]:
    """Qwen with the built-in web search plugin. Returns (text, search_results)."""
    body = {
        'model': model,
        'input': {'messages': [{'role': 'user', 'content': prompt}]},
        'parameters': {
            'enable_search': True,
            'result_format': 'message',
            'search_options': {
                'enable_source': True,
                'forced_search': True,
                'search_strategy': strategy,
                'enable_citation': True,
                'citation_format': '[ref_<number>]',
            },
        },
    }
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = requests.post(DASHSCOPE_GEN, headers={'Authorization': f'Bearer {dashscope_key()}',
                                                       'Content-Type': 'application/json'},
                              json=body, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                raise RuntimeError(f'HTTP {r.status_code}: {r.text[:200]}')
            r.raise_for_status()
            out = r.json()['output']
            text = out['choices'][0]['message']['content']
            results = (out.get('search_info') or {}).get('search_results') or []
            return text, results
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f'dashscope search failed after {retries} attempts: {last}')


def parse_json_object(text: str) -> dict:
    """Tolerant JSON extraction: strips ``` fences and leading prose."""
    t = text.strip()
    t = re.sub(r'^```(?:json)?\s*', '', t)
    t = re.sub(r'\s*```$', '', t)
    start = t.find('{')
    end = t.rfind('}')
    if start == -1 or end == -1:
        return {}
    try:
        obj = json.loads(t[start:end + 1])
    except json.JSONDecodeError:
        return {}
    return obj if isinstance(obj, dict) else {}


DAY_WORDS = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0}


def parse_weekly_hours(opentime2: str | None) -> list[dict] | None:
    """'周一至周六 08:00-22:30；周日 08:00-17:00' → [{day, open, close}] (day 0=Sun … 6=Sat).

    Returns None when the string cannot be parsed confidently (then the
    café's flat opens/closes stays authoritative).
    """
    if not opentime2:
        return None
    s = opentime2.replace('：', ':').replace('－', '-').replace('—', '-').replace('~', '-')
    if '24小时' in s:
        return [{'day': d, 'open': 0, 'close': 24} for d in range(7)]
    out: dict[int, tuple[float, float]] = {}
    segments: list[str] = []
    for part in re.split(r'[;；]\s*', s):
        if len(re.findall(r'\d{1,2}:\d{2}\s*-', part)) > 1:
            segments.extend(re.split(r'[,，]\s*(?=[周星期每])', part))
        else:
            segments.append(part)
    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        times = re.findall(r'(\d{1,2}):(\d{2})\s*-\s*(次日)?(\d{1,2}):(\d{2})', seg)
        if not times:
            if re.search(r'休息|闭店|不营业', seg):
                for d in _days_in(seg):
                    out[d] = (0, 0)
            continue
        # split shifts ('07:00-11:30,14:00-18:00') collapse to first open / last close
        h1, m1, _, _, _ = times[0]
        _, _, nextday, h2, m2 = times[-1]
        o = int(h1) + int(m1) / 60
        c = int(h2) + int(m2) / 60
        if nextday or c <= o:
            c += 24 if c <= o else 0
        c = min(c, 30)
        days = _days_in(seg) or list(range(7))
        for d in days:
            out[d] = (round(o * 4) / 4, round(c * 4) / 4)
    if not out:
        return None
    return [{'day': d, 'open': out[d][0], 'close': out[d][1]} for d in sorted(out)]


def _days_in(seg: str) -> list[int]:
    seg = seg.split(' ')[0] if re.search(r'\d{1,2}:\d{2}', seg) else seg
    head = re.split(r'\d{1,2}:\d{2}', seg)[0]
    if re.search(r'每天|每日|全周|周一至周日|周一到周日|星期一至星期日', head):
        return list(range(7))
    days: set[int] = set()
    for a, b in re.findall(r'[周星期]+([一二三四五六日天])[至到\-]+[周星期]*([一二三四五六日天])', head):
        da, db = DAY_WORDS[a], DAY_WORDS[b]
        da = 7 if da == 0 else da
        db = 7 if db == 0 else db
        rng = range(da, db + 1) if da <= db else list(range(da, 8)) + list(range(1, db + 1))
        days.update(0 if d == 7 else d for d in rng)
    stripped = re.sub(r'[周星期]+[一二三四五六日天][至到\-]+[周星期]*[一二三四五六日天]', '', head)
    for d in re.findall(r'[周星期]+([一二三四五六日天])', stripped):
        days.add(DAY_WORDS[d])
    return sorted(days)


def now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
