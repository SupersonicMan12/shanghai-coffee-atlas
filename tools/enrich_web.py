#!/usr/bin/env python3
"""Web pass: public facts about a café, grounded by Qwen's built-in web search.

For every non-chain café (and once per chain brand) Qwen searches the open
web and returns only facts it can quote from a result — bean origin / own
roasting, signature drinks, view/light/orientation, seats & sockets,
laptop-friendliness, pets, late hours, the owner's story. Each fact keeps the
quoted snippet and the result it came from, so build_details.py can attach
`web` evidence with a URL and a modest confidence, and readers can check.

No page is scraped by us: the search plugin returns titles/snippets; we
never fetch Dianping/XHS pages or any review text.

Resumable: tools/cache/web/<cafe-id>.json and tools/cache/web/brand-<key>.json.
`--retry-empty` re-runs editorial cafés whose first pass found nothing, this
time with an English query (SmartShanghai / Time Out / That's cover many of
the curated independents that Chinese search buries under bean articles).

`--axes` runs the compass pass instead: one search per independent café
(chain branches are skipped — brand-level search only surfaces marketing copy)
that answers five fixed questions — laptops, noise, staying, brew
programme, 人均 — each only with a quoted snippet, into tools/cache/web-axes/.
build_details.py turns those into per-axis evidence with the quote as reason.

Usage:
    DASHSCOPE_API_KEY=... python3 tools/enrich_web.py [--limit N] [--model qwen-plus] [--brands-only] [--retry-empty] [--axes]
"""

from __future__ import annotations

import argparse
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_common import (CHAINS, WEB, WEB_AXES, cafes, chain_of, dashscope_search, now_iso,  # noqa: E402
                           parse_json_object, read_json, write_json)

PROMPT = """请联网搜索上海咖啡馆「{query}」，只根据检索到的公开网页标题和摘要，列出这家店**与众不同、对选店有用**的具体特点。
想要的类型：豆子（产地/自烘/浅烘深烘/特定豆种）、招牌饮品或食物、空间与视野（朝向/采光/窗景/河景/天台/院子/老房子）、座位与插座、适合办公或聊天、宠物、营业到几点、店主或品牌故事、价格特点。
每条必须能在某条搜索结果的标题或摘要中找到依据：给出 ref（该搜索结果的编号，整数）和 quote（原文片段 ≤40 字）。
不要写泛泛的评价（"环境好""咖啡好喝"），不要写无法从结果中证实的内容，不同店同名请确认是上海的这家（地址：{address}）。找不到就返回空数组。
输出 JSON：{{"facts":[{{"text":"中文事实 ≤40字","kind":"space|light|view|seating|sound|beans|drinks|food|people|time|story","ref":1,"quote":"..."}}]}}"""

BRAND_PROMPT = """请联网搜索咖啡连锁品牌「{query}」，只根据检索到的公开网页标题和摘要，列出这个品牌**区别于其他连锁**、对选店有用的具体特点：招牌饮品、豆子/烘焙、价格带与优惠（如自带杯减价）、门店形态（站喝小店/大店）、营业时间习惯、品牌来历。
每条给出 ref（搜索结果编号）和 quote（≤40 字）。不写泛泛评价，不编造。
输出 JSON：{{"facts":[{{"text":"中文事实 ≤40字","kind":"space|light|view|seating|sound|beans|drinks|food|people|time|story","ref":1,"quote":"..."}}]}}"""


PROMPT_EN = """Search the web for the Shanghai café "{query}" (address: {address}). Using only the titles and snippets of the
search results, list concrete, distinctive facts that would help someone decide whether to go: beans (origin / own roasting /
roast level), signature drinks or food, space and view (orientation, light, window view, river view, rooftop, courtyard,
heritage building), seats and sockets, laptop-friendliness, pets, late hours, the owner's story, price level.
Every fact must be traceable to one result: give ref (the result's integer index) and quote (≤40 characters of its
title or snippet). Skip vague praise ("great vibe", "good coffee") and anything the results do not support; make sure the
result is about this Shanghai café and not a namesake elsewhere. Return an empty array if nothing qualifies.
Output JSON, with text in Simplified Chinese:
{{"facts":[{{"text":"中文事实 ≤40字","kind":"space|light|view|seating|sound|beans|drinks|food|people|time|story","ref":1,"quote":"..."}}]}}"""

AXES_PROMPT = """请联网搜索上海咖啡馆「{query}」（地址：{address}），只根据检索到的公开网页标题和摘要，回答下面 5 个问题。
每个问题只有在某条搜索结果的标题或摘要里**明确写到**时才回答，并给出 ref（该结果编号，整数）和 quote（原文片段 ≤40 字）；写不到就填 null。不要根据店名、品牌印象或常识推断；同名店请确认是上海这家。只采用描述门店实际体验的内容（探店、点评、媒体报道），不采用品牌宣传稿、促销新闻、招聘或加盟信息。
1. laptop：适合带电脑办公吗？（有插座/Wi-Fi/很多人办公 → "yes"；明确不欢迎电脑/不能办公/座位极少 → "no"）
2. noise：安静还是热闹？（"quiet" / "lively"）
3. stay：适合久坐还是以外带、站喝为主？（"long" / "short"）
4. brew：有手冲/单品/自烘/SOE/特调等精品咖啡内容吗？（"yes"；明确只有基础款/以奶咖外卖为主 → "no"）
5. price：人均或一杯的价格（数字，元）
输出 JSON：
{{"laptop": {{"answer": "yes|no", "ref": 1, "quote": "..."}} | null,
 "noise": {{"answer": "quiet|lively", "ref": 1, "quote": "..."}} | null,
 "stay": {{"answer": "long|short", "ref": 1, "quote": "..."}} | null,
 "brew": {{"answer": "yes|no", "ref": 1, "quote": "..."}} | null,
 "price": {{"value": 38, "ref": 1, "quote": "..."}} | null}}"""

AXES_ANSWERS = {
    'laptop': {'yes', 'no'},
    'noise': {'quiet', 'lively'},
    'stay': {'long', 'short'},
    'brew': {'yes', 'no'},
}


def _result_for(ref, results: list[dict]) -> dict | None:
    by_index = {r.get('index'): r for r in results}
    if isinstance(ref, int):
        return by_index.get(ref)
    if isinstance(ref, str):
        m = re.search(r'\d+', ref)
        if m and int(m.group()) in by_index:
            return by_index[int(m.group())]
    return None


def clean_axes(obj: dict, results: list[dict]) -> dict:
    """Keep only answers that name a real result and quote it; the rest is absence."""
    out: dict = {}
    for q, allowed in AXES_ANSWERS.items():
        a = obj.get(q)
        if not isinstance(a, dict):
            continue
        hit = _result_for(a.get('ref'), results)
        quote = str(a.get('quote') or '').strip()
        answer = str(a.get('answer') or '').strip().lower()
        if hit and hit.get('url') and quote and answer in allowed:
            out[q] = {'answer': answer, 'quote': quote[:80], 'url': hit['url'],
                      'site': hit.get('site_name') or hit.get('title')}
    p = obj.get('price')
    if isinstance(p, dict):
        hit = _result_for(p.get('ref'), results)
        quote = str(p.get('quote') or '').strip()
        try:
            value = float(p.get('value'))
        except (TypeError, ValueError):
            value = 0
        if hit and hit.get('url') and quote and 5 <= value <= 400 and re.search(r'\d', quote):
            out['price'] = {'value': value, 'quote': quote[:80], 'url': hit['url'],
                            'site': hit.get('site_name') or hit.get('title')}
    return out


def run_axes(path: Path, prompt: str, model: str) -> int:
    try:
        text, results = dashscope_search(model, prompt)
    except Exception as exc:  # noqa: BLE001 — resumable
        print(f'{path.stem}: {exc}', file=sys.stderr)
        return -1
    answers = clean_axes(parse_json_object(text), results)
    write_json(path, {'answers': answers,
                      'results': [{k: r.get(k) for k in ('index', 'title', 'url', 'site_name')} for r in results],
                      'model': model, 'fetchedAt': now_iso()})
    print(f'{path.stem}: {len(answers)} answers', flush=True)
    return len(answers)


def main_axes(args) -> None:
    jobs: list[tuple[Path, str]] = []
    for cafe in cafes():
        if chain_of(cafe['name'], cafe['nameZh']):
            continue
        path = WEB_AXES / f"{cafe['id']}.json"
        if read_json(path) is not None:
            continue
        zh = cafe['nameZh'] if cafe['nameZh'] and cafe['nameZh'] != cafe['name'] else ''
        query = ' '.join(x for x in (cafe['nameZh'] or cafe['name'], cafe['name'] if zh else '', '咖啡') if x)
        jobs.append((path, AXES_PROMPT.format(query=query, address=cafe['streetZh'] or cafe['street'])))
    if args.limit:
        jobs = jobs[:args.limit]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda j: run_axes(j[0], j[1], args.model), jobs))
    done = sum(1 for r in results if r >= 0)
    print(f'web-axes done={done} failed={len(results) - done} answered={sum(1 for r in results if r > 0)}')


def clean_facts(obj: dict, results: list[dict]) -> list[dict]:
    by_index = {r.get('index'): r for r in results}
    by_title = {str(r.get('title') or '').strip(): r for r in results}
    out = []
    for f in obj.get('facts') or []:
        if not isinstance(f, dict) or not f.get('text'):
            continue
        ref = f.get('ref')
        hit = None
        if isinstance(ref, int):
            hit = by_index.get(ref)
        elif isinstance(ref, str):
            m = re.search(r'\d+', ref)
            hit = by_index.get(int(m.group())) if m and int(m.group()) in by_index else by_title.get(ref.strip())
        quote = str(f.get('quote') or '').strip()
        text = str(f['text']).strip()
        if not hit or not hit.get('url') or not quote or re.search(r'未(在|被|有|能|明确)?.{0,6}(提及|提到|找到|说明|证实)', text):
            continue
        out.append({
            'text': text[:60],
            'kind': f.get('kind') if f.get('kind') in {'space', 'light', 'view', 'seating', 'sound', 'beans',
                                                       'drinks', 'food', 'people', 'time', 'story'} else 'story',
            'quote': str(f.get('quote') or '').strip()[:80],
            'url': (hit or {}).get('url'),
            'site': (hit or {}).get('site_name') or (hit or {}).get('title'),
        })
    return out[:8]


def run(path: Path, prompt: str, model: str, retried: bool = False) -> int:
    try:
        text, results = dashscope_search(model, prompt)
    except Exception as exc:  # noqa: BLE001 — resumable
        print(f'{path.stem}: {exc}', file=sys.stderr)
        return -1
    facts = clean_facts(parse_json_object(text), results)
    rec = {'facts': facts, 'results': [{k: r.get(k) for k in ('index', 'title', 'url', 'site_name')} for r in results],
           'model': model, 'fetchedAt': now_iso()}
    if retried:
        rec['retriedEn'] = True
    write_json(path, rec)
    print(f'{path.stem}: {len(facts)} facts', flush=True)
    return len(facts)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--model', default='qwen-plus')
    ap.add_argument('--brands-only', action='store_true')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--retry-empty', action='store_true',
                    help='editorial cafés with a cached empty result: search again with an English query')
    ap.add_argument('--axes', action='store_true',
                    help='compass pass: five quoted yes/no answers per café into tools/cache/web-axes/')
    args = ap.parse_args()
    if args.axes:
        main_axes(args)
        return
    jobs: list[tuple[Path, str]] = []
    if args.retry_empty:
        for cafe in cafes():
            path = WEB / f"{cafe['id']}.json"
            cached = read_json(path)
            if cafe['source'] != 'editorial' or chain_of(cafe['name'], cafe['nameZh']) or cached is None:
                continue
            if cached.get('facts') or cached.get('retriedEn'):
                continue
            query = ' '.join(x for x in (cafe['name'], cafe['street'], 'Shanghai') if x)
            jobs.append((path, PROMPT_EN.format(query=query, address=cafe['streetZh'] or cafe['street'])))
        if args.limit:
            jobs = jobs[:args.limit]
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            results = list(pool.map(lambda j: run(j[0], j[1], args.model, retried=True), jobs))
        print(f"retry done={sum(1 for r in results if r >= 0)} found={sum(1 for r in results if r > 0)}")
        return
    for _, key, query in CHAINS:
        path = WEB / f'brand-{key}.json'
        if read_json(path) is None:
            jobs.append((path, BRAND_PROMPT.format(query=query)))
    if not args.brands_only:
        for cafe in cafes():
            if chain_of(cafe['name'], cafe['nameZh']):
                continue
            path = WEB / f"{cafe['id']}.json"
            if read_json(path) is not None:
                continue
            zh = cafe['nameZh'] if cafe['nameZh'] and cafe['nameZh'] != cafe['name'] else ''
            query = ' '.join(x for x in (cafe['nameZh'] or cafe['name'], cafe['name'] if zh else '', '咖啡') if x)
            jobs.append((path, PROMPT.format(query=query, address=cafe['streetZh'] or cafe['street'])))
    if args.limit:
        jobs = jobs[:args.limit]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda j: run(j[0], j[1], args.model), jobs))
    done = sum(1 for r in results if r >= 0)
    print(f'web done={done} failed={len(results) - done}')


if __name__ == '__main__':
    main()
