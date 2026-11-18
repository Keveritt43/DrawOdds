#!/usr/bin/env python3
"""Add Washington's moose areas, bighorn sheep units and mountain goat units to data/wa/units.json and land.json.

Usage: python3 -I scripts/wa_build_msg_land.py

Moose permits use GMUs (already in units.json) and WDFW Moose Areas 1 and 2 (inside GMU 124); sheep permits use
WDFW Sheep Units; goat permits use Mountain Goat Units. None of those three is a GMU, Deer Area or Elk Area, so
scripts/wa_build_land.py doesn't build them, and its statewide SMA input isn't in the repo (owner's PC). This script
measures only the new units, from inputs saved in Claude in Chrome on 2026-11-17:

  data/wa/source/msg-regulation-2017-2026.json  WDFW Hunt Planner Regulation service: the regulation rows (which unit
      each 2026 moose/sheep/goat permit uses) and UnitSpatial outlines, EPSG:5070 at 10 m.
  data/wa/source/msg-land-5070.json  BLM national SMA (non-private) and WDFW private-lands access polygons
      intersecting each unit's envelope + 2 km; SMA rings clipped to that envelope; 30 m generalisation.

Method and classes are wa_build_land.py's (Montana's 100 m centre-sampled raster). Each unit is measured only
against the SMA features fetched for its own envelope, so a feature clipped twice is never drawn twice. Keys:
MA1/MA2 (Moose Area), SH<n> (Sheep Unit n), MG<a>-<b> (Mountain Goat Unit a-b). Existing GMU/Deer/Elk Area entries
are left byte-for-byte as they are; re-running replaces only these keys.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mt_build_land import AGENCY, CLASSES, CODE, PUBLIC, RES, Grid, display_geometry, poly_area, polys, window  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "wa" / "source"
AGENCY.update({"BPA": "OTHER", "USCG": "OTHER"})


def unit_key(unit_type: str, text: str) -> str | None:
    if unit_type == "Moose Area":
        m = re.search(r"(\d+)", text)
        return f"MA{m.group(1)}" if m else None
    if unit_type == "Bighorn Sheep Area":
        m = re.search(r"(\d+)", text)
        return f"SH{m.group(1)}" if m else None
    if unit_type == "Mountain Goat Area":
        m = re.search(r"(\d+-\d+[a-z]?)", text)
        return f"MG{m.group(1)}" if m else None
    return None


def label_of(key: str) -> str:
    if key.startswith("MA"):
        return f"Moose Area {key[2:]}"
    if key.startswith("SH"):
        return f"Sheep Unit {key[2:]}"
    return f"Mountain Goat Unit {key[2:]}"


def signed(r):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:] + r[:1])) / 2


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            c = not c
    return c


def esri_polys(rings):
    """Esri rings (outer clockwise, holes counter-clockwise) -> GeoJSON-style polygons [outer, *holes]."""
    outers = [[r] for r in rings if signed(r) < 0]
    for r in rings:
        if signed(r) >= 0:
            host = next((p for p in outers if inside(r[0], p[0])), None)
            if host is not None:
                host.append(r)
    return outers


def main() -> None:
    reg = json.load(open(SRC / "msg-regulation-2017-2026.json"))
    land = json.load(open(SRC / "msg-land-5070.json"))
    geo = {f["attributes"]["UnitID"]: f for f in reg["units5070"]}
    want = {}
    for r in reg["regulation"]:
        if r["LicenseYear"] != 2026 or r["UnitType"] == "GMU":
            continue
        k = unit_key(r["UnitType"], r["UnitNumberTypeText"] or "")
        if not k:
            raise SystemExit(f"unrecognised unit {r['UnitType']} {r['UnitNumberTypeText']}")
        want[k] = r["UnitID"]
    sma = land["sma"]
    env_of = {uid: i for i, uid in enumerate(sma["unitIds"])}
    acc_names = sorted({f["attributes"]["ProjectTypeName"] for f in land["access"]["features"]})
    acc_code = {n: i for i, n in enumerate(acc_names, start=1)}
    units_file = ROOT / "data" / "wa" / "units.json"
    land_file = ROOT / "data" / "wa" / "land.json"
    units = json.loads(units_file.read_text())
    lands = json.loads(land_file.read_text())
    gmu_layer = json.load(open(SRC / "gmu-areas-2026.json"))["layers"]["gmu_5070"]["features"]
    gmus = [(str(f["properties"]["GMU_Num"]), polys(f["geometry"])) for f in gmu_layer
            if f["properties"].get("LndH2O_Ind") == 1 and f["properties"]["GMU_Num"] >= 100]
    errors, new_units, new_land = [], [], {}
    for key, uid in sorted(want.items()):
        f = geo.get(uid)
        if f is None or uid not in env_of:
            errors.append(f"{key}: no outline / land input for UnitID {uid}")
            continue
        ps = esri_polys(f["geometry"]["rings"])
        x0, y0, x1, y1 = sma["env"][env_of[uid]]
        grid = Grid(x0, y0, x1, y1)
        own = np.full((grid.h, grid.w), CODE["PRIVATE"], dtype=np.uint8)
        feats = []
        for s in sma["features"]:
            if s["env"] != env_of[uid]:
                continue
            cls = AGENCY.get(s["attributes"]["ADMIN_AGENCY_CODE"])
            if cls is None:
                errors.append(f"unmapped agency {s['attributes']['ADMIN_AGENCY_CODE']}")
                continue
            feats.append((abs(signed(s["rings"][0])) if s["rings"] else 0, CODE[cls], s["rings"]))
        for _, code, rings in sorted(feats, key=lambda t: -t[0]):
            grid.fill(own, [rings], code)
        acc = np.zeros((grid.h, grid.w), dtype=np.uint8)
        for a in land["access"]["features"]:
            grid.fill(acc, [a["geometry"]["rings"]], acc_code[a["attributes"]["ProjectTypeName"]])
        mask, ox, oy = window(grid, ps)
        n = int(mask.sum())
        exact = sum(poly_area(p) for p in ps) / 2.589988e6
        sqmi = n * RES * RES / 2.589988e6
        if not n or abs(sqmi - exact) / exact > 0.02:
            errors.append(f"{key}: raster {sqmi:.1f} mi² vs polygon {exact:.1f}")
            continue
        sl = (slice(oy, oy + mask.shape[0]), slice(ox, ox + mask.shape[1]))
        counts = np.bincount(own[sl][mask], minlength=len(CLASSES))
        pct = {CLASSES[i]: round(100 * counts[i] / n, 2) for i in range(1, len(CLASSES)) if counts[i]}
        av = acc[sl][mask]
        progs = {nm: round(int((av == c).sum()) * RES * RES / 4046.8564224) for nm, c in acc_code.items() if int((av == c).sum())}
        rec = {"acres": round(exact * 640), "sqmi": round(exact, 1),
               "publicPct": round(sum(v for k, v in pct.items() if k in PUBLIC), 1),
               "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
               "ownership": pct, "accessAcres": sum(progs.values()), "accessPrograms": progs}
        # the GMUs this unit lies in (>= 5% of its cells): the Unit Map shades GMUs, so a sheep or goat unit's permits
        # count in these, as Deer and Elk Area permits count in the GMUs they list
        bx0, by1 = grid.x0 + ox * RES, grid.y1 - oy * RES
        bx1, by0 = bx0 + mask.shape[1] * RES, by1 - mask.shape[0] * RES
        inside_g = []
        for gk, gps in gmus:
            xs = [x for p in gps for x, _ in p[0]]; ys = [y for p in gps for _, y in p[0]]
            if max(xs) < bx0 or min(xs) > bx1 or max(ys) < by0 or min(ys) > by1:
                continue
            gm = np.zeros(mask.shape, dtype=bool)
            grid.fill(gm, gps, True, ox=ox, oy=oy)
            share = float((gm & mask).sum()) / n
            if share >= 0.05:
                inside_g.append((gk, round(share, 3)))
        geom = display_geometry({"type": "MultiPolygon", "coordinates": ps}, eps=60.0)
        lon = [c[0] for q in geom["coordinates"] for c in q[0]]
        lat = [c[1] for q in geom["coordinates"] for c in q[0]]
        kind = "moose" if key.startswith("MA") else "sheep" if key.startswith("SH") else "goat"
        new_units.append({"name": key, "kind": kind, "label": label_of(key), "acres": rec["acres"],
                          "bbox": [round(min(lon), 5), round(min(lat), 5), round(max(lon), 5), round(max(lat), 5)],
                          "geometry": geom, "gmus": [g for g, _ in sorted(inside_g, key=lambda t: -t[1])], "publicPct": rec["publicPct"], "privatePct": rec["privatePct"],
                          "ownership": [{"manager": k, "pct": v} for k, v in sorted(pct.items(), key=lambda kv: -kv[1])]})
        new_land[key] = dict(rec, gmus=[g for g, _ in sorted(inside_g, key=lambda t: -t[1])])
        print(f"{key:7} {label_of(key):24} {exact:7.1f} mi²  public {rec['publicPct']:5.1f}%  GMUs {inside_g}  "
              + ", ".join(f"{k} {v}" for k, v in sorted(pct.items(), key=lambda kv: -kv[1])[:4]))
    if errors:
        raise SystemExit("checks failed:\n" + "\n".join(errors))
    keys = set(new_land)
    units["units"] = [u for u in units["units"] if u["name"] not in keys] + new_units
    units["source"]["msgUnits"] = ("Moose Areas, Sheep Units and Mountain Goat Units: WDFW Hunt Planner Regulation "
                                   "service UnitSpatial (WP_HuntPlanner/Regulation/MapServer/0), retrieved 2026-11-17")
    lands["units"] = {k: v for k, v in lands["units"].items() if k not in keys} | dict(sorted(new_land.items()))
    lands["msgSource"] = ("Moose Areas, Sheep Units, Mountain Goat Units: BLM national SMA and WDFW private-lands access "
                          "polygons fetched per unit envelope on 2026-11-17 (scripts/wa_build_msg_land.py)")
    units_file.write_text(json.dumps(units, separators=(",", ":")) + "\n")
    land_file.write_text(json.dumps(lands, separators=(",", ":")) + "\n")
    print(f"wrote {len(new_units)} units")


if __name__ == "__main__":
    main()
