#!/usr/bin/env python3
"""Build data/wa/units.json and data/wa/land.json: Washington GMUs, Deer Areas and Elk Areas with display
outlines, acreage, land ownership and WDFW private-lands access acreage.

Usage: python3 -I scripts/wa_build_land.py data/wa/source/gmu-areas-2026.json <wa-land-access-5070.json>

Inputs (saved from Claude in Chrome on 2026-11-12; neither shell can reach WDFW or BLM, see CLAUDE.md):
  gmu-areas-2026.json  WDFW HOReferenceService/MapServer layers 0 (GMU), 4 (Deer Areas), 5 (Elk Areas),
                       EPSG:5070 at 10 m ("In effect April 1 2026 to March 31 2027").
  wa-land-access-5070.json (owner's PC, Downloads\\huntapp\\wa)
      sma:    BLM national SMA (BLM_Natl_SMA_LimitedScale/MapServer/1), every non-private feature intersecting
              Washington's bounding box. Washington's federal land is administered from the Oregon/Washington
              offices, so ADMIN_ST is 'OR' (and 'ID' near the border); there is no ADMIN_ST='WA'. Esri rings,
              clipped to the GMU extent + 2 km, 30 m generalisation.
      access: WDFW HOPubMapService1/MapServer/2, private-lands hunting access polygons (Feel Free to Hunt,
              Register to Hunt, Hunt by Written Permission, ...).

Method: Montana's raster (scripts/mt_build_land.py): 100 m equal-area cells, a cell belongs to a parcel when its
centre is inside it (even-odd over all of a feature's rings, so holes stay holes). Cells no SMA feature covers
count as private, as BLM's private class was not fetched. Ownership is not access: DNR trust land counts as
state land, as in every other state; national parks count as public but are closed to hunting, as elsewhere.

Checks (the build stops if any fails): every GMU's raster area within 1% of its polygon (GMUs under 20 mi²
exempt); across the GMUs, federal 25-33% and state 9-18%. Published: the federal government owns ~28% of
Washington (Forest Service ~21%, NPS ~4%), the state ~13% (DNR uplands ~5.6M of 43M acres, WDFW ~1M, parks).
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


def ring_signed(r):
    a = 0.0
    for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1]):
        a += x1 * y2 - x2 * y1
    return a / 2


def esri_area(rings):
    # Esri: exterior rings clockwise (negative signed area with y up), holes counter-clockwise
    return -sum(ring_signed(r) for r in rings)


def measure(grid, own_a, acc_a, ps, errors, key):
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
    sl = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
    vals = own_a[sl][mask]
    counts = np.bincount(vals, minlength=len(CLASSES))
    pct = {CLASSES[i]: round(100 * counts[i] / n, 2) for i in range(1, len(CLASSES)) if counts[i]}
    acc = acc_a[sl][mask]
    progs = {}
    for code, name in ACCESS_NAMES.items():
        c = int((acc == code).sum())
        if c:
            progs[name] = round(c * RES * RES / 4046.8564224)
    return {"acres": round(exact * 640), "sqmi": round(exact, 1),
            "publicPct": round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
            "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
            "ownership": pct, "accessAcres": sum(progs.values()), "accessPrograms": progs}


ACCESS_NAMES: dict[int, str] = {}


def main(gmu_path: str, land_path: str) -> None:
    g = json.load(open(gmu_path))["layers"]
    land = json.load(open(land_path))
    layers = [("gmu", g["gmu_5070"]["features"]), ("deer", g["deer_areas_5070"]["features"]),
              ("elk", g["elk_areas_5070"]["features"])]
    # GMU 2 is "Unassigned Water" (LndH2O_Ind 2); GMU 51 is North Cascades National Park, closed to hunting.
    # Both count toward the statewide check (51 is land), neither becomes a unit.
    gmus = [f for f in layers[0][1] if f["properties"].get("LndH2O_Ind") == 1]
    layers[0] = ("gmu", [f for f in gmus if f["properties"]["GMU_Num"] >= 100])
    xs = [x for f in gmus for p in polys(f["geometry"]) for x, _ in p[0]]
    ys = [y for f in gmus for p in polys(f["geometry"]) for _, y in p[0]]
    grid = Grid(min(xs) - 1000, min(ys) - 1000, max(xs) + 1000, max(ys) + 1000)
    print(f"grid {grid.w} x {grid.h} cells at {RES:.0f} m")

    own_a = np.full((grid.h, grid.w), CODE["PRIVATE"], dtype=np.uint8)
    # Agency codes Montana's table doesn't have: Bonneville Power (DOE) and Coast Guard (DHS) count as other federal
    AGENCY.update({"BPA": "OTHER", "USCG": "OTHER"})
    feats, unknown = [], set()
    for f in land["sma"]["features"]:
        code = f["attributes"].get("ADMIN_AGENCY_CODE")
        cls = AGENCY.get(code)
        if cls is None:
            unknown.add(code)
            continue
        feats.append((abs(esri_area(f["rings"])), CODE[cls], f["rings"]))
    if unknown:
        raise SystemExit(f"unmapped ADMIN_AGENCY_CODE values: {sorted(map(str, unknown))}")
    feats.sort(key=lambda t: -t[0])
    for _, code, rings in feats:
        grid.fill(own_a, [rings], code)
    print(f"ownership: {len(feats)} SMA features drawn")

    acc_a = np.zeros((grid.h, grid.w), dtype=np.uint8)
    names = sorted({f["attributes"]["ProjectTypeName"] for f in land["access"]["features"]})
    for i, n in enumerate(names, start=1):
        ACCESS_NAMES[i] = n
    rev = {n: i for i, n in ACCESS_NAMES.items()}
    for f in land["access"]["features"]:
        rings = f["geometry"]["rings"]
        grid.fill(acc_a, [rings], rev[f["attributes"]["ProjectTypeName"]])

    st = np.zeros((grid.h, grid.w), dtype=bool)
    for f in gmus:
        grid.fill(st, polys(f["geometry"]), True)
    sc = np.bincount(own_a[st], minlength=len(CLASSES))
    tot = int(st.sum())
    fed = sum(sc[CODE[c]] for c in FEDERAL) / tot
    sta = sc[CODE["STATE"]] / tot
    statewide = {"sqmi": round(tot * RES * RES / 2.589988e6), "federalPct": round(100 * fed, 1),
                 "statePct": round(100 * sta, 1),
                 "pct": {CLASSES[i]: round(100 * sc[i] / tot, 2) for i in range(1, len(CLASSES)) if sc[i]}}
    print("statewide:", json.dumps(statewide))
    errors = []
    if not 0.25 <= fed <= 0.33:
        errors.append(f"statewide federal share {fed:.1%} outside 25-33%")
    if not 0.09 <= sta <= 0.18:
        errors.append(f"statewide state share {sta:.1%} outside 9-18%")

    info, units = {}, []
    for kind, fs in layers:
        for f in fs:
            p = f["properties"]
            if kind == "gmu":
                key, label = str(p["GMU_Num"]), (p.get("GMU_Name") or "").strip()
                extra = {"side": {1: "EAST", 2: "WEST"}.get(p.get("EastWest_Ind")), "region": p.get("WDFWReg_Num")}
            elif kind == "deer":
                key, label, extra = f"DA{p['DA_Id']}", (p.get("DA_Name") or "").strip(), {}
            else:
                key, label, extra = f"EA{p['EA_ID']}", (p.get('EA_Name') or '').strip(), {}
            ps = polys(f["geometry"])
            if not ps:
                continue
            if key in info:
                # a few areas come as several features: merge them
                ps = ps + info[key]["_ps"]
            rec = measure(grid, own_a, acc_a, ps, errors, f"{kind} {key} {label}")
            info[key] = dict(rec or {}, _ps=ps)
            geom = display_geometry({"type": "MultiPolygon", "coordinates": ps}, eps=60.0)
            lon = [c[0] for q in geom["coordinates"] for c in q[0]]
            lat = [c[1] for q in geom["coordinates"] for c in q[0]]
            u = {"name": key, "kind": kind, "label": label, **{k: v for k, v in extra.items() if v is not None},
                 "acres": rec["acres"] if rec else round(sum(poly_area(q) for q in ps) / 4046.8564224),
                 "bbox": [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)],
                 "geometry": geom}
            if rec:
                u["publicPct"], u["privatePct"] = rec["publicPct"], rec["privatePct"]
                u["ownership"] = [{"manager": k, "pct": v} for k, v in sorted(rec["ownership"].items(), key=lambda kv: -kv[1])]
            units = [x for x in units if x["name"] != key] + [u]
    if errors:
        raise SystemExit("land checks failed:\n" + "\n".join(errors[:40]))
    for v in info.values():
        v.pop("_ps", None)

    def sk(k):
        return (0, int(k)) if k.isdigit() else (1 if k.startswith("DA") else 2, int(k[2:]))
    out = Path(__file__).resolve().parent.parent / "data" / "wa"
    out.mkdir(parents=True, exist_ok=True)
    (out / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (features intersecting Washington; WA is administered as "
                  "ADMIN_ST 'OR') x WDFW GMUs, Deer Areas and Elk Areas; WDFW private-lands access polygons; fetched 2026-11-12",
        "resolutionM": RES, "public": sorted(PUBLIC), "statewide": statewide, "accessPrograms": names,
        "units": dict(sorted(info.items(), key=lambda kv: sk(kv[0])))}, separators=(",", ":")) + "\n")
    (out / "units.json").write_text(json.dumps({
        "source": {"agency": "Washington Department of Fish and Wildlife",
                   "service": "https://geodataservices.wdfw.wa.gov/arcgis/rest/services/MapServices/HOReferenceService/MapServer (0, 4, 5)",
                   "inEffect": "April 1 2026 to March 31 2027",
                   "geometry": "fetched at 10 m in EPSG:5070, simplified to ~60 m and projected to lon/lat; acreage from the 10 m polygons",
                   "retrieved": "2026-11-12"},
        "units": sorted(units, key=lambda u: sk(u["name"]))}, separators=(",", ":")) + "\n")
    print(f"wrote land.json and units.json: {len(units)} units "
          f"({sum(u['kind'] == 'gmu' for u in units)} GMUs, {sum(u['kind'] == 'deer' for u in units)} deer areas, "
          f"{sum(u['kind'] == 'elk' for u in units)} elk areas)")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
