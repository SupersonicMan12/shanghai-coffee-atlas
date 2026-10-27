#!/usr/bin/env python3
"""Turn raw Overpass dumps in tools/raw into a compact basemap for the atlas.

The atlas draws real Shanghai geometry (river, creek, parks, arterials, the
plane-tree lanes of the former French Concession, district outlines) and then
renders it with an ink-and-watercolour treatment in the browser. Keeping the
geometry real is the whole point: the art is a filter, not an invention.

Output: src/data/basemap.json  (lon/lat pairs, simplified, 5 dp)

Source data (c) OpenStreetMap contributors, ODbL.
"""

import json
import hashlib
import math
import os
import sys
import time
from ring import OLD_SHEET_BBOX, SHEET_BBOX

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "src", "data", "basemap.json")

BBOX = SHEET_BBOX  # S, W, N, E
# The old sheet remains detailed; outer coverage uses only large features.
OLD_SHEET = OLD_SHEET_BBOX
# The old inner-ring sheet; used to keep the denser layers (lanes, small
# parks, secondary roads) crisp there and lighter outside.
INNER = (31.162, 121.392, 31.287, 121.557)
PAUSE_S = 2.0
OLD_TILES = (2, 2)
BAND_TILES = (5, 6)
RETRY_BACKOFF_S = (20, 40)
USER_AGENT = "shanghai-coffee-atlas/1.1 (basemap builder; github.com/SupersonicMan12/shanghai-coffee-atlas)"
PARK_AREA_THRESHOLD = 1.5e-5  # deg², approximately 15 hectares
WATER_AREA_THRESHOLD = 5e-6  # retain larger outer-sheet water bodies

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
]


def tiles(bbox, rows, cols):
    s, w, n, e = bbox
    dh, dw = (n - s) / rows, (e - w) / cols
    return [
        f"{s + r * dh:.4f},{w + c * dw:.4f},{s + (r + 1) * dh:.4f},{w + (c + 1) * dw:.4f}"
        for r in range(rows) for c in range(cols)
    ]


def overpass_queries(bb):
    lanes = "|".join(LANE_NAMES)
    return {
        "water.json": f"""[out:json][timeout:180];
(
  nwr["natural"="water"]({bb});
  way["waterway"~"^(river|canal|stream)$"]({bb});
  relation["waterway"~"^(river|canal)$"]({bb});
);
out geom;""",
        "parks.json": f"""[out:json][timeout:180];
nwr["leisure"~"^(park|garden)$"]({bb});
out geom;""",
        "roads.json": f"""[out:json][timeout:180];
way["highway"~"^(motorway|trunk|primary|secondary)$"]({bb});
out geom;""",
        "lanes.json": f"""[out:json][timeout:180];
way["highway"]["name"~"^({lanes})$"]({bb});
out geom;""",
        "districts.json": f"""[out:json][timeout:180];
relation["boundary"="administrative"]["admin_level"="6"]({bb});
out geom;""",
    }


def atomic_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False)
    os.replace(tmp, path)


def query_hash(query):
    return hashlib.sha256(query.encode()).hexdigest()


def fetch_tile(name, query):
    import requests

    last = None
    for round_index in range(3):
        for url in OVERPASS_URLS:
            try:
                resp = requests.post(
                    url, data={"data": query}, timeout=180,
                    headers={"User-Agent": USER_AGENT})
                if resp.status_code != 200:
                    raise RuntimeError(f"HTTP {resp.status_code}")
                data = resp.json()
                if "elements" not in data:
                    raise RuntimeError("no elements in reply")
                return data
            except Exception as exc:  # noqa: BLE001 — try the next mirror
                last = exc
                print(f"{name}: {url} round {round_index + 1} failed ({exc})", file=sys.stderr)
        if round_index < len(RETRY_BACKOFF_S):
            time.sleep(RETRY_BACKOFF_S[round_index])
    raise SystemExit(f"{name}: all mirrors failed after 3 rounds: {last}")


def cached_tile(path, bbox, query):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        cached = json.load(fh)
    if cached.get("bbox") != bbox or cached.get("queryHash") != query_hash(query):
        return None
    return cached.get("reply")


def fetch_dataset(name, query_fn, area, grid, dataset, force=False):
    tile_boxes = tiles(area, *grid)
    tile_dir = os.path.join(RAW, "_tiles", name.replace(".json", ""))
    os.makedirs(tile_dir, exist_ok=True)
    state_path = os.path.join(tile_dir, "_state.json")
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as fh:
            state = json.load(fh)
    else:
        state = {"failures": {}, "splits": {}}
    merged, seen = [], set()

    def save_state():
        atomic_json(state_path, state)

    def fetch_one(bb, tile_id, depth=0):
        query = query_fn(bb)
        path = os.path.join(tile_dir, f"{tile_id}.json")
        data = None if force else cached_tile(path, bb, query)
        if data is not None:
            return data.get("elements", [])

        child_ids = state["splits"].get(tile_id)
        if child_ids:
            bounds = tuple(float(value) for value in bb.split(","))
            children = tiles(bounds, 2, 2)
            elements = [
                element
                for child, child_id in zip(children, child_ids)
                for element in fetch_one(child, child_id, depth + 1)
            ]
            atomic_json(path, {"bbox": bb, "queryHash": query_hash(query),
                               "reply": {"elements": elements}})
            return elements

        if data is None:
            print(f"{name}: {tile_id}/{len(tile_boxes)} {bb}")
            try:
                data = fetch_tile(f"{name} {tile_id}", query)
            except SystemExit:
                failures = state["failures"].get(tile_id, 0) + 1
                state["failures"][tile_id] = failures
                if failures < 2 or depth >= 2:
                    save_state()
                    raise
                print(f"{name}: splitting {tile_id} after {failures} failed fetches")
                bounds = tuple(float(value) for value in bb.split(","))
                children = tiles(bounds, 2, 2)
                child_ids = [f"{tile_id}-{child_index}" for child_index in range(4)]
                state["splits"][tile_id] = child_ids
                save_state()
                elements = [
                    element
                    for child, child_id in zip(children, child_ids)
                    for element in fetch_one(child, child_id, depth + 1)
                ]
                atomic_json(path, {"bbox": bb, "queryHash": query_hash(query),
                                   "reply": {"elements": elements}})
                return elements
            state["failures"].pop(tile_id, None)
            atomic_json(path, {"bbox": bb, "queryHash": query_hash(query), "reply": data})
            save_state()
            time.sleep(PAUSE_S)
        return data.get("elements", [])

    for i, bb in enumerate(tile_boxes):
        for element in fetch_one(bb, f"{dataset}-{i:02d}"):
            key = (element["type"], element["id"])
            if key not in seen:
                seen.add(key)
                merged.append(element)
    return merged


def band_overpass_queries(bb):
    return {
        "water.json": f"""[out:json][timeout:120];
(
  nwr["natural"="water"]({bb});
  way["waterway"~"^(river|canal)$"]({bb});
  relation["waterway"~"^(river|canal)$"]({bb});
);
out geom;""",
        "parks.json": f"""[out:json][timeout:120];
nwr["leisure"="park"]({bb});
out geom;""",
        "roads.json": f"""[out:json][timeout:120];
way["highway"~"^(motorway|trunk|primary)$"]({bb});
out geom;""",
    }


def fetch_raw(force=False):
    """Fetch detailed old-sheet layers and light outer-sheet layers, resumably."""
    os.makedirs(RAW, exist_ok=True)
    old_queries = overpass_queries("0,0,0,0")
    band_queries = band_overpass_queries("0,0,0,0")
    for name, query in old_queries.items():
        if name == "districts.json":
            continue
        path = os.path.join(RAW, name)
        old = fetch_dataset(name, lambda bb, key=name: overpass_queries(bb)[key],
                            OLD_SHEET, OLD_TILES, "old", force)
        merged = old
        if name in band_queries:
            outer = fetch_dataset(name, lambda bb, key=name: band_overpass_queries(bb)[key],
                                  BBOX, BAND_TILES, "band", force)
            seen = {(el["type"], el["id"]) for el in merged}
            merged.extend(el for el in outer if (el["type"], el["id"]) not in seen)
        atomic_json(path, {"elements": merged})
        print(f"{name}: {len(merged)} elements")

    district_path = os.path.join(RAW, "districts.json")
    bb = ",".join(str(v) for v in (BBOX[0], BBOX[1], BBOX[2], BBOX[3]))
    query = f"""[out:json][timeout:120];
relation["boundary"="administrative"]["admin_level"="6"]({bb});
out geom;"""
    try:
        elements = fetch_dataset("districts.json", lambda _bb: query,
                                 BBOX, (1, 1), "sheet", force)
    except SystemExit:
        names = "|".join(DISTRICT_EN)
        fallback = f"""[out:json][timeout:120];
relation["boundary"="administrative"]["admin_level"="6"]["name"~"^({names})$"]({bb});
out geom;"""
        elements = fetch_dataset("districts.json", lambda _bb: fallback,
                                 BBOX, (1, 1), "district-names", force)
    atomic_json(district_path, {"elements": elements})

LANE_NAMES = [
    "武康路", "安福路", "永康路", "五原路", "长乐路", "巨鹿路", "复兴中路",
    "复兴西路", "思南路", "太原路", "愚园路", "襄阳北路", "襄阳南路", "富民路",
    "进贤路", "绍兴路", "建国西路", "衡山路", "乌鲁木齐中路", "乌鲁木齐南路",
    "南昌路", "茂名南路", "陕西南路", "湖南路", "新乐路", "东平路", "永嘉路",
    "岳阳路", "汾阳路", "桃江路",
    # the café lanes of the wider sheet
    "大学路", "政民路", "黄金城道", "龙腾大道", "滨江大道", "甜爱路", "多伦路",
    "湘浦路", "永平路",
]

LANE_EN = {
    "武康路": "Wukang Rd", "安福路": "Anfu Rd", "永康路": "Yongkang Rd",
    "五原路": "Wuyuan Rd", "长乐路": "Changle Rd", "巨鹿路": "Julu Rd",
    "复兴中路": "Fuxing Middle Rd", "复兴西路": "Fuxing West Rd",
    "思南路": "Sinan Rd", "太原路": "Taiyuan Rd", "愚园路": "Yuyuan Rd",
    "襄阳北路": "Xiangyang N Rd", "襄阳南路": "Xiangyang S Rd",
    "富民路": "Fumin Rd", "进贤路": "Jinxian Rd", "绍兴路": "Shaoxing Rd",
    "建国西路": "Jianguo West Rd", "衡山路": "Hengshan Rd",
    "乌鲁木齐中路": "Urumqi Middle Rd", "乌鲁木齐南路": "Urumqi S Rd",
    "南昌路": "Nanchang Rd", "茂名南路": "Maoming S Rd",
    "陕西南路": "Shaanxi S Rd", "湖南路": "Hunan Rd", "新乐路": "Xinle Rd",
    "东平路": "Dongping Rd", "永嘉路": "Yongjia Rd", "岳阳路": "Yueyang Rd",
    "汾阳路": "Fenyang Rd", "桃江路": "Taojiang Rd",
    "大学路": "Daxue Rd", "政民路": "Zhengmin Rd", "黄金城道": "Huangjincheng Walk",
    "龙腾大道": "Longteng Ave", "滨江大道": "Binjiang Ave", "甜爱路": "Tian'ai Rd",
    "多伦路": "Duolun Rd", "湘浦路": "Xiangpu Rd", "永平路": "Yongping Rd",
}

DISTRICT_EN = {
    "黄浦区": "Huangpu", "徐汇区": "Xuhui", "静安区": "Jing'an",
    "长宁区": "Changning", "虹口区": "Hongkou", "普陀区": "Putuo",
    "杨浦区": "Yangpu", "浦东新区": "Pudong", "闵行区": "Minhang",
    "宝山区": "Baoshan", "嘉定区": "Jiading", "青浦区": "Qingpu",
    "松江区": "Songjiang", "奉贤区": "Fengxian",
}


def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as fh:
        return json.load(fh)["elements"]


def inside(lat, lon, pad=0.02):
    s, w, n, e = BBOX
    return s - pad <= lat <= n + pad and w - pad <= lon <= e + pad


def in_inner(points):
    """True when the polyline's midpoint lies on the old inner-ring sheet."""
    s, w, n, e = INNER
    x, y = points[len(points) // 2]
    return s <= y <= n and w <= x <= e


def in_old_sheet(points):
    """True when a feature has a point in the previously published sheet."""
    s, w, n, e = OLD_SHEET
    return any(s <= y <= n and w <= x <= e for x, y in points)


def ring_area(ring):
    """Shoelace area in deg² (1e-6 ≈ a 100 m square at this latitude)."""
    a = 0.0
    for i, (x, y) in enumerate(ring):
        px, py = ring[i - 1]
        a += px * y - x * py
    return abs(a) / 2


def join_lines(pieces):
    """Chain polylines that share an endpoint (OSM splits roads at every
    junction and tag change); the per-way JSON overhead was most of the
    roads layer. Nodes shared by three or more pieces stay as joins."""
    pieces = [list(map(tuple, p)) for p in pieces if len(p) > 1]
    ends = {}
    for i, p in enumerate(pieces):
        ends.setdefault(p[0], []).append(i)
        ends.setdefault(p[-1], []).append(i)
    used = [False] * len(pieces)
    out = []
    for i, p in enumerate(pieces):
        if used[i]:
            continue
        used[i] = True
        line = list(p)
        for _direction in range(2):
            while True:
                cands = [j for j in ends.get(line[-1], []) if not used[j]]
                if len(cands) != 1 or len(ends[line[-1]]) != 2:
                    break
                j = cands[0]
                used[j] = True
                q = pieces[j]
                line += q[1:] if q[0] == line[-1] else q[-2::-1]
            line.reverse()
        out.append([list(pt) for pt in line])
    return out


def touches(points, pad=0.02):
    return any(inside(p["lat"], p["lon"], pad) for p in points)


def simplify(points, tol):
    """Douglas-Peucker on lon/lat pairs."""
    if len(points) < 3:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    dx, dy = bx - ax, by - ay
    span = math.hypot(dx, dy)
    worst, idx = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        if span == 0:
            d = math.hypot(px - ax, py - ay)
        else:
            d = abs(dy * px - dx * py + bx * ay - by * ax) / span
        if d > worst:
            worst, idx = d, i
    if worst <= tol:
        return [points[0], points[-1]]
    left = simplify(points[: idx + 1], tol)
    right = simplify(points[idx:], tol)
    return left[:-1] + right


def coords(points, tol=0.00012):
    pts = [(round(p["lon"], 5), round(p["lat"], 5)) for p in points]
    deduped = [pts[0]]
    for p in pts[1:]:
        if p != deduped[-1]:
            deduped.append(p)
    return [list(p) for p in simplify(deduped, tol)]


def clip(ring, pad=0.004):
    """Sutherland-Hodgman clip of a lon/lat ring to the atlas sheet.

    OSM river relations run far past the sheet, so an unclipped outer ring
    closes back across dry land and floods the map.
    """
    s, w, n, e = BBOX
    box = (w - pad, s - pad, e + pad, n + pad)
    edges = (
        lambda p: p[0] >= box[0],
        lambda p: p[0] <= box[2],
        lambda p: p[1] >= box[1],
        lambda p: p[1] <= box[3],
    )
    cuts = (
        lambda a, b: (box[0], a[1] + (b[1] - a[1]) * (box[0] - a[0]) / (b[0] - a[0])),
        lambda a, b: (box[2], a[1] + (b[1] - a[1]) * (box[2] - a[0]) / (b[0] - a[0])),
        lambda a, b: (a[0] + (b[0] - a[0]) * (box[1] - a[1]) / (b[1] - a[1]), box[1]),
        lambda a, b: (a[0] + (b[0] - a[0]) * (box[3] - a[1]) / (b[1] - a[1]), box[3]),
    )
    poly = [tuple(p) for p in ring]
    for keep, cut in zip(edges, cuts):
        if not poly:
            return []
        out = []
        for i, cur in enumerate(poly):
            prev = poly[i - 1]
            if keep(cur):
                if not keep(prev):
                    out.append(cut(prev, cur))
                out.append(cur)
            elif keep(prev):
                out.append(cut(prev, cur))
        poly = out
    return [[round(x, 5), round(y, 5)] for x, y in poly]


def clip_line(points, pad=0.004, bounds=None):
    """Keep the longest run of a polyline that stays on the sheet."""
    s, w, n, e = bounds or BBOX
    runs, run = [], []
    for x, y in points:
        if w - pad <= x <= e + pad and s - pad <= y <= n + pad:
            run.append([x, y])
        else:
            if run:
                runs.append(run)
            run = []
    if run:
        runs.append(run)
    return max(runs, key=len) if runs else []


def stitch(pieces):
    """Join relation member ways end-to-end into closed rings."""
    pool = [list(p) for p in pieces if len(p) > 1]
    rings = []
    while pool:
        ring = pool.pop(0)
        joined = True
        while joined and ring[0] != ring[-1]:
            joined = False
            for i, cand in enumerate(pool):
                if cand[0] == ring[-1]:
                    ring += cand[1:]
                elif cand[-1] == ring[-1]:
                    ring += cand[-2::-1]
                elif cand[-1] == ring[0]:
                    ring = cand[:-1] + ring
                elif cand[0] == ring[0]:
                    ring = cand[:0:-1] + ring
                else:
                    continue
                pool.pop(i)
                joined = True
                break
        rings.append(ring)
    return rings


def rings_from(element):
    """Return outer rings/lines for a way or relation with `out geom`."""
    if element["type"] == "way":
        geom = element.get("geometry")
        return [geom] if geom else []
    pieces = [
        [(p["lon"], p["lat"]) for p in member["geometry"]]
        for member in element.get("members", [])
        if member.get("role") in ("outer", "", None) and member.get("geometry")
    ]
    return [
        [{"lon": x, "lat": y} for x, y in ring] for ring in stitch(pieces)
    ]


def build_water():
    """Banks are polygons; a bare `waterway` way is a centreline, not a shape.

    Ponds smaller than ~a city block and short unnamed ditches are dropped
    outside the inner ring — they read as specks at sheet scale."""
    lines, areas, seen = [], [], set()
    for el in load("water.json"):
        tags = el.get("tags", {})
        name = tags.get("name", "")
        polygonal = tags.get("natural") == "water" or tags.get("type") == "multipolygon"
        if not polygonal:
            geom = el.get("geometry") or []
            if len(geom) > 1 and touches(geom, 0.0):
                pts = clip_line(coords(geom, 0.00015))
                cls = tags.get("waterway", "stream")
                keep = (
                    (cls != "stream" or name or in_inner(pts))
                    if in_old_sheet(pts)
                    else cls in ("river", "canal")
                )
                if len(pts) > 1 and keep:
                    lines.append({"name": name, "cls": cls, "points": pts})
            continue
        for geom in rings_from(el):
            if len(geom) < 3 or not touches(geom, 0.0):
                continue
            ring = clip(coords(geom, 0.00015), 0.001)
            if len(ring) < 4:
                continue
            if in_old_sheet(ring):
                if not name and ring_area(ring) < 1.5e-6 and not in_inner(ring):
                    continue
            elif ring_area(ring) < WATER_AREA_THRESHOLD:
                continue
            key = tuple(map(tuple, ring))
            if key in seen:
                continue
            seen.add(key)
            areas.append({"name": name, "points": ring})
    return {"areas": areas, "lines": lines}


def build_parks():
    old, outer = [], []
    for el in load("parks.json"):
        tags = el.get("tags", {})
        for geom in rings_from(el):
            if len(geom) < 4 or not touches(geom, 0.0):
                continue
            ring = clip(coords(geom, 0.00010), 0.001)
            if len(ring) < 4:
                continue
            if not in_old_sheet(ring) and ring_area(ring) < PARK_AREA_THRESHOLD:
                continue
            park = {
                "name": tags.get("name:en") or tags.get("name", ""),
                "nameZh": tags.get("name", ""),
                "points": ring,
            }
            (old if in_old_sheet(ring) else outer).append(park)
    old.sort(key=lambda p: -len(p["points"]))
    outer.sort(key=lambda p: -len(p["points"]))
    return old[:120] + outer


def build_roads():
    """Arterials, chained per class and clipped to the sheet; the inner ring
    keeps the finer Douglas-Peucker tolerance."""
    by_cls = {}
    for el in load("roads.json"):
        geom = el.get("geometry") or []
        if len(geom) < 2 or not touches(geom, 0.0):
            continue
        cls = el.get("tags", {}).get("highway", "secondary")
        pts = clip_line(
            coords(geom, 0.0), 0.006,
            OLD_SHEET if cls == "secondary" else None,
        )
        if len(pts) > 1:
            by_cls.setdefault(cls, []).append(pts)
    out = []
    for cls in ("motorway", "trunk", "primary", "secondary"):
        for line in join_lines(by_cls.get(cls, [])):
            tol = 0.00018 if in_inner(line) else 0.00028
            out.append({"cls": cls, "points": simplify(line, tol)})
    return out


def build_lanes():
    buckets = {}
    for el in load("lanes.json"):
        geom = el.get("geometry") or []
        tags = el.get("tags", {})
        name = tags.get("name", "")
        if name not in LANE_NAMES or len(geom) < 2 or not touches(geom, 0.0):
            continue
        pts = coords(geom, 0.00010)
        if in_old_sheet(pts):
            buckets.setdefault(name, []).append(pts)
    return [
        {"nameZh": name, "name": LANE_EN.get(name, name), "segments": segs}
        for name, segs in sorted(buckets.items())
    ]


def build_districts():
    out = {}
    for el in load("districts.json"):
        name = el.get("tags", {}).get("name", "")
        if name not in DISTRICT_EN:
            continue
        pieces = []
        for member in el.get("members", []):
            if member.get("role") == "outer" and member.get("geometry"):
                geom = member["geometry"]
                if touches(geom, 0.03):
                    line = coords(geom, 0.00040)
                    if len(line) > 2:
                        pieces.append(line)
        if pieces:
            prev = out.get(name, {}).get("segments", [])
            out[name] = {
                "name": DISTRICT_EN[name],
                "nameZh": name,
                "segments": prev + pieces,
            }
    return list(out.values())


def main():
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", choices=("overpass", "pbf"), default="overpass")
    parser.add_argument("--scope", choices=("old", "full"), default="full")
    parser.add_argument("--fetch", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--output", default=OUT)
    args = parser.parse_args()
    global RAW, BBOX
    BBOX = OLD_SHEET if args.scope == "old" else SHEET_BBOX
    if args.source == "pbf":
        if args.fetch:
            parser.error("--fetch is only available for the Overpass source")
        RAW = os.path.join(HERE, "raw", f"pbf-{args.scope}", "basemap")
    elif args.fetch:
        fetch_raw(force=args.force)
    output_path = args.output
    basemap = {
        "bbox": {"south": BBOX[0], "west": BBOX[1], "north": BBOX[2], "east": BBOX[3]},
        "attribution": "Geometry (c) OpenStreetMap contributors, ODbL",
        "water": build_water(),
        "parks": build_parks(),
        "roads": build_roads(),
        "lanes": build_lanes(),
        "districts": build_districts(),
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(basemap, fh, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(output_path) / 1024
    print(f"wrote {output_path} ({size:.0f} kB)")
    for key in ("parks", "roads", "lanes", "districts"):
        print(f"  {key}: {len(basemap[key])}")
    print(f"  water areas: {len(basemap['water']['areas'])}")
    print(f"  water lines: {len(basemap['water']['lines'])}")


if __name__ == "__main__":
    main()
