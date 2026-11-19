#!/usr/bin/env python3
"""Build data/az/units.json and data/az/land.json: Arizona GMUs with display outlines, acreage and land ownership.

Usage: python3 -I scripts/az_build_land.py data/az/source/gmu-5070.json <az-sma-5070.json>

Inputs (saved from Claude in Chrome on 2026-11-18; neither shell can reach AZGFD's ArcGIS or BLM):
  gmu-5070.json   AZGFD's own ArcGIS Online org (os1CphwIyxBDDUGn), HunterDonationInteractiveWebmap_1921 layer 0:
                  80 GMU polygons ("Arizona Game Management Unit (GMU) boundaries", AZGFD GIS Program), Esri JSON,
                  outSR=5070, maxAllowableOffset=10. AZGFD's hunt areas such as 5B North, 7 East, 12A West and 22 North
                  are portions of these GMUs; the layer has no polygon for them.
  az-sma-5070.json BLM national SMA (BLM_Natl_SMA_LimitedScale/MapServer/1), all 144 features intersecting Arizona's
                  bounding box (Arizona's offices plus California, Nevada, Utah and New Mexico features that reach in),
                  Esri JSON, outSR=5070, maxAllowableOffset=20. Kept on the owner's PC (36 MB), not in the repo.

Method: Montana's raster (scripts/mt_build_land.py): 100 m equal-area cells, a cell belongs to a parcel when its centre
is inside it, parcels drawn largest first so inholdings overwrite. Ownership is not access: state trust land counts as
state land (Arizona trust land needs a recreation permit to hunt on foot; it is public for hunting with a valid
license per A.R.S. 37-... see the regulations), DOD land (Barry M. Goldwater, Yuma Proving Ground, Fort Huachuca) counts as
public but is closed or permit-only, as elsewhere.

Checks (the build stops if any fails): each GMU's raster area within 1% of its polygon (GMUs under 20 mi² exempt);
ownership covers >= 97% of each GMU's cells; statewide federal 38-46%, state 10-15%, tribal 24-30%.
Published: federal ~42% of Arizona, state trust ~12.7%, tribal ~27%, private ~18%.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mt_build_land import AGENCY, CLASSES, CODE, FEDERAL, PUBLIC, RES, Grid, display_geometry, poly_area, window  # noqa: E402

SMALL_SQMI = 20.0
# Arizona's SMA features name the military branch (BLM codes elsewhere use DOD); the Federal Bureau of Prisons and FAA
# parcels are other federal land
AGENCY = {**AGENCY, "ARMY": "DOD", "NAVY": "DOD", "USAF": "DOD", "BOP": "OTHER", "FAA": "OTHER"}
CLOSED = {"DOD"}

def signed(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]): a += x1 * y2 - x2 * y1
    return a / 2

def esri_polys(g):
    """Esri rings -> list of [outer, holes...]: outer rings run clockwise (negative signed area)."""
    out = []
    for r in g.get("rings", []):
        r = [tuple(p[:2]) for p in r]
        if len(r) < 4: continue
        if signed(r) < 0 or not out: out.append([r])
        else: out[-1].append(r)
    return out

def to_geojson(ps):
    return {"type": "MultiPolygon", "coordinates": [[[list(p) for p in ring] for ring in poly] for poly in ps]}

def measure(grid, own_a, key, ps, errors):
    mask, ox, oy = window(grid, ps)
    n = int(mask.sum())
    exact = sum(poly_area(p) for p in ps) / 2.589988e6
    if n == 0:
        if exact >= SMALL_SQMI: errors.append(f"{key}: no cells")
        return None
    approx = n * RES * RES / 2.589988e6
    if exact >= SMALL_SQMI and abs(approx - exact) / exact > 0.01:
        errors.append(f"{key}: raster {approx:.1f} mi² vs polygon {exact:.1f} mi²")
    vals = own_a[oy:oy + mask.shape[0], ox:ox + mask.shape[1]][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    covered = n - int(counts[0])
    if covered / n < 0.97: errors.append(f"{key}: ownership covers {covered / n:.1%}")
    if covered == 0: return None
    pct = {CLASSES[i]: round(100 * counts[i] / covered, 2) for i in range(1, len(CLASSES)) if counts[i]}
    pub = round(sum(v for k, v in pct.items() if k in PUBLIC), 1)
    closed = round(sum(v for k, v in pct.items() if k in CLOSED), 1)
    return {"acres": round(exact * 640), "sqmi": round(exact, 1), "publicPct": pub, "huntablePct": round(pub - closed, 1),
            "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
            "statePct": round(pct.get("STATE", 0.0), 1), "undeterminedPct": round(pct.get("UNDETERMINED", 0.0), 1), "ownership": pct}

def sort_key(name):
    m = re.match(r"(\d+)([A-Z]?)", name)
    return (int(m.group(1)), m.group(2)) if m else (999, name)

def main(gmu_path, sma_path):
    feats = json.load(open(gmu_path))["features"]
    sma = json.load(open(sma_path))["sma"]
    allp = [esri_polys(f["geometry"]) for f in feats]
    xs = [x for ps in allp for p in ps for x, _ in p[0]]; ys = [y for ps in allp for p in ps for _, y in p[0]]
    grid = Grid(min(xs) - 1000, min(ys) - 1000, max(xs) + 1000, max(ys) + 1000)
    print(f"grid {grid.w} x {grid.h} cells at {RES:.0f} m")
    parts, unknown = [], set()
    for f in sma:
        code = f["attributes"].get("ADMIN_AGENCY_CODE"); cls = AGENCY.get(code)
        if cls is None: unknown.add(code); continue
        for p in esri_polys(f["geometry"]): parts.append((poly_area(p), CODE[cls], p))
    if unknown: raise SystemExit(f"unmapped ADMIN_AGENCY_CODE values: {sorted(map(str, unknown))}")
    parts.sort(key=lambda t: -t[0])
    own_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
    for _, code, p in parts: grid.fill(own_a, [p], code)
    print(f"ownership: {len(parts)} parcels drawn")
    st = np.zeros((grid.h, grid.w), dtype=bool)
    for ps in allp: grid.fill(st, ps, True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES)); tot = int(st.sum()); cov = tot - int(sc[0])
    fed = sum(sc[CODE[c]] for c in FEDERAL) / cov; sta = sc[CODE["STATE"]] / cov; tri = sc[CODE["TRIBAL"]] / cov
    statewide = {"sqmi": round(tot * RES * RES / 2.589988e6), "federalPct": round(100 * fed, 1), "statePct": round(100 * sta, 1),
                 "tribalPct": round(100 * tri, 1), "coveragePct": round(100 * cov / tot, 1),
                 "pct": {CLASSES[i]: round(100 * sc[i] / cov, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print("statewide:", json.dumps(statewide))
    errors = []
    if not 0.38 <= fed <= 0.46: errors.append(f"statewide federal share {fed:.1%} outside 38-46%")
    if not 0.10 <= sta <= 0.15: errors.append(f"statewide state share {sta:.1%} outside 10-15%")
    if not 0.24 <= tri <= 0.30: errors.append(f"statewide tribal share {tri:.1%} outside 24-30%")
    info, units = {}, []
    for f, ps in zip(feats, allp):
        key = str(f["attributes"]["GMUNAME"] or "").strip().upper()
        if not key: continue  # unnamed features: tribal land outside the GMU system
        if key in info: errors.append(f"GMU {key}: two features")
        rec = measure(grid, own_a, f"GMU {key}", ps, errors)
        info[key] = rec
        geom = display_geometry(to_geojson(ps), eps=60.0)
        lon = [c[0] for q in geom["coordinates"] for c in q[0]]; lat = [c[1] for q in geom["coordinates"] for c in q[0]]
        u = {"name": key, "label": f"Unit {key}", "acres": rec["acres"] if rec else round(sum(poly_area(q) for q in ps) / 4046.8564224),
             "bbox": [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)], "geometry": geom}
        if rec:
            for k in ("publicPct", "privatePct", "tribalPct", "huntablePct"): u[k] = rec[k]
            u["ownership"] = [{"manager": k, "pct": v} for k, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]
        units.append(u)
    if errors: raise SystemExit("land checks failed:\n" + "\n".join(errors[:40]))
    out = Path(__file__).resolve().parent.parent / "data" / "az"
    (out / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (all features intersecting Arizona) x AZGFD GMUs, fetched 2026-11-18",
        "resolutionM": RES, "public": sorted(PUBLIC), "closedFederal": "DOD land counts as public in publicPct, as in every state, but not in huntablePct",
        "statewide": statewide, "gmus": dict(sorted(info.items(), key=lambda kv: sort_key(kv[0])))}, separators=(",", ":")) + "\n")
    (out / "units.json").write_text(json.dumps({
        "source": {"agency": "Arizona Game and Fish Department",
                   "service": "https://services2.arcgis.com/os1CphwIyxBDDUGn/ArcGIS/rest/services/HunterDonationInteractiveWebmap_1921/FeatureServer/0",
                   "geometry": "fetched at 10 m in EPSG:5070, simplified to ~60 m and projected to lon/lat for display; acreage from the 10 m polygons",
                   "retrieved": "2026-11-18"},
        "units": sorted(units, key=lambda u: sort_key(u["name"]))}, separators=(",", ":")) + "\n")
    print(f"wrote land.json and units.json: {len(units)} GMUs")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
