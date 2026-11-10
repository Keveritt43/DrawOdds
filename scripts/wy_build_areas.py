#!/usr/bin/env python3
"""Build data/wy/units.json and data/wy/areas.json: Wyoming hunt areas (per species) with map geometry, size,
nonresident region, land ownership and Walk-In / Hunter Management Area acreage.

Usage: python3 -I scripts/wy_build_areas.py <gis_dir>

Inputs (downloaded by get-wgfd-2.ps1 from WGFD and BLM ArcGIS services):
  <species>-hunt-areas-{4326,5070}.geojson  WGFD hunt areas (HUNTAREA, Region, SqMiles)
  blm-sma-*.geojson                         BLM Wyoming Surface Management Agency (SURFACE), EPSG:5070
  walk-in-hunting-5070.geojson, hunter-management-areas-5070.geojson

Land math is done on a 100 m raster in EPSG:5070 (equal-area) because no polygon library is available:
PIL fills polygons in C. Ownership parcels are drawn largest first, so inholdings drawn later overwrite the
parcel around them. Checks (the build stops if any fails):
  - each hunt area's raster area is within 2% of its exact polygon area (3.5% under 200 mi²);
  - ownership covers >= 97% of each hunt area's cells;
  - statewide, federal land is 45-50% and state land 5-8% of Wyoming (published shares ~48% and ~6%).
Public = the same classes as Colorado's build (BLM, Forest Service incl. grasslands, NPS, FWS, Reclamation,
Defense, other federal, state incl. Game & Fish, local government). Not public: private, tribal, water.
"""
from __future__ import annotations

import glob
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

RES = 100.0  # metres per cell
ACRES_PER_CELL = RES * RES / 4046.8564224
CLASSES = ["NONE", "BLM", "USFS", "GRASS", "NPS", "FWS", "BOR", "DOD", "OTHER", "STATE", "WGFD", "LOCAL", "PRIVATE", "TRIBAL", "WATER"]
CODE = {c: i for i, c in enumerate(CLASSES)}
PUBLIC = {"BLM", "USFS", "GRASS", "NPS", "FWS", "BOR", "DOD", "OTHER", "STATE", "WGFD", "LOCAL"}
FEDERAL = {"BLM", "USFS", "GRASS", "NPS", "FWS", "BOR", "DOD", "OTHER"}
SURFACE = {
    "Bureau of Land Management": "BLM", "Forest Service": "USFS", "National Grasslands": "GRASS", "National Park Service": "NPS",
    "Fish & Wildlife Service": "FWS", "Bureau of Reclamation": "BOR", "Department of Defense": "DOD", "Corps of Engineers": "OTHER",
    "Department of Energy": "OTHER", "General Services Administration": "OTHER", "Department of Veterans Affairs": "OTHER",
    "Department of Agriculture": "OTHER", "State": "STATE", "State Conflict": "STATE", "State (University of Wyoming)": "STATE",
    "State (State Parks & Hist Sites)": "STATE", "State (Wyoming Game & Fish)": "WGFD", "Local Government": "LOCAL",
    "Private": "PRIVATE", "Wind River Indian Reservation": "TRIBAL", "Water": "WATER",
}
SPECIES = {"antelope": "A", "deer": "D", "elk": "E"}


def rings(geom):
    if geom is None:
        return []
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]] if geom["type"] == "Polygon" else []
    return [poly for poly in polys if poly and poly[0]]  # drop empty parts (generalization can empty tiny parcels)


def ring_area(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


class Grid:
    def __init__(self, x0, y0, x1, y1):
        self.x0, self.y1 = x0, y1
        self.w = int(math.ceil((x1 - x0) / RES)) + 1
        self.h = int(math.ceil((y1 - y0) / RES)) + 1

    def px(self, ring):
        return [((x - self.x0) / RES, (self.y1 - y) / RES) for x, y in ring]

    def draw(self, img_draw, geom, value, hole_value=0):
        for poly in rings(geom):
            if not poly:
                continue
            img_draw.polygon(self.px(poly[0]), fill=value)
            for hole in poly[1:]:
                img_draw.polygon(self.px(hole), fill=hole_value)


def load(path):
    return json.load(open(path))["features"]


def rdp(points, eps):
    """Douglas-Peucker simplification (degrees) for map geometry."""
    if len(points) < 4:
        return points
    pts = np.asarray(points)
    keep = np.zeros(len(pts), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]
        n = np.hypot(*seg)
        rel = pts[a + 1:b] - pts[a]
        d = np.abs(seg[0] * rel[:, 1] - seg[1] * rel[:, 0]) / n if n else np.hypot(rel[:, 0], rel[:, 1])
        i = int(np.argmax(d))
        if d[i] > eps:
            keep[a + 1 + i] = True
            stack += [(a, a + 1 + i), (a + 1 + i, b)]
    out = pts[keep].round(5).tolist()
    return out if len(out) >= 4 else points


def simplify(geom, eps=0.0004):
    polys = []
    for poly in rings(geom):
        rs = [rdp(r, eps) for r in poly]
        if len(rs[0]) >= 4:
            polys.append([r for r in rs if len(r) >= 4])
    return {"type": "MultiPolygon", "coordinates": polys}


def bbox(geom):
    xs = [p[0] for poly in rings(geom) for r in poly for p in r]
    ys = [p[1] for poly in rings(geom) for r in poly for p in r]
    return [round(min(xs), 5), round(min(ys), 5), round(max(xs), 5), round(max(ys), 5)]


def main(gis: str) -> None:
    g = Path(gis)
    areas5070 = {sp: load(g / f"{sp}-hunt-areas-5070.geojson") for sp in SPECIES}
    areas4326 = {sp: {str(int(f["properties"]["HUNTAREA"])): f for f in load(g / f"{sp}-hunt-areas-4326.geojson")} for sp in SPECIES}
    xs, ys = [], []
    for feats in areas5070.values():
        for f in feats:
            for poly in rings(f["geometry"]):
                for x, y in poly[0]:
                    xs.append(x); ys.append(y)
    grid = Grid(min(xs) - 1000, min(ys) - 1000, max(xs) + 1000, max(ys) + 1000)
    print(f"grid {grid.w} x {grid.h} cells at {RES:.0f} m")

    # ownership raster
    own = Image.new("L", (grid.w, grid.h), 0)
    od = ImageDraw.Draw(own)
    parcels = []
    unknown = {}
    for path in sorted(glob.glob(str(g / "blm-sma-*.geojson"))):
        for f in load(path):
            s = (f["properties"].get("SURFACE") or "").strip()
            cls = SURFACE.get(s)
            if cls is None:
                unknown[s] = unknown.get(s, 0) + 1
                cls = "OTHER" if s else "NONE"
            area = sum(ring_area(poly[0]) for poly in rings(f["geometry"]))
            parcels.append((area, CODE[cls], f["geometry"]))
    if set(unknown) - {""}:
        raise SystemExit(f"unmapped SURFACE values: {unknown}")
    parcels.sort(key=lambda p: -p[0])
    for _, code, geom in parcels:
        grid.draw(od, geom, code, hole_value=0)
    own_a = np.asarray(own)
    print(f"ownership: {len(parcels)} parcels drawn")

    access = Image.new("1", (grid.w, grid.h), 0)
    ad = ImageDraw.Draw(access)
    access_feats = []
    for name in ("walk-in-hunting-5070.geojson", "hunter-management-areas-5070.geojson"):
        for f in load(g / name):
            grid.draw(ad, f["geometry"], 1)
            pts = [p for poly in rings(f["geometry"]) for p in poly[0]]
            if pts:
                cx, cy = sum(p[0] for p in pts) / len(pts), grid.y1 - sum(p[1] for p in pts) / len(pts)
                access_feats.append((int((cx - grid.x0) / RES), int(cy / RES)))
    acc_a = np.asarray(access, dtype=bool)

    # statewide sanity (inside the union of deer hunt areas = all of Wyoming)
    state = Image.new("1", (grid.w, grid.h), 0)
    sd = ImageDraw.Draw(state)
    for f in areas5070["deer"]:
        grid.draw(sd, f["geometry"], 1)
    st = np.asarray(state, dtype=bool)
    tot = st.sum()
    fed = np.isin(own_a[st], [CODE[c] for c in FEDERAL]).sum() / tot
    sta = np.isin(own_a[st], [CODE["STATE"], CODE["WGFD"]]).sum() / tot
    cov = (own_a[st] != 0).sum() / tot
    print(f"statewide: {tot * RES * RES / 2.59e6:,.0f} mi², federal {fed:.1%}, state {sta:.1%}, ownership coverage {cov:.1%}")
    errors = []
    if not 0.45 <= fed <= 0.50:
        errors.append(f"statewide federal share {fed:.1%} outside 45-50%")
    if not 0.05 <= sta <= 0.08:
        errors.append(f"statewide state share {sta:.1%} outside 5-8%")

    units, info = [], {}
    for sp, prefix in SPECIES.items():
        info[sp] = {}
        for f in areas5070[sp]:
            p = f["properties"]
            num = str(int(p["HUNTAREA"]))
            m = Image.new("1", (grid.w, grid.h), 0)
            grid.draw(ImageDraw.Draw(m), f["geometry"], 1)
            mask = np.asarray(m, dtype=bool)
            n = int(mask.sum())
            if n == 0:
                errors.append(f"{sp} {num}: empty raster")
                continue
            sqmi = n * RES * RES / 2.589988e6
            # check the raster against the exact polygon area (WGFD's SqMiles attribute is stale for redrawn areas,
            # e.g. 2026 deer 138/143/155/156; it is kept as wgfdSqmi for reference only)
            exact = sum(ring_area(poly[0]) - sum(ring_area(h) for h in poly[1:]) for poly in rings(f["geometry"])) / 2.589988e6
            tol = 0.02 if exact >= 200 else 0.035  # PIL fills edge cells, so rasters run slightly large
            if exact > 5 and abs(sqmi - exact) / exact > tol:
                errors.append(f"{sp} {num}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}")
            vals = own_a[mask]
            counts = np.bincount(vals, minlength=len(CLASSES))
            covered = n - counts[0]
            if covered / n < 0.97:
                errors.append(f"{sp} {num}: ownership covers {covered / n:.1%}")
            pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
            public = sum(v for k, v in pct.items() if k in PUBLIC)
            acc_cells = int((acc_a & mask).sum())
            acc_n = sum(1 for (cx, cy) in access_feats if 0 <= cx < grid.w and 0 <= cy < grid.h and mask[cy, cx])
            acres = round(n * ACRES_PER_CELL)
            rec = {"acres": acres, "sqmi": round(sqmi, 1), "wgfdSqmi": p.get("SqMiles"), "publicPct": round(public, 1),
                   "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
                   "accessAcres": round(acc_cells * ACRES_PER_CELL), "accessCount": acc_n,
                   "accessPct": round(100 * acc_cells / n, 1), "ownership": pct,
                   "region": (p.get("Region") or "").strip() or None, "name": p.get("HUNTNAME")}
            info[sp][num] = rec
            g4 = areas4326[sp].get(num)
            geom = simplify(g4["geometry"]) if g4 else None
            units.append({"name": f"{prefix}{num}", "species": sp, "areaName": p.get("HUNTNAME"), "geometry": geom,
                          "bbox": bbox(g4["geometry"]) if g4 else None, "acres": acres, "publicPct": rec["publicPct"],
                          "privatePct": rec["privatePct"], "ownership": [{"manager": k, "pct": v} for k, v in sorted(pct.items(), key=lambda kv: -kv[1])],
                          "accessAcres": rec["accessAcres"], "accessCount": acc_n, "region": rec["region"]})
        print(f"{sp}: {len(info[sp])} areas")
    if errors:
        raise SystemExit("area checks failed:\n" + "\n".join(errors[:40]))
    out = Path(__file__).resolve().parent.parent / "data" / "wy"
    (out / "areas.json").write_text(json.dumps({"source": "WGFD hunt areas; BLM Wyoming Surface Management Agency; WGFD Walk-In and HMA boundaries",
                                                 "resolutionM": RES, "statewide": {"federalPct": round(100 * fed, 1), "statePct": round(100 * sta, 1)},
                                                 "species": info}, separators=(",", ":")) + "\n")
    (out / "units.json").write_text(json.dumps({"units": units}, separators=(",", ":")) + "\n")
    print("wrote areas.json and units.json")


if __name__ == "__main__":
    main(sys.argv[1])
