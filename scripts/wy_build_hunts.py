#!/usr/bin/env python3
"""Build data/wy/hunts.json: one record per Wyoming hunt for the app, from the checked inputs in data/wy/.

Usage: python3 -I scripts/wy_build_hunts.py

Inputs (all built and validated by the other wy_* scripts):
  data/wy/draws.json      WGFD draw demand reports 2021-2026 (wy_build_draws.py)
  data/wy/regs-2026.json  2026 season tables: dates, quotas, limitations (wy_parse_regs.py)
  data/wy/harvest.json    WGFD harvest reports by hunt area and type (wy_parse_harvest.py), optional
  data/wy/areas.json      hunt-area size, region and land ownership (wy_build_areas.py), optional

Hunts:
  - limited quota licenses in the 2026 draw (area + type), all three species, full price;
  - nonresident region general deer/elk licenses (letter regions) in the 2026 draw;
  - general seasons by hunt area (residents buy a general license over the counter; nonresidents need
    the region general license for that area's region).
Reduced-price doe/fawn and cow/calf licenses are out of scope (their draw reports are not loaded).

Projection: Colorado's method (docs/states/co.md) applied to the preference cutoff: last draw's effective cutoff
plus each decile of the measured year-to-year moves for that species and cutoff band, floored at the last draw;
odds are averaged over those outcomes. Backtest (docs/states/wy-draw-model.md, Brier): beats last draw's odds
for antelope and deer, not for elk, so elk has no projection.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data" / "wy"
SPECIES = {"antelope": "PRONGHORN", "deer": "DEER", "elk": "ELK"}
PREFIX = {"antelope": "A", "deer": "D", "elk": "E"}
PROJECT = {"antelope": True, "deer": True, "elk": False}
# WGFD's elk nonresident region layer names regions; the draw reports use letters
REGION_CODE = {"Eastern": "E", "Southern": "S", "Western": "W"}
region_of = lambda info: REGION_CODE.get(info.get("region") or "", info.get("region"))
BANDS = [1, 3, 6, 10]
QS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
MAX_PTS = 30


def eff(rows):
    for _q, _i, k, p, a, o in rows:
        if k == "r":
            return p + 1.0
        if a and o < 100:
            return p - (0.5 if k == "p" else 0) + (1 - o / 100)
    return None


def pref_odds(pref, p):
    if pref["quota"] <= 0:
        return 0.0
    rows = pref["rows"]
    for r in rows:
        if r[2] == "e" and r[3] == p:
            return r[5] / 100
    res = [r for r in rows if r[2] == "r"]
    if res and p <= res[0][3]:
        return res[0][5] / 100
    top = max([r[3] for r in rows if r[2] != "r"], default=-1)
    if p > top:
        return 1.0
    below = [r for r in rows if r[2] != "r" and r[3] <= p]
    return below[0][5] / 100 if below else 0.0


def eff_odds(e, p):
    if e is None:
        return 1.0
    lvl = math.floor(e + 1e-9)
    return 1.0 if p > lvl else (1 - (e - lvl) if p == lvl else 0.0)


def random_odds(r):
    if r is None or r["quota"] is None:
        return None
    if r["quota"] <= 0:
        return 0.0
    return 1.0 if r["apps"][0] <= 0 else min(1.0, r["quota"] / r["apps"][0])


def band(e):
    return next((i for i, b in enumerate(BANDS) if e < b), len(BANDS))


def calibration(hunts):
    groups = [[] for _ in range(len(BANDS) + 1)]
    for h in hunts.values():
        ys = sorted(h["years"])
        for a, b in zip(ys, ys[1:]):
            if int(b) != int(a) + 1:
                continue
            for pool in ("regular", "special"):
                pa, pb = h["years"][a].get(pool), h["years"][b].get(pool)
                if pa and pb:
                    ea, eb = eff(pa["pref"]["rows"]), eff(pb["pref"]["rows"])
                    if ea is not None and eb is not None:
                        groups[band(ea)].append(eb - ea)
    out = []
    for g in groups:
        g.sort()
        out.append([round(g[math.floor(q * (len(g) - 1))], 2) for q in QS] if g else [0.0] * len(QS))
    return {"bands": BANDS, "q": out, "n": [len(g) for g in groups]}


def projection(pref, cal):
    base = eff(pref["rows"])
    if base is None:
        return None
    qs = sorted(round(max(base, base + max(0.0, d)), 2) for d in cal["q"][band(base)])
    return {"base": round(base, 4), "qs": qs, "eff": qs[len(qs) // 2], "lo": qs[0], "hi": qs[-1]}


def table(pool, mode, proj):
    """Odds at 0..MAX_PTS points: preference phase then random phase among those who missed."""
    rnd = random_odds(pool["random"])
    arr = []
    for p in range(MAX_PTS + 1):
        if mode == "proj" and proj is not None:
            pr = sum(eff_odds(e, p) for e in proj["qs"]) / len(proj["qs"])
        else:
            pr = pref_odds(pool["pref"], p)
        total = pr if rnd is None else pr + (1 - pr) * rnd
        arr.append(round(total, 3))
    while len(arr) > 1 and arr[-1] == arr[-2]:
        arr.pop()
    return arr


def antler_class(species, lim):
    t = lim.lower()
    if re.search(r"\b(doe|fawn|cow|calf|antlerless)\b", t) and not re.search(r"\bany (antelope|deer|elk)\b|antlered", t):
        return "ANTLERLESS"
    if "antlered" in t and "antlerless" not in t:
        return "ANTLERED"
    return "EITHER"


def weapon_of(lim):
    t = lim.lower()
    if "archery only" in t:
        return "ARCHERY"
    if "muzzle" in t and "only" in t:
        return "MUZZLELOADER"
    return "ANY"


def season_span(segments):
    starts, ends = [], []
    for s in segments:
        for k in ("archery", "regular"):
            if s.get(k):
                starts.append(s[k][0])
                ends.append(s[k][1])
    return (min(starts), max(ends)) if starts else (None, None)


def load(name):
    p = ROOT / name
    return json.loads(p.read_text()) if p.exists() else None


def main():
    draws = load("draws.json")
    regs = load("regs-2026.json")
    harvest = load("harvest.json") or {"species": {}}
    areas = load("areas.json") or {"species": {}}
    latest = max(draws["years"])
    out = []
    problems = []
    for sp, SP in SPECIES.items():
        hunts = draws["hunts"][sp]
        cal = calibration(hunts)
        lic = regs["species"][sp]["licenses"]
        ainfo = areas["species"].get(sp, {})
        hinfo = harvest["species"].get(sp, {})

        def unit(area):
            return f"{PREFIX[sp]}{int(area)}"

        def harvest_for(key):
            ys = sorted(hinfo.get(key, []), key=lambda h: h["year"])
            return ys

        for key, h in sorted(hunts.items()):
            y = h["years"].get(str(latest))
            if not y or not (y.get("regular") or y.get("res")):
                continue
            region = h["type"] is None
            if region and h["area"] == "GEN":
                continue  # resident general licenses: sold over the counter, not drawn (see general seasons below)
            if region:
                code, lkey, units = f"{h['area']}", None, [f"{PREFIX[sp]}R-{h['area']}"]
                region_units = [unit(a) for a, info in ainfo.items() if region_of(info) == h["area"]]
                if not region_units and ainfo:
                    problems.append(f"{sp} region {h['area']}: no hunt areas in that region")
                reg = None
            else:
                lkey = f"{int(h['area'])}-{h['type']}"
                reg = lic.get(lkey)
                if not reg:
                    problems.append(f"{sp} {lkey}: in the draw, not in the regulations")
                    continue
                areas_ = reg["sharedAreas"] or [h["area"]]
                units = [unit(a) for a in areas_]
                region_units = None
            pools = {}
            for pool in ("regular", "special"):
                pdat = y.get(pool)
                if not pdat:
                    continue
                proj = projection(pdat["pref"], cal) if PROJECT[sp] else None
                hist = []
                for yr in sorted(h["years"]):
                    q = h["years"][yr].get(pool)
                    if q:
                        hist.append({"year": int(yr), "eff": eff(q["pref"]["rows"]), "prefQuota": q["pref"]["quota"],
                                     "randomQuota": q["random"]["quota"], "apps1": sum(r[4] for r in q["pref"]["rows"])})
                pools[pool] = {"pref": pdat["pref"], "random": pdat["random"], "eff": eff(pdat["pref"]["rows"]),
                               "proj": proj, "history": hist}
            res = y.get("res")
            res_hist = [{"year": int(yr), "quota": h["years"][yr]["res"]["quota"], "apps": h["years"][yr]["res"]["apps"]}
                        for yr in sorted(h["years"]) if h["years"][yr].get("res")]
            segs = reg["segments"] if reg else []
            lim = "; ".join(dict.fromkeys(s["limitations"] for s in segs if s["limitations"])) if reg else "Nonresident region general license"
            open_d, close_d = season_span(segs)
            # Private-land-only means every season segment restricts the license to private land. Checking only the
            # first segment wrongly flagged licenses that open to the entire area later (D24-3, E16-4, E33-4, E78-2,
            # E124-2: a wrapped boundary line, then an unrestricted segment).
            private_only = bool(segs) and all(
                re.search(r"valid (only )?on private land|private land only", (s["limitations"] or "").lower())
                and not re.search(r"entire area|off private land", (s["limitations"] or "").lower())
                for s in segs)
            hv = harvest_for(lkey) if lkey else harvest_for(f"region-{h['area']}")
            h5 = hv[-5:]
            hunters5 = sum(x["hunters"] for x in h5) if h5 else None
            harvest5 = sum(x["harvest"] for x in h5) if h5 else None
            land = ainfo.get(h["area"].lstrip("0") or "0") if not region else None
            if not region and reg and reg["sharedAreas"]:
                parts = [ainfo.get(str(int(a))) for a in reg["sharedAreas"]]
                land = combine_land(parts) if all(parts) else None
            sqmi = land["sqmi"] if land else None
            tables = {"proj": {}, "last": {}}
            for pool, name in (("regular", "nr"), ("special", "nrs")):
                if pool in pools:
                    for mode in ("proj", "last"):
                        tables[mode][name] = table(pools[pool], mode, pools[pool]["proj"] if mode == "proj" else None)
            if res:
                ro = random_odds(res)
                for mode in ("proj", "last"):
                    if ro is not None:
                        tables[mode]["res"] = [round(ro, 3)]
            reg_pool = pools.get("regular")
            pts_nr = None if not reg_pool or reg_pool["eff"] is None else math.floor(reg_pool["eff"] + 1e-9)
            creep = slope([x for x in (reg_pool or {}).get("history", []) if x["eff"] is not None])
            name = (f"Region {h['area']} General" if region else f"Area {int(h['area'])}" + (f", {', '.join(str(int(a)) for a in reg['sharedAreas'] if a != h['area'])}" if reg and reg["sharedAreas"] else "") + f" · Type {h['type']}")
            rec = {
                "id": f"WY:{sp}:{key}", "slug": f"wy-{sp}-{key.lower()}", "state": "WY", "species": SP,
                "type": "CONTROLLED", "tagCode": f"{PREFIX[sp]}{'R-' + h['area'] if region else lkey}",
                # a region license is valid in every hunt area of its region: list those areas (when known)
                "name": name, "description": h["description"], "units": sorted(region_units, key=lambda u: int(u[1:])) if region and region_units else units,
                "weapon": weapon_of(lim), "antlerClass": antler_class(sp, lim), "takeMethod": lim[:120],
                "openDate": open_d, "closeDate": close_d, "tags": reg["quota"] if reg and isinstance(reg["quota"], int) else None,
                "privateOnly": private_only, "youthOnly": False,
                "oddsLastYear": latest, "oddsYears": len(h["years"]),
                "resOddsLast": random_odds(res) if res else None,
                "nrAppsLast": sum(sum(r[4] for r in pools[p]["pref"]["rows"]) for p in pools) or None,
                "resAppsLast": res["apps"][0] if res else None,
                "ptsNr": pts_nr, "effNr": reg_pool["eff"] if reg_pool else None,
                "projNr": reg_pool["proj"]["eff"] if reg_pool and reg_pool["proj"] else None,
                "creepNr": creep,
                "success5": (harvest5 / hunters5) if hunters5 else None, "hunters5": hunters5, "harvest5": harvest5,
                "harvestYears": len(h5), "harvestLastYear": h5[-1]["year"] if h5 else None,
                "successLast": (h5[-1]["harvest"] / h5[-1]["hunters"]) if h5 and h5[-1]["hunters"] else None,
                "daysPerHunter5": (sum(x["days"] for x in h5 if x.get("days") is not None) / hunters5) if hunters5 and all(x.get("days") is not None for x in h5) else None,
                "smallSample": bool(h5) and hunters5 / len(h5) < 20,
                "huntersSqMi": (hunters5 / len(h5) / sqmi) if hunters5 and sqmi else None,
                "acres": land["acres"] if land else None, "publicPct": land["publicPct"] if land else None,
                "privatePct": land["privatePct"] if land else None,
                "accessYesAcres": land.get("accessAcres") if land else None, "accessYesCount": land.get("accessCount") if land else None,
                "accessYesPct": land.get("accessPct") if land else None,
                "oddsByPts": tables,
                "pointOdds": {"state": "WY", "year": latest, "projYear": latest + 1, "projected": PROJECT[sp], "pools": pools,
                              "res": {"last": res, "history": res_hist} if res else None, "calibrationN": cal["n"],
                              "regs": {"year": regs["year"], "quota": reg["quota"] if reg else None, "segments": segs,
                                       "sharedAreas": reg["sharedAreas"] if reg else None} if reg else None,
                              "harvest": hv, "land": land},
            }
            out.append(rec)
        gens = general_seasons(sp, SP, lic, ainfo, hinfo, [r for r in out if r["species"] == SP and "R-" in r["tagCode"]], latest, regs["year"])
        out.extend(gens)
        # region licenses: harvest and land from the general seasons of the region's hunt areas (labeled on the page)
        for r in [x for x in out if x["species"] == SP and "R-" in x["tagCode"]]:
            members = [g for g in gens if set(g["units"]) & set(r["units"])]
            years = sorted({h["year"] for g in members for h in g["pointOdds"]["harvest"]})
            hv = [{"year": y, "hunters": sum(h["hunters"] for g in members for h in g["pointOdds"]["harvest"] if h["year"] == y),
                   "harvest": sum(h["harvest"] for g in members for h in g["pointOdds"]["harvest"] if h["year"] == y), "days": None} for y in years][-5:]
            hunters5 = sum(h["hunters"] for h in hv) if hv else None
            land = combine_land([ainfo[u[1:]] for u in r["units"] if u[1:] in ainfo]) if r["units"] else None
            r.update({"success5": sum(h["harvest"] for h in hv) / hunters5 if hunters5 else None, "hunters5": hunters5,
                      "harvest5": sum(h["harvest"] for h in hv) if hv else None, "harvestYears": len(hv),
                      "harvestLastYear": hv[-1]["year"] if hv else None, "successLast": hv[-1]["harvest"] / hv[-1]["hunters"] if hv and hv[-1]["hunters"] else None,
                      "huntersSqMi": hunters5 / len(hv) / land["sqmi"] if hunters5 and land else None,
                      "acres": land["acres"] if land else None, "publicPct": land["publicPct"] if land else None, "privatePct": land["privatePct"] if land else None,
                      "accessYesAcres": land.get("accessAcres") if land else None, "accessYesCount": land.get("accessCount") if land else None,
                      "accessYesPct": land.get("accessPct") if land else None})
            r["pointOdds"].update({"harvest": hv, "harvestBasis": "general seasons in the region's hunt areas (all general license holders)", "land": land})
    doc = {"generated": "scripts/wy_build_hunts.py", "drawYear": latest, "regsYear": regs["year"], "problems": problems, "hunts": out}
    (ROOT / "hunts.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{len(out)} hunts; problems: {problems}")


def general_seasons(sp, SP, lic, ainfo, hinfo, region_recs, latest, regs_year):
    """General seasons by hunt area (deer, elk). Residents buy a general license over the counter. Nonresidents need
    the region general license for the area's region, so their odds are that region's draw odds."""
    by_region = {r["tagCode"].split("R-")[1]: r for r in region_recs}
    out = []
    for key, reg in sorted(lic.items()):
        if not key.endswith("-gen"):
            continue
        area = key.split("-")[0]
        info = ainfo.get(area)
        if info is None:
            continue
        rr = by_region.get(region_of(info) or "")
        segs = reg["segments"]
        open_d, close_d = season_span(segs)
        lim = "; ".join(dict.fromkeys(g["limitations"] for g in segs if g["limitations"]))
        hv = sorted(hinfo.get(key, []), key=lambda x: x["year"])[-5:]
        hunters5 = sum(x["hunters"] for x in hv) if hv else None
        harvest5 = sum(x["harvest"] for x in hv) if hv else None
        tables = {"proj": {"res": [1.0]}, "last": {"res": [1.0]}}
        if rr:
            for m in ("proj", "last"):
                for pool in ("nr", "nrs"):
                    if pool in rr["oddsByPts"][m]:
                        tables[m][pool] = rr["oddsByPts"][m][pool]
        units = [f"{PREFIX[sp]}{int(a)}" for a in (reg["sharedAreas"] or [area])]
        out.append({
            "id": f"WY:{sp}:{int(area):03d}-gen", "slug": f"wy-{sp}-{int(area):03d}-gen", "state": "WY", "species": SP, "type": "GENERAL",
            "tagCode": f"{PREFIX[sp]}{area}-gen", "name": f"Area {int(area)} · General", "description": "General license",
            "units": units, "weapon": weapon_of(lim), "antlerClass": antler_class(sp, lim), "takeMethod": lim[:120] or "General license",
            "openDate": open_d, "closeDate": close_d, "tags": None, "privateOnly": False, "youthOnly": False,
            "oddsLastYear": rr["oddsLastYear"] if rr else latest, "oddsYears": rr["oddsYears"] if rr else 0,
            "resOddsLast": 1.0, "nrAppsLast": rr["nrAppsLast"] if rr else None, "resAppsLast": None,
            "ptsNr": rr["ptsNr"] if rr else None, "effNr": rr["effNr"] if rr else None, "projNr": rr["projNr"] if rr else None, "creepNr": rr["creepNr"] if rr else None,
            "success5": (harvest5 / hunters5) if hunters5 else None, "hunters5": hunters5, "harvest5": harvest5, "harvestYears": len(hv),
            "harvestLastYear": hv[-1]["year"] if hv else None, "successLast": (hv[-1]["harvest"] / hv[-1]["hunters"]) if hv and hv[-1]["hunters"] else None,
            "daysPerHunter5": (sum(x["days"] for x in hv) / hunters5) if hunters5 and all(x.get("days") is not None for x in hv) else None,
            "smallSample": bool(hv) and hunters5 / len(hv) < 20, "huntersSqMi": (hunters5 / len(hv) / info["sqmi"]) if hunters5 and info.get("sqmi") else None,
            "acres": info["acres"], "publicPct": info["publicPct"], "privatePct": info["privatePct"],
            "accessYesAcres": info.get("accessAcres"), "accessYesCount": info.get("accessCount"), "accessYesPct": info.get("accessPct"),
            "oddsByPts": tables,
            "pointOdds": {"state": "WY", "year": latest, "projYear": latest + 1, "projected": PROJECT[sp],
                          "pools": rr["pointOdds"]["pools"] if rr else {}, "res": None, "general": True,
                          "nrRegion": region_of(info), "nrRegionSlug": rr["slug"] if rr else None, "calibrationN": None,
                          "regs": {"year": regs_year, "quota": reg["quota"], "segments": segs, "sharedAreas": reg["sharedAreas"]},
                          "harvest": [dict(x) for x in hv], "land": info},
        })
    return out


def slope(hist):
    pts = hist[-5:]
    if len(pts) < 3:
        return None
    xs = [p["year"] for p in pts]
    ys = [p["eff"] for p in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return round(max(0.0, sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den), 3) if den else None


def combine_land(parts):
    acres = sum(p["acres"] for p in parts)
    w = lambda k: sum(p[k] * p["acres"] for p in parts) / acres if acres else None
    out = {"acres": acres, "sqmi": sum(p["sqmi"] for p in parts), "publicPct": w("publicPct"), "privatePct": w("privatePct")}
    if all("accessAcres" in p for p in parts):
        out["accessAcres"] = sum(p["accessAcres"] for p in parts)
        out["accessCount"] = sum(p["accessCount"] for p in parts)
        out["accessPct"] = out["accessAcres"] / acres * 100 if acres else None
    return out


if __name__ == "__main__":
    main()
