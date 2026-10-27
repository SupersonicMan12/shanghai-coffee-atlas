#!/usr/bin/env python3
"""Build Overpass ``out geom``-style caches from Geofabrik's Shanghai PBF.

Rebuild recipe:
    URL: https://download.geofabrik.de/asia/china/shanghai-latest.osm.pbf
    Expected path: tools/cache/osm/shanghai-latest.osm.pbf
    Ignore rule: tools/cache/osm/*.osm.pbf
    Download: curl -C - -L --retry 5 https://download.geofabrik.de/asia/china/shanghai-latest.osm.pbf -o tools/cache/osm/shanghai-latest.osm.pbf
    Install the tools-only dependency: pip install --user osmium
    Convert: python3 tools/osm_from_pbf.py --scope full
    Build basemap: python3 tools/build_basemap.py --source pbf --scope full
    Build metro: python3 tools/build_metro.py --source pbf --scope full

The old scope reproduces the detailed OLD_SHEET_BBOX queries. The full scope
adds only the lighter outer-sheet filters, while metro station candidates and
Shanghai subway routes come directly from the same PBF. Output is isolated
under tools/raw/pbf-{old,full}; no Overpass cache is read or overwritten.
The optional osmium-tool package can inspect the extract with
``osmium fileinfo -e``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import osmium

from build_basemap import (
    BBOX,
    LANE_NAMES,
    OLD_SHEET,
)
from ring import SHEET_BBOX

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PBF = ROOT / "tools" / "cache" / "osm" / "shanghai-latest.osm.pbf"
ROUTE_TAGS = {"route": "subway", "network": "上海地铁"}
MEMBER_TYPES = {"n": "node", "w": "way", "r": "relation"}
LANE_SET = set(LANE_NAMES)
BASEMAP_FILES = ("water", "parks", "roads", "lanes", "districts")


def tags_dict(obj) -> dict[str, str]:
    return dict(obj.tags)


def is_metro_station(tags: dict[str, str]) -> bool:
    return (
        tags.get("railway") == "station"
        and tags.get("station") in ("subway", "light_rail")
    ) or (
        tags.get("railway") == "station" and tags.get("subway") == "yes"
    ) or (
        tags.get("public_transport") == "station" and tags.get("subway") == "yes"
    )


def in_box(lon: float, lat: float, box: tuple[float, float, float, float],
           pad: float = 0.0) -> bool:
    south, west, north, east = box
    return west - pad <= lon <= east + pad and south - pad <= lat <= north + pad


def geometry_hits(points: list[tuple[float, float]],
                  box: tuple[float, float, float, float],
                  pad: float = 0.0) -> bool:
    if any(in_box(lon, lat, box, pad) for lon, lat in points):
        return True
    south, west, north, east = box
    west -= pad
    east += pad
    south -= pad
    north += pad
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        if max(x1, x2) >= west and min(x1, x2) <= east \
                and max(y1, y2) >= south and min(y1, y2) <= north:
            return True
    return False


def geometry_hits_band(points: list[tuple[float, float]], pad: float = 0.0) -> bool:
    if any(
        in_box(lon, lat, SHEET_BBOX, pad) and not in_box(lon, lat, OLD_SHEET)
        for lon, lat in points
    ):
        return True
    return any(
        in_box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, SHEET_BBOX, pad)
        and not in_box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, OLD_SHEET)
        for a, b in zip(points, points[1:])
    )


def old_match(layer: str, element_type: str, tags: dict[str, str]) -> bool:
    if layer == "water":
        return tags.get("natural") == "water" or (
            element_type == "way"
            and tags.get("waterway") in ("river", "canal", "stream")
        ) or (
            element_type == "relation"
            and tags.get("waterway") in ("river", "canal")
        )
    if layer == "parks":
        return tags.get("leisure") in ("park", "garden")
    if layer == "roads":
        return element_type == "way" and tags.get("highway") in (
            "motorway", "trunk", "primary", "secondary"
        )
    if layer == "lanes":
        return element_type == "way" and bool(tags.get("highway")) \
            and tags.get("name") in LANE_SET
    if layer == "districts":
        return element_type == "relation" \
            and tags.get("boundary") == "administrative" \
            and tags.get("admin_level") == "6"
    return False


def band_match(layer: str, element_type: str, tags: dict[str, str]) -> bool:
    if layer == "water":
        return tags.get("natural") == "water" or (
            element_type == "way"
            and tags.get("waterway") in ("river", "canal")
        ) or (
            element_type == "relation"
            and tags.get("waterway") in ("river", "canal")
        )
    if layer == "parks":
        return tags.get("leisure") == "park"
    if layer == "roads":
        return element_type == "way" and tags.get("highway") in (
            "motorway", "trunk", "primary"
        )
    if layer == "districts":
        return element_type == "relation" \
            and tags.get("boundary") == "administrative" \
            and tags.get("admin_level") == "6"
    return False


def node_point(node) -> tuple[float, float] | None:
    if not node.location.valid():
        return None
    return node.location.lon, node.location.lat


def way_points(way) -> list[tuple[float, float]]:
    return [
        (node.location.lon, node.location.lat)
        for node in way.nodes
        if node.location.valid()
    ]


def geometry_json(points: list[tuple[float, float]]) -> list[dict[str, float]]:
    return [{"lat": lat, "lon": lon} for lon, lat in points]


def element_key(element: dict) -> tuple[str, int]:
    return element["type"], element["id"]


def atomic_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
                   encoding="utf-8")
    tmp.replace(path)


class RelationIndex(osmium.SimpleHandler):
    def __init__(self) -> None:
        super().__init__()
        self.relations: dict[int, dict] = {}
        self.route_relations: list[dict] = []
        self.stop_node_ids: set[int] = set()
        self.member_way_ids: set[int] = set()
        self.member_node_ids: set[int] = set()

    def relation(self, relation) -> None:
        tags = tags_dict(relation)
        members = []
        for member in relation.members:
            member_type = MEMBER_TYPES.get(member.type)
            if member_type is None:
                continue
            item = {"type": member_type, "ref": int(member.ref), "role": member.role}
            members.append(item)
            if member_type == "way":
                self.member_way_ids.add(int(member.ref))
            elif member_type == "node":
                self.member_node_ids.add(int(member.ref))
                if tags.get("route") == "subway" and tags.get("network") == "上海地铁" \
                        and member.role == "stop":
                    self.stop_node_ids.add(int(member.ref))
        element = {"type": "relation", "id": int(relation.id),
                   "tags": tags, "members": members}
        if tags.get("route") == ROUTE_TAGS["route"] \
                and tags.get("network") == ROUTE_TAGS["network"]:
            self.route_relations.append(element)
        if is_metro_station(tags) or any(
            old_match(layer, "relation", tags) or band_match(layer, "relation", tags)
            for layer in BASEMAP_FILES
        ):
            self.relations[int(relation.id)] = element


class GeometryCollector(osmium.SimpleHandler):
    def __init__(self, scope: str, relation_index: RelationIndex) -> None:
        super().__init__()
        self.scope = scope
        self.bounds = OLD_SHEET if scope == "old" else BBOX
        self.relation_index = relation_index
        self.member_geometries: dict[int, list[tuple[float, float]]] = {}
        self.member_node_positions: dict[int, tuple[float, float]] = {}
        self.raw: dict[str, dict[str, dict]] = {
            layer: {"old": {}, "band": {}} for layer in BASEMAP_FILES
        }
        self.metro: dict[tuple[str, int], dict] = {}
        self.route_nodes: dict[int, dict] = {}

    def _add_basemap(self, layer: str, element: dict,
                     points: list[tuple[float, float]], element_type: str,
                     tags: dict[str, str]) -> None:
        if not points:
            return
        old_pad = 0.03 if layer == "districts" else 0.0
        old_hit = geometry_hits(points, OLD_SHEET, old_pad)
        band_hit = self.scope == "full" and geometry_hits_band(points)
        if old_match(layer, element_type, tags) and old_hit:
            self.raw[layer]["old"][element_key(element)] = element
        if band_hit and band_match(layer, element_type, tags):
            self.raw[layer]["band"][element_key(element)] = element

    def node(self, node) -> None:
        point = node_point(node)
        if point is None:
            return
        lon, lat = point
        node_id = int(node.id)
        tags = tags_dict(node)
        if node_id in self.relation_index.stop_node_ids:
            self.route_nodes[node_id] = {
                "type": "node", "id": node_id, "lat": lat, "lon": lon,
                "tags": tags,
            }
        if node_id in self.relation_index.member_node_ids:
            self.member_node_positions[node_id] = point
        if is_metro_station(tags) and in_box(lon, lat, self.bounds):
            item = {"type": "node", "id": node_id, "lat": lat, "lon": lon,
                    "tags": tags}
            self.metro[element_key(item)] = item
        for layer in ("water", "parks"):
            element = {"type": "node", "id": node_id, "lat": lat, "lon": lon,
                       "tags": tags}
            self._add_basemap(layer, element, [point], "node", tags)

    def way(self, way) -> None:
        tags = tags_dict(way)
        points = way_points(way)
        way_id = int(way.id)
        if way_id in self.relation_index.member_way_ids:
            self.member_geometries[way_id] = points
        if points and any(old_match(layer, "way", tags)
                          or band_match(layer, "way", tags)
                          for layer in BASEMAP_FILES):
            element = {"type": "way", "id": way_id, "tags": tags,
                       "geometry": geometry_json(points)}
            for layer in BASEMAP_FILES:
                self._add_basemap(layer, element, points, "way", tags)
        if is_metro_station(tags) and geometry_hits(points, self.bounds):
            if points:
                center = {
                    "lat": (min(p[1] for p in points) + max(p[1] for p in points)) / 2,
                    "lon": (min(p[0] for p in points) + max(p[0] for p in points)) / 2,
                }
                element = {"type": "way", "id": way_id, "tags": tags,
                           "center": center}
                self.metro[element_key(element)] = element


def relation_element(
    relation: dict,
    geometries: dict[int, list[tuple[float, float]]],
    node_positions: dict[int, tuple[float, float]],
) -> dict:
    members = []
    for member in relation["members"]:
        item = dict(member)
        if item["type"] == "way":
            points = geometries.get(item["ref"], [])
            if points:
                item["geometry"] = geometry_json(points)
        elif item["type"] == "node" and item["ref"] in node_positions:
            lon, lat = node_positions[item["ref"]]
            item.update({"lat": lat, "lon": lon})
        members.append(item)
    return {**relation, "members": members}


def center_of_points(points: list[tuple[float, float]]) -> dict | None:
    if not points:
        return None
    return {
        "lat": (min(p[1] for p in points) + max(p[1] for p in points)) / 2,
        "lon": (min(p[0] for p in points) + max(p[0] for p in points)) / 2,
    }


def make_outputs(scope: str, relation_index: RelationIndex,
                 collector: GeometryCollector) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    for relation_id, relation in relation_index.relations.items():
        tags = relation["tags"]
        points = [
            point
            for member in relation["members"]
            if member["type"] == "way"
            for point in collector.member_geometries.get(member["ref"], [])
        ] + [
            collector.member_node_positions[member["ref"]]
            for member in relation["members"]
            if member["type"] == "node"
            and member["ref"] in collector.member_node_positions
        ]
        if is_metro_station(tags):
            if geometry_hits(points, collector.bounds):
                center = center_of_points(points)
                if center:
                    item = {"type": "relation", "id": relation_id,
                            "tags": tags, "center": center}
                    collector.metro[element_key(item)] = item
            continue
        element = relation_element(
            relation, collector.member_geometries, collector.member_node_positions)
        for layer in BASEMAP_FILES:
            if not old_match(layer, "relation", tags) \
                    and not band_match(layer, "relation", tags):
                continue
            pad = 0.03 if layer == "districts" else 0.0
            old_hit = geometry_hits(points, OLD_SHEET, pad)
            band_hit = scope == "full" and geometry_hits_band(points, pad)
            if old_match(layer, "relation", tags) and old_hit:
                collector.raw[layer]["old"][element_key(element)] = element
            if band_hit and band_match(layer, "relation", tags):
                collector.raw[layer]["band"][element_key(element)] = element

    basemap = {}
    for layer in BASEMAP_FILES:
        old_elements = collector.raw[layer]["old"]
        band_elements = collector.raw[layer]["band"]
        union = dict(old_elements)
        union.update({key: value for key, value in band_elements.items() if key not in union})
        basemap[layer] = list(union.values())
        basemap[f"{layer}_old"] = list(old_elements.values())
        basemap[f"{layer}_band"] = list(band_elements.values())

    osm = {
        "metro": list(collector.metro.values()),
        "routes": relation_index.route_relations,
        "routenodes": list(collector.route_nodes.values()),
    }
    return basemap, osm


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_PBF)
    parser.add_argument("--scope", choices=("old", "full"), default="full")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if not args.input.is_file():
        parser.error(f"missing PBF extract: {args.input}")

    output_dir = args.output_dir or ROOT / "tools" / "raw" / f"pbf-{args.scope}"
    reader = osmium.io.Reader(str(args.input))
    try:
        header = reader.header()
        timestamp = header.get("osmosis_replication_timestamp") or header.get("timestamp")
        bounds = header.box()
        source_metadata = {
            "source": str(args.input),
            "timestamp": timestamp,
            "scope": args.scope,
            "pbf_bounds": [
                bounds.bottom_left.lon, bounds.bottom_left.lat,
                bounds.top_right.lon, bounds.top_right.lat,
            ],
        }
    finally:
        reader.close()

    relation_index = RelationIndex()
    relation_index.apply_file(str(args.input))
    collector = GeometryCollector(args.scope, relation_index)
    collector.apply_file(str(args.input), locations=True, idx="flex_mem")
    basemap, osm = make_outputs(args.scope, relation_index, collector)

    raw_dir = output_dir / "basemap"
    osm_dir = output_dir / "osm"
    for layer in BASEMAP_FILES:
        atomic_json(raw_dir / f"{layer}.json", {"elements": basemap[layer]})
        atomic_json(raw_dir / "split" / f"{layer}-old.json",
                    {"elements": basemap[f"{layer}_old"]})
        atomic_json(raw_dir / "split" / f"{layer}-band.json",
                    {"elements": basemap[f"{layer}_band"]})
    for name, elements in osm.items():
        atomic_json(osm_dir / f"{name}.json", {"elements": elements})
    atomic_json(output_dir / "source.json", source_metadata)

    for layer in BASEMAP_FILES:
        print(f"{layer}: old={len(basemap[f'{layer}_old'])}, "
              f"band={len(basemap[f'{layer}_band'])}, "
              f"combined={len(basemap[layer])}")
    print(f"metro stations={len(osm['metro'])}, routes={len(osm['routes'])}, "
          f"route stop nodes={len(osm['routenodes'])}")
    print(f"source timestamp={timestamp}; output={output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
