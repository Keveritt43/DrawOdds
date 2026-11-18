#!/usr/bin/env python3
"""Build data/nm/units.json and data/nm/land.json: New Mexico GMUs with display outlines, acreage and land ownership.

Usage: python3 -I scripts/nm_build_land.py data/nm/source/gmu-areas-5070.json <nm-gis-5070.json>

Inputs (saved from Claude in Chrome on 2026-11-17; neither shell can reach NMDOW, ArcGIS Online or BLM, see CLAUDE.md):
  gmu-areas-5070.json  NMDOW's own ArcGIS Online services (org CjbW1bVhK4dB3WOa): NMDGF_Game_Management_Units_I_E__v2_WFL1
                       layer 0 (70 GMUs, updated 2026-08-31), NMDGF_Designated_Areas layer 0 (22 areas: Valle Vidal,
                       Burro Mountain, Fort Bayard, McGregor Range...), NM_Open_Gate_Public_View layer 0 (23 properties).
                       outSR=5070, maxAllowableOffset=10. (BLM's copy, gis.blm.gov/nmarcgis/.../NMDGF_NM_Game_Management_Units,
                       needs a token.)
  nm-gis-5070.json     key `sma`: BLM national SMA (BLM_Natl_SMA_LimitedScale/MapServer/1), all 37 features intersecting
                       New Mexico's bounding box (New Mexico's offices plus Arizona, Colorado and Utah features that reach in,
                       e.g. Navajo Nation lands administered from Arizona), outSR=5070, maxAllowableOffset=20. Kept on the
                       owner's PC (27 MB), not in the repo.

Method: Montana's raster (scripts/mt_build_land.py): 100 m equal-area cells, a cell belongs to a parcel when its centre
is inside it, parcels drawn largest first so inholdings overwrite. BLM's PVT class is drawn, so cells nothing covers are
counted as not covered rather than private. Ownership is not access: state trust land counts as state land, as in every
other state; DOD land (White Sands, McGregor) counts as public but is closed or permit-only, as elsewhere.

Checks (the build stops if any fails): each GMU's raster area within 1% of its polygon (GMUs under 20 mi² exempt);
ownership covers >= 97% of each GMU's cells; across the GMUs, federal 30-38%, state 9-14%, tribal 6-12%.
Published: the federal government manages ~34.7% of New Mexico (BLM ~17%, Forest Service ~12%, DOD ~4%),
state trust lands ~11.6%, tribes ~10%, private ~43%.
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


def measure(grid, own_a, key, ps, errors):
    mask, ox, oy = window(grid, ps)
    n = int(mask.sum())
    exact = sum(poly_area(p) for p in ps) / 2.589988e6
    if n == 0:
        if exact >= SMALL_SQMI:
            errors.append(f"{key}: no cells")
        return None
    approx = n * RES * RES / 2.589988e6
    if exact >= SMALL_SQMI and abs(approx - exact) / exact > 0.01:
        errors.append(f"{key}: raster {approx:.1f} mi² vs polygon {exact:.1f} mi²")
    vals = own_a[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    covered = n - int(counts[0])
    if covered / n < 0.97:
        errors.append(f"{key}: ownership covers {covered / n:.1%}")
    if covered == 0:
        return None
    pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
    return {"acres": round(exact * 640), "sqmi": round(exact, 1),
            "publicPct": round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
            "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
            "undeterminedPct": round(pct.get("UNDETERMINED", 0.0), 1), "ownership": pct}


def gmu_key(p):
    return str(p["GMU"]).strip().upper()


def sort_key(name):
    import re
    m = re.match(r"(\d+)([A-Z]?)", name)
    return (int(m.group(1)), m.group(2)) if m else (999, name)


def main(gmu_path: str, sma_path: str) -> None:
    src = json.load(open(gmu_path))
    feats = src["gmu"]["features"]
    sma = json.load(open(sma_path))["sma"]["features"]
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

    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in feats:
        grid.fill(st, polys(f["geometry"]), True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES))
    tot = int(st.sum())
    cov = tot - int(sc[0])
    fed = sum(sc[CODE[c]] for c in FEDERAL) / cov
    sta = sc[CODE["STATE"]] / cov
    tri = sc[CODE["TRIBAL"]] / cov
    statewide = {"sqmi": round(tot * RES * RES / 2.589988e6), "federalPct": round(100 * fed, 1), "statePct": round(100 * sta, 1),
                 "tribalPct": round(100 * tri, 1), "coveragePct": round(100 * cov / tot, 1),
                 "pct": {CLASSES[i]: round(100 * sc[i] / cov, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print("statewide:", json.dumps(statewide))
    errors = []
    if not 0.30 <= fed <= 0.38:
        errors.append(f"statewide federal share {fed:.1%} outside 30-38%")
    if not 0.09 <= sta <= 0.14:
        errors.append(f"statewide state share {sta:.1%} outside 9-14%")
    if not 0.06 <= tri <= 0.12:
        errors.append(f"statewide tribal share {tri:.1%} outside 6-12%")

    info, units = {}, []
    for f in feats:
        p = f["properties"]
        key = gmu_key(p)
        if key in info:
            errors.append(f"GMU {key}: two features")
        ps = polys(f["geometry"])
        rec = measure(grid, own_a, f"GMU {key}", ps, errors)
        info[key] = rec
        geom = display_geometry(f["geometry"], eps=60.0)
        lon = [c[0] for q in geom["coordinates"] for c in q[0]]
        lat = [c[1] for q in geom["coordinates"] for c in q[0]]
        u = {"name": key, "label": f"GMU {key}", "acres": rec["acres"] if rec else round(sum(poly_area(q) for q in ps) / 4046.8564224),
             "bbox": [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)], "geometry": geom}
        if rec:
            u["publicPct"], u["privatePct"], u["tribalPct"] = rec["publicPct"], rec["privatePct"], rec["tribalPct"]
            u["ownership"] = [{"manager": k, "pct": v} for k, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]
        units.append(u)
    if errors:
        raise SystemExit("land checks failed:\n" + "\n".join(errors[:40]))

    # designated hunt areas (Valle Vidal, Burro Mountain...) are measured too, for hunts limited to them
    areas = {}
    for f in src["designated"]["features"]:
        p = f["properties"]
        ps = polys(f["geometry"])
        e2: list[str] = []
        rec = measure(grid, own_a, p["Name"], ps, e2)
        areas[p["Name"].strip()] = {"gmu": p.get("gmu"), "desig": p.get("desig"), "acres": round(sum(poly_area(q) for q in ps) / 4046.8564224),
                                    "publicPct": rec["publicPct"] if rec else None}

    out = Path(__file__).resolve().parent.parent / "data" / "nm"
    out.mkdir(parents=True, exist_ok=True)
    (out / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (all features intersecting New Mexico) x NMDOW GMUs, fetched 2026-11-17",
        "resolutionM": RES, "public": sorted(PUBLIC), "statewide": statewide,
        "gmus": dict(sorted(info.items(), key=lambda kv: sort_key(kv[0]))), "designatedAreas": areas}, separators=(",", ":")) + "\n")
    (out / "units.json").write_text(json.dumps({
        "source": {"agency": "New Mexico Department of Wildlife",
                   "service": "https://services2.arcgis.com/CjbW1bVhK4dB3WOa/arcgis/rest/services/NMDGF_Game_Management_Units_I_E__v2_WFL1/FeatureServer/0",
                   "geometry": "fetched at 10 m in EPSG:5070, simplified to ~60 m and projected to lon/lat for display; acreage from the 10 m polygons",
                   "retrieved": "2026-11-17"},
        "units": sorted(units, key=lambda u: sort_key(u["name"]))}, separators=(",", ":")) + "\n")
    print(f"wrote land.json and units.json: {len(units)} GMUs")
    for u in sorted(units, key=lambda u: sort_key(u["name"]))[:70]:
        print(u["name"], u["acres"], u.get("publicPct"), u.get("tribalPct"), end=" | ")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
