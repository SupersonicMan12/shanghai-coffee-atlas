#!/usr/bin/env python3
"""Vision pass: what can actually be *seen* in each café's Amap photos.

Qwen-VL looks at up to 4 photos per café and writes down only what is
visible: room type, seating, glass/light, outdoor tables, materials, whether
laptops are out, roasting gear, the drinks/food that show up. Each
observation carries the photo index and a 0..1 confidence, so the synthesis
step (build_details.py) can cite "photo" evidence honestly.

Resumable: tools/cache/vision/<cafe-id>.json, keyed by the photo-list digest
so a café is re-run only when its photos change.

Usage:
    DASHSCOPE_API_KEY=... python3 tools/enrich_vision.py [--limit N] [--model qwen3-vl-plus]
"""

from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from enrich_common import (AMAP_DETAIL, VISION, cafes, dashscope_chat, digest, now_iso,  # noqa: E402
                           parse_json_object, read_json, write_json)

MAX_PHOTOS = 4
# bump when the structured fields change so every café is looked at again
PROMPT_VERSION = 2

PROMPT = """这些是上海咖啡馆「{name_zh} / {name}」（{street_zh}）在高德地图上的照片，可能是店面、室内、饮品、食物或菜单。
请只记录照片里**能确定看到**、且对「要不要去这家店」有帮助的事实。不要推测看不见的东西，不要形容词堆砌；不要描述店招、logo、纸杯/纸袋印字、墙面颜色这类对选店无用的细节。

关注：空间大小与类型（吧台/小店/大空间/庭院/老洋房/商场内）、座位形式与数量级、窗与采光（落地窗/临街玻璃/朝向可见的话）、室外座、看得见的景（河/树/街道/天台）、装修材质与风格、是否有人在用电脑、是否有烘焙机/手冲台/虹吸/磨豆机等专业器具、书架/植物/宠物、明确出现的饮品与食物（如 dirty、燕麦拿铁、可颂、贝果、抹茶）、菜单上看得清的价格或豆子产地。

输出 JSON：
{{
  "photoKinds": ["storefront|interior|drink|food|menu|other", ...],   // 每张照片一个
  "observations": [
    {{"text": "一句中文事实（≤30字）", "kind": "space|light|view|seating|sound|beans|drinks|food|people|time|story", "photo": 1, "confidence": 0.9}}
  ],
  "room": "bar|small|medium|large|courtyard|mall|unknown",   // 吧台站喝 / 小店(≤约15座) / 中等 / 大空间 / 院子或大面积室外 / 商场内档口
  "seats": "none|few|some|many|unknown",
  "crowd": "empty|some|busy|unknown",   // 照片里客人多少（仅按看到的人）
  "laptops": true/false/null,           // 看到有人在用电脑
  "sockets": true/false/null,           // 看到座位旁有插座
  "outdoor": true/false/null,
  "bigWindows": true/false/null,
  "roastingGear": true/false/null,      // 烘豆机
  "brewBar": true/false/null,           // 手冲台/虹吸/多台磨豆机等精品器具
  "specialtyMenu": true/false/null,     // 菜单上看得清手冲/单品/SOE/产地/特调
  "menuPrices": [28, 35]                // 菜单上看得清的咖啡单价（元），没有就 []
}}
结构字段只填能从照片确认的；看不出就填 unknown / null / []，不要猜。observations 最多 8 条，按信息价值排序；不确定的用低 confidence 或不写。"""

ENUMS = {
    'room': {'bar', 'small', 'medium', 'large', 'courtyard', 'mall'},
    'seats': {'none', 'few', 'some', 'many'},
    'crowd': {'empty', 'some', 'busy'},
}
FLAGS = ('laptops', 'sockets', 'outdoor', 'bigWindows', 'roastingGear', 'brewBar', 'specialtyMenu')


def enum(obj: dict, key: str) -> str | None:
    v = obj.get(key)
    return v if isinstance(v, str) and v in ENUMS[key] else None


def flag(obj: dict, key: str) -> bool | None:
    v = obj.get(key)
    return v if isinstance(v, bool) else None


def prices(obj: dict) -> list[float]:
    out = []
    for p in obj.get('menuPrices') or []:
        try:
            v = float(p)
        except (TypeError, ValueError):
            continue
        if 5 <= v <= 300:
            out.append(v)
    return out[:12]


def look(cafe: dict, photos: list[str], key: str, model: str) -> int:
    content = [{'type': 'image_url', 'image_url': {'url': u}} for u in photos]
    content.append({'type': 'text', 'text': PROMPT.format(
        name_zh=cafe['nameZh'], name=cafe['name'], street_zh=cafe['streetZh'] or cafe['street'])})
    try:
        text = dashscope_chat(model, [{'role': 'user', 'content': content}], json_mode=False)
    except Exception as exc:  # noqa: BLE001 — resumable
        print(f"{cafe['id']}: {exc}", file=sys.stderr)
        return -1
    obj = parse_json_object(text)
    obs = [o for o in obj.get('observations') or [] if isinstance(o, dict) and o.get('text')]
    write_json(VISION / f"{cafe['id']}.json", {
        'cafeId': cafe['id'],
        'model': model,
        'inputDigest': key,
        'photos': photos,
        'photoKinds': obj.get('photoKinds') or [],
        'observations': obs[:8],
        'room': enum(obj, 'room'),
        'seats': enum(obj, 'seats'),
        'crowd': enum(obj, 'crowd'),
        **{k: flag(obj, k) for k in FLAGS},
        'menuPrices': prices(obj),
        'promptVersion': PROMPT_VERSION,
        'fetchedAt': now_iso(),
    })
    print(f"{cafe['id']}: {len(obs)} observations", flush=True)
    return len(obs)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--model', default='qwen3-vl-plus')
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()
    skipped = nophoto = 0
    jobs: list[tuple[dict, list[str], str]] = []
    for cafe in cafes():
        amap = read_json(AMAP_DETAIL / f"{cafe['id']}.json") or {}
        photos = [p for p in (amap.get('photos') or []) if isinstance(p, str)][:MAX_PHOTOS]
        if not photos:
            nophoto += 1
            continue
        key = digest([PROMPT_VERSION, photos])
        cached = read_json(VISION / f"{cafe['id']}.json")
        if cached and cached.get('inputDigest') == key:
            skipped += 1
            continue
        jobs.append((cafe, photos, key))
    if args.limit:
        jobs = jobs[:args.limit]
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda j: look(j[0], j[1], j[2], args.model), jobs))
    done = sum(1 for r in results if r >= 0)
    print(f'vision done={done} failed={len(results) - done} skipped={skipped} no-photos={nophoto}')


if __name__ == '__main__':
    main()
