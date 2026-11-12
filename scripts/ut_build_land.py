#!/usr/bin/env python3
"""Build data/ut/units.json and data/ut/land.json: every Utah DWR hunt boundary with its display outline, acreage
and land ownership shares.

Usage: python3 -I scripts/ut_build_land.py <gis_dir>

Inputs, saved from Claude in Chrome on 2026-11-12 (neither shell can reach the agency servers; see CLAUDE.md):
  <gis_dir>/ut-boundaries-5070.json
      DWR dwrmapserv.utah.gov/dwrarcgis/rest/services/hunt/Boundaries_and_Tables/MapServer/0, all 709 boundaries,
      outSR=5070, maxAllowableOffset=10, geometryPrecision=0 (for acreage), plus `huntToBoundaries`: hunt number ->
      boundary IDs from the Utah Hunt Planner (dwrapps.utah.gov/huntboundary/HuntNumberToBoundaries).
  <gis_dir>/ut-guidebooks-and-sma.json, key `sma`
      BLM national Surface Management Agency (BLM_Natl_SMA_LimitedScale/MapServer/1), every feature intersecting
      Utah's bounding box (49 features: Utah's own 11 plus neighbouring states' offices whose holdings reach into
      Utah, e.g. Navajo Nation lands administered from Arizona and New Mexico), outSR=5070, maxAllowableOffset=20.

Method: Montana's (scripts/mt_build_land.py, imported here): 100 m equal-area raster, a cell belongs to a parcel
when its centre is inside it, parcels drawn largest first so inholdings overwrite. Same public classes as the
other states. Ownership is not access: Utah trust lands (SITLA) are counted as state land, as in every other state.

Checks (the build stops if any fails):
  - each boundary's raster area is within 1% of its polygon area (boundaries under 20 mi² are exempt: a 100 m cell
    is too coarse for them, and their acreage comes from the polygon);
  - ownership covers >= 97% of each boundary's cells (boundaries that reach outside Utah are exempt);
  - across Utah (the union of all boundaries), federal land is 60-68% and state land 6-11%. Published: the federal
    government manages ~63% of Utah (BLM ~42%, Forest Service ~15%, NPS ~4%), the state ~9% (trust lands ~6.5%
    plus parks, wildlife areas and sovereign lands), tribes ~4.5%, private ~22%.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mt_build_land import (  # noqa: E402
    AGENCY, CLASSES, CODE, FEDERAL, PUBLIC, RES, Grid, display_geometry, poly_area, polys, window,
)

SMALL_SQMI = 20.0


def measure(grid, own_a, key, ps, errors, inside_utah=True):
    mask, ox, oy = window(grid, ps)
    n = int(mask.sum())
    exact = sum(poly_area(p) for p in ps) / 2.589988e6
    if n == 0:
        if exact >= SMALL_SQMI:
            errors.append(f"{key}: empty raster")
        return None
    sqmi = n * RES * RES / 2.589988e6
    if exact >= SMALL_SQMI and abs(sqmi - exact) / exact > 0.01:
        errors.append(f"{key}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}")
    vals = own_a[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    covered = n - int(counts[0])
    if inside_utah and exact >= SMALL_SQMI and covered / n < 0.97:
        errors.append(f"{key}: ownership covers {covered / n:.1%}")
    if covered == 0:
        return None
    pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
    return {"acres": round(exact * 640), "sqmi": round(exact, 1),
            "publicPct": round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
            "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
            "undeterminedPct": round(pct.get("UNDETERMINED", 0.0), 1), "ownership": pct}


def main(gis: str) -> None:
    g = Path(gis)
    b = json.load(open(g / "ut-boundaries-5070.json"))
    feats = b["boundaries"]["features"]
    sma = json.load(open(g / "ut-guidebooks-and-sma.json"))["sma"]["features"]
    xs = [x for f in feats for p in polys(f["geometry"]) for x, _ in p[0]]
    ys = [y for f in feats for p in polys(f["geometry"]) for _, y in p[0]]
    grid = Grid(min(xs) - 1000, min(ys) - 1000, max(xs) + 1000, max(ys) + 1000)
    print(f"grid {grid.w} x {grid.h} cells at {RES:.0f} m")

    parts, unknown = [], set()
    for f in sma:
        code = f["properties"].get("ADMIN_AGENCY_CODE")
        cls = AGENCY.get(code)
        if cls is None:
            unknown.add(code)
            continue
        for p in polys(f["geometry"]):
            parts.append((poly_area(p), CODE[cls], p))
    if unknown:
        raise SystemExit(f"unmapped ADMIN_AGENCY_CODE values: {sorted(map(str, unknown))}")
    parts.sort(key=lambda t: -t[0])
    own_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
    for _, code, p in parts:
        grid.fill(own_a, [p], code)
    print(f"ownership: {len(parts)} parcels drawn")

    # Utah = the union of every hunt boundary (they tile the state many times over)
    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in feats:
        grid.fill(st, polys(f["geometry"]), True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES))
    tot = int(st.sum())
    fed = sum(sc[CODE[c]] for c in FEDERAL) / tot
    sta = sc[CODE["STATE"]] / tot
    statewide = {"sqmi": round(tot * RES * RES / 2.589988e6), "federalPct": round(100 * fed, 1), "statePct": round(100 * sta, 1),
                 "coveragePct": round(100 * (1 - sc[0] / tot), 1),
                 "pct": {CLASSES[i]: round(100 * sc[i] / tot, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print("statewide:", json.dumps(statewide))
    errors = []
    if not 0.60 <= fed <= 0.68:
        errors.append(f"statewide federal share {fed:.1%} outside 60-68%")
    if not 0.06 <= sta <= 0.11:
        errors.append(f"statewide state share {sta:.1%} outside 6-11%")

    info, units = {}, []
    for f in feats:
        p = f["properties"]
        bid = str(p["BoundaryID"])
        if bid in info:
            errors.append(f"boundary {bid}: two features")
        ps = polys(f["geometry"])
        if not ps:
            continue
        rec = measure(grid, own_a, f"boundary {bid} {p.get('Boundary_Name')}", ps, errors)
        info[bid] = rec
        geom = display_geometry(f["geometry"], eps=60.0)
        lon = [c[0] for q in geom["coordinates"] for c in q[0]]
        lat = [c[1] for q in geom["coordinates"] for c in q[0]]
        u = {"name": bid, "label": (p.get("Boundary_Name") or "").strip(), "btype": (p.get("BTYPE") or "").strip() or None,
             "status": p.get("Status"), "acres": rec["acres"] if rec else round(sum(poly_area(q) for q in ps) / 4046.8564224),
             "bbox": [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)], "geometry": geom}
        if rec:
            u["publicPct"], u["privatePct"] = rec["publicPct"], rec["privatePct"]
            u["ownership"] = [{"manager": k, "pct": v} for k, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]
        units.append(u)
    hunts = b["huntToBoundaries"]
    missing = sorted({str(x) for v in hunts.values() for x in v} - set(info))
    if missing:
        errors.append(f"hunt boundaries with no polygon: {missing[:20]}")
    if errors:
        raise SystemExit("land checks failed:\n" + "\n".join(errors[:40]))

    out = Path(__file__).resolve().parent.parent / "data" / "ut"
    out.mkdir(parents=True, exist_ok=True)
    (out / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (all features intersecting Utah) x DWR hunt boundaries, fetched 2026-11-12",
        "resolutionM": RES, "public": sorted(PUBLIC), "statewide": statewide,
        "boundaries": dict(sorted(info.items(), key=lambda kv: int(kv[0])))}, separators=(",", ":")) + "\n")
    (out / "units.json").write_text(json.dumps({
        "source": {"agency": "Utah Division of Wildlife Resources",
                   "service": "https://dwrmapserv.utah.gov/dwrarcgis/rest/services/hunt/Boundaries_and_Tables/MapServer/0",
                   "geometry": "fetched at 10 m in EPSG:5070, simplified to ~60 m and projected to lon/lat for display; acreage from the 10 m polygons",
                   "note": "Utah draws hunts on DWR hunt boundaries, not management units. A hunt can use several boundaries "
                           "(huntToBoundaries, from the Utah Hunt Planner), and boundaries overlap across species and hunt types.",
                   "retrieved": "2026-11-12"},
        "huntToBoundaries": dict(sorted(hunts.items())),
        "units": sorted(units, key=lambda u: int(u["name"]))}, separators=(",", ":")) + "\n")
    print(f"wrote land.json and units.json: {len(units)} boundaries, {len(hunts)} hunts mapped")


if __name__ == "__main__":
    main(sys.argv[1])
