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
            if region:
                code, lkey, units = f"{h['area']}", None, [f"{PREFIX[sp]}R-{h['area']}"]
                region_units = [unit(a) for a, info in ainfo.items() if info.get("region") == h["area"]]
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
            private_only = bool(re.search(r"valid (only )?on private land|private land only", (segs[0]["limitations"] if segs else "").lower()))
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
                "name": name, "description": h["description"], "units": units, "regionUnits": region_units,
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
    doc = {"generated": "scripts/wy_build_hunts.py", "drawYear": latest, "regsYear": regs["year"], "problems": problems, "hunts": out}
    (ROOT / "hunts.json").write_text(json.dumps(doc, separators=(",", ":")) + "\n")
    print(f"{len(out)} hunts; problems: {problems}")


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
