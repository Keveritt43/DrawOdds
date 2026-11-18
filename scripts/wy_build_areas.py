#!/usr/bin/env python3
"""Build data/wy/units.json and data/wy/areas.json: Wyoming hunt areas (per species) with map geometry, size,
nonresident region, land ownership and Walk-In / Hunter Management Area acreage.

Usage: python3 -I scripts/wy_build_areas.py <gis_dir>

Inputs (downloaded by get-wgfd-2.ps1 from WGFD and BLM ArcGIS services):
  <species>-hunt-areas-{4326,5070}.geojson  WGFD hunt areas (HUNTAREA, Region, SqMiles)
  blm-sma-*.geojson                         BLM Wyoming Surface Management Agency (SURFACE), EPSG:5070
  walk-in-hunting-5070.geojson, hunter-management-areas-5070.geojson

Land math is done on a 100 m raster in EPSG:5070 (equal-area): a cell belongs to a polygon when its centre is
inside it (Montana's fill, scripts/mt_build_land.py Grid.fill, even-odd so holes stay out). Ownership parcels are
drawn largest first, so inholdings drawn later overwrite the parcel around them.

Until Nov 18, 2026 this used PIL's ImageDraw.polygon, which fills every cell a polygon's outline touches. That adds
about one cell of border to every parcel, so small parcels came out 20-60% too large (a 40-acre parcel covers ~16
cells; its border adds ~16 more) and, drawn last, overwrote their neighbours. Wyoming's thousands of small state
sections and private inholdings were inflated at the expense of the large BLM and Forest Service parcels around
them. The change and its effect per area are in docs/states/wy-onboarding.md ("Land: centre-sampled raster").

Checks (the build stops if any fails):
  - each hunt area's raster area is within 1% of its exact polygon area (2% under 200 mi²);
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
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mt_build_land import Grid as CentreGrid  # noqa: E402

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


class Grid(CentreGrid):
    """Montana's centre-sampled fill on the same 100 m EPSG:5070 grid."""

    def draw(self, arr, geom, value, ox=0, oy=0):
        self.fill(arr, rings(geom), value, ox=ox, oy=oy)

    def mask(self, geom):
        """A window around geom: (mask, ox, oy), so a hunt area doesn't need a full-state array."""
        ps = rings(geom)
        bx = [x for p in ps for x, _ in p[0]]
        by = [y for p in ps for _, y in p[0]]
        ox, oy = int((min(bx) - self.x0) / RES) - 1, int((self.y1 - max(by)) / RES) - 1
        w, h = int((max(bx) - min(bx)) / RES) + 3, int((max(by) - min(by)) / RES) + 3
        m = np.zeros((h, w), dtype=bool)
        self.fill(m, ps, True, ox=ox, oy=oy)
        return m, ox, oy


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
    own_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
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
        grid.draw(own_a, geom, code)
    print(f"ownership: {len(parcels)} parcels drawn")

    acc_a = np.zeros((grid.h, grid.w), dtype=bool)
    access_feats = []
    for name in ("walk-in-hunting-5070.geojson", "hunter-management-areas-5070.geojson"):
        for f in load(g / name):
            grid.draw(acc_a, f["geometry"], True)
            pts = [p for poly in rings(f["geometry"]) for p in poly[0]]
            if pts:
                cx, cy = sum(p[0] for p in pts) / len(pts), grid.y1 - sum(p[1] for p in pts) / len(pts)
                access_feats.append((int((cx - grid.x0) / RES), int(cy / RES)))

    # statewide sanity (inside the union of deer hunt areas = all of Wyoming)
    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in areas5070["deer"]:
        grid.draw(st, f["geometry"], True)
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
            mask, ox, oy = grid.mask(f["geometry"])
            n = int(mask.sum())
            if n == 0:
                errors.append(f"{sp} {num}: empty raster")
                continue
            sqmi = n * RES * RES / 2.589988e6
            # check the raster against the exact polygon area (WGFD's SqMiles attribute is stale for redrawn areas,
            # e.g. 2026 deer 138/143/155/156; it is kept as wgfdSqmi for reference only)
            exact = sum(ring_area(poly[0]) - sum(ring_area(h) for h in poly[1:]) for poly in rings(f["geometry"])) / 2.589988e6
            tol = 0.01 if exact >= 200 else 0.02
            if exact > 5 and abs(sqmi - exact) / exact > tol:
                errors.append(f"{sp} {num}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}")
            win = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
            vals = own_a[win][mask]
            counts = np.bincount(vals, minlength=len(CLASSES))
            covered = n - counts[0]
            if covered / n < 0.97:
                errors.append(f"{sp} {num}: ownership covers {covered / n:.1%}")
            pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
            public = sum(v for k, v in pct.items() if k in PUBLIC)
            acc_cells = int((acc_a[win] & mask).sum())
            acc_n = sum(1 for (cx, cy) in access_feats if 0 <= cy - oy < mask.shape[0] and 0 <= cx - ox < mask.shape[1] and mask[cy - oy, cx - ox])
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
