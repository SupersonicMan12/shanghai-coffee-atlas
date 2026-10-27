#!/usr/bin/env python3
"""Street-level roads for the zoomed-in atlas: src/data/streets.json.

The main basemap stops at secondary roads so the city reads as a drawing at
sheet scale. Once a reader zooms to a few blocks, the gaps between arterials
need the real street grid. This pulls tertiary, residential, unclassified,
living and pedestrian streets straight from the Geofabrik Shanghai PBF
(tools/cache/osm/shanghai-latest.osm.pbf, see osm_from_pbf.py for the download
recipe), chains them per name, simplifies lightly and writes a separate file
the browser only fetches when it is needed.

    python3 tools/build_streets.py

Source data (c) OpenStreetMap contributors, ODbL.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import osmium

from build_basemap import DISTRICT_EN, join_lines, simplify  # noqa: F401
from ring import OLD_SHEET_BBOX, SHEET_BBOX

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PBF = ROOT / "tools" / "cache" / "osm" / "shanghai-latest.osm.pbf"
OUT = ROOT / "src" / "data" / "streets.json"

# Inside the old inner sheet every street is drawn; across the wider v7 sheet
# only tertiary roads (the next class below the arterials) are added so the
# outer band stays light and the file stays small.
INNER_CLASSES = ("tertiary", "residential", "unclassified", "living_street", "pedestrian")
OUTER_CLASSES = ("tertiary",)
# Douglas-Peucker tolerance in degrees; 0.00005° is roughly 5 m here.
TOL = 0.00005
MIN_POINTS = 2

_ROAD_SUFFIXES = (
    ("支路", " Branch Rd"), ("大道", " Ave"), ("高架", " Elevated Rd"),
    ("东路", " East Rd"), ("西路", " West Rd"), ("南路", " South Rd"),
    ("北路", " North Rd"), ("中路", " Middle Rd"), ("路", " Rd"),
    ("街", " St"), ("弄", " Lane"), ("巷", " Alley"), ("道", " Rd"),
)


def in_box(lon: float, lat: float, box) -> bool:
    s, w, n, e = box
    return w <= lon <= e and s <= lat <= n


class StreetCollector(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.ways: list[dict] = []

    def way(self, way) -> None:
        tags = dict(way.tags)
        cls = tags.get("highway")
        if cls not in INNER_CLASSES:
            return
        if tags.get("area") == "yes" or tags.get("tunnel") == "yes":
            return
        pts = []
        for n in way.nodes:
            try:
                pts.append((round(n.lon, 5), round(n.lat, 5)))
            except osmium.InvalidLocationError:
                continue
        if len(pts) < MIN_POINTS:
            return
        mx, my = pts[len(pts) // 2]
        if not in_box(mx, my, SHEET_BBOX):
            return
        if not in_box(mx, my, OLD_SHEET_BBOX) and cls not in OUTER_CLASSES:
            return
        name_zh = tags.get("name:zh") or tags.get("name") or ""
        name_en = tags.get("name:en") or ""
        self.ways.append({"cls": cls, "nameZh": name_zh, "name": name_en, "pts": pts})


def english(name_zh: str, name_en: str) -> str:
    if name_en:
        return name_en
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_PBF)
    parser.add_argument("--output", type=Path, default=OUT)
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"missing PBF extract: {args.input}")

    collector = StreetCollector()
    collector.apply_file(str(args.input), locations=True, idx="flex_mem")

    # Chain ways that share a class and a name, so one street is one path.
    groups: dict[tuple[str, str, str], list] = {}
    for w in collector.ways:
        groups.setdefault((w["cls"], w["nameZh"], w["name"]), []).append(w["pts"])
    streets = []
    for (cls, name_zh, name_en), pieces in groups.items():
        for line in join_lines(pieces):
            pts = simplify([tuple(p) for p in line], TOL)
            if len(pts) < MIN_POINTS:
                continue
            item = {"cls": cls, "points": [list(p) for p in pts]}
            if name_zh:
                item["nameZh"] = name_zh
            en = english(name_zh, name_en)
            if en:
                item["name"] = en
            streets.append(item)
    streets.sort(key=lambda s: (INNER_CLASSES.index(s["cls"]), s.get("nameZh", "")))

    out = {
        "attribution": "Geometry (c) OpenStreetMap contributors, ODbL",
        "classes": list(INNER_CLASSES),
        "streets": streets,
    }
    os.makedirs(args.output.parent, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
    size = os.path.getsize(args.output) / 1024
    by_cls = {}
    for s in streets:
        by_cls[s["cls"]] = by_cls.get(s["cls"], 0) + 1
    named = sum(1 for s in streets if s.get("nameZh"))
    print(f"wrote {args.output} ({size:.0f} kB): {len(streets)} streets, {named} named")
    for cls, n in by_cls.items():
        print(f"  {cls}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
