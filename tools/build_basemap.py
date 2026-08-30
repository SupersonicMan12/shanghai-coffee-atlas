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
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "src", "data", "basemap.json")

# The stage: central Shanghai, from Zhongshan Park in the west to Lujiazui in
# the east, Suzhou Creek in the north to Xujiahui in the south.
BBOX = (31.180, 121.390, 31.268, 121.525)  # S, W, N, E

LANE_NAMES = [
    "武康路", "安福路", "永康路", "五原路", "长乐路", "巨鹿路", "复兴中路",
    "复兴西路", "思南路", "太原路", "愚园路", "襄阳北路", "襄阳南路", "富民路",
    "进贤路", "绍兴路", "建国西路", "衡山路", "乌鲁木齐中路", "乌鲁木齐南路",
    "南昌路", "茂名南路", "陕西南路", "湖南路", "新乐路", "东平路", "永嘉路",
    "岳阳路", "汾阳路", "桃江路",
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
}

DISTRICT_EN = {
    "黄浦区": "Huangpu", "徐汇区": "Xuhui", "静安区": "Jing'an",
    "长宁区": "Changning", "虹口区": "Hongkou", "普陀区": "Putuo",
    "杨浦区": "Yangpu", "浦东新区": "Pudong",
}


def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as fh:
        return json.load(fh)["elements"]


def inside(lat, lon, pad=0.02):
    s, w, n, e = BBOX
    return s - pad <= lat <= n + pad and w - pad <= lon <= e + pad


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


def clip_line(points, pad=0.004):
    """Keep the longest run of a polyline that stays on the sheet."""
    s, w, n, e = BBOX
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
    """Banks are polygons; a bare `waterway` way is a centreline, not a shape."""
    lines, areas, seen = [], [], set()
    for el in load("water.json"):
        tags = el.get("tags", {})
        name = tags.get("name", "")
        polygonal = tags.get("natural") == "water" or tags.get("type") == "multipolygon"
        if not polygonal:
            geom = el.get("geometry") or []
            if len(geom) > 1 and touches(geom, 0.0):
                lines.append({
                    "name": name,
                    "cls": tags.get("waterway", "stream"),
                    "points": clip_line(coords(geom, 0.00015)),
                })
            continue
        for geom in rings_from(el):
            if len(geom) < 3 or not touches(geom, 0.0):
                continue
            ring = clip(coords(geom, 0.00015), 0.001)
            if len(ring) < 4:
                continue
            key = tuple(map(tuple, ring))
            if key in seen:
                continue
            seen.add(key)
            areas.append({"name": name, "points": ring})
    lines = [ln for ln in lines if len(ln["points"]) > 1]
    return {"areas": areas, "lines": lines}


def build_parks():
    out = []
    for el in load("parks.json"):
        tags = el.get("tags", {})
        for geom in rings_from(el):
            if len(geom) < 4 or not touches(geom, 0.0):
                continue
            ring = clip(coords(geom, 0.00010), 0.001)
            if len(ring) < 4:
                continue
            out.append({
                "name": tags.get("name:en") or tags.get("name", ""),
                "nameZh": tags.get("name", ""),
                "points": ring,
            })
    out.sort(key=lambda p: -len(p["points"]))
    return out[:90]


def build_roads():
    out = []
    for el in load("roads.json"):
        geom = el.get("geometry") or []
        if len(geom) < 2 or not touches(geom, 0.0):
            continue
        tags = el.get("tags", {})
        out.append({
            "cls": tags.get("highway", "secondary"),
            "points": coords(geom, 0.00018),
        })
    return out


def build_lanes():
    buckets = {}
    for el in load("lanes.json"):
        geom = el.get("geometry") or []
        tags = el.get("tags", {})
        name = tags.get("name", "")
        if name not in LANE_NAMES or len(geom) < 2 or not touches(geom, 0.0):
            continue
        buckets.setdefault(name, []).append(coords(geom, 0.00010))
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
    basemap = {
        "bbox": {"south": BBOX[0], "west": BBOX[1], "north": BBOX[2], "east": BBOX[3]},
        "attribution": "Geometry (c) OpenStreetMap contributors, ODbL",
        "water": build_water(),
        "parks": build_parks(),
        "roads": build_roads(),
        "lanes": build_lanes(),
        "districts": build_districts(),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(basemap, fh, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(OUT) / 1024
    print(f"wrote {OUT} ({size:.0f} kB)")
    for key in ("parks", "roads", "lanes", "districts"):
        print(f"  {key}: {len(basemap[key])}")
    print(f"  water areas: {len(basemap['water']['areas'])}")


if __name__ == "__main__":
    main()
