#!/usr/bin/env python3
"""Build data/mt/hunts.json: one record per Montana deer or elk hunt, in the HuntSummary shape Wyoming uses.

    python3 -I scripts/mt_build_hunts.py

Inputs, all checked by their own builders (docs/states/mt-onboarding.md):
  data/mt/regs-2026.json  2026 regulations district tables (mt_parse_regs.py)
  data/mt/draws.json      draw reports 2021-2026 (mt_parse_draws.py)
  data/mt/harvest.json    FWP harvest estimates by district (mt_build_harvest.ts)
  data/mt/units.json      2026 district boundaries and areas (mt_build_districts.ts)
  data/mt/nr-combo.json   nonresident combination licence draw (the general-licence route for nonresidents)

Hunts (deer, elk and antelope):
  general  one per district and species where the regulations print a General Deer/Elk License opportunity.
           Residents buy it over the counter. Nonresidents must first draw a combination licence, so their odds
           are that draw's, at their preference points.
  draw     one per drawn Deer/Elk Permit and Deer/Elk B licence in the 2026 draw, keyed by licence type + code
           (a code alone is not unique). Odds by bonus points from the 2026 detailed report.
  antelope one per drawn Antelope License and Antelope B License. There is no general antelope licence, and a
           nonresident applies without a combination licence (owner-confirmed 2026-11-11). Antelope districts are
           not the deer/elk districts: their unit keys carry an "A" ("A320"), and Region 7's two licence areas north
           and south of the Yellowstone are FWP's portions A701N/A701S and A703N/A703S with A700, A702, A704, A705.
           Antelope harvest counts a season only where that season's district outline matches today's
           (data/mt/district-history.json; the 2022 redraw changed many).
Over-the-counter B licences (e.g. Deer B 260-01) are not hunts here yet: they are add-ons to a general licence,
and the finder has no way to say so. Recorded as a follow-up.

Odds by bonus points (oddsByPts.last.res / .nr): index N = the bonus points a hunter holds on their FWP account
who BUYS a point with this application. From 2023 FWP's report prints points *used* in the draw (banked + the
one bought), so index N reads last year's row N+1 (§3.4). A hunter who applies without buying has their banked
points ignored and gets the no-purchase row, stored as resNoBuy / nrNoBuy. Levels nobody applied at take the
nearest level below; then a running maximum, because in a weighted draw more points can never lower a chance:
printed rates that fall with points are small-sample noise. Last draw only: no projection has been backtested.

Harvest is FWP's district estimate for ALL hunters of that species, not for the licence: every hunt carries
harvestBasis saying so. Success uses surveyed seasons only (hunter counts exist only then).
"""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data" / "mt"
YEAR = 2026
MAX_PTS = 30
SPECIES = {"DEER": "deer", "ELK": "elk", "PRONGHORN": "antelope"}
REGS_SPECIES = {"DEER": "DEER", "ELK": "ELK", "PRONGHORN": "ANTELOPE"}
LICENSES = {"Deer Permit": "DEER", "Elk Permit": "ELK", "Deer B License": "DEER", "Elk B License": "ELK",
            "Antelope License": "PRONGHORN", "Antelope B License": "PRONGHORN"}
SLUG = {"Deer Permit": "deer-permit", "Elk Permit": "elk-permit", "Deer B License": "deer-b", "Elk B License": "elk-b",
        "Antelope License": "antelope", "Antelope B License": "antelope-b",
        "General Deer License": "deer-general", "General Elk License": "elk-general"}
# Region 7 antelope licences are drawn for two areas FWP prints as "Portions of HDs ..." (regs-2026.json hd "R7:...")
R7_AREAS = {"North": ["A700", "A701N", "A703N"], "South": ["A701S", "A702", "A703S", "A704", "A705"]}
MON = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
SEASON_COLS = [("early", "ANY", "Early season"), ("archery", "ARCHERY", "Archery only"), ("general", "ANY", "General"),
               ("heritage", "MUZZLELOADER", "Heritage muzzleloader"), ("late", "ANY", "Late season")]
problems: list[str] = []
KNOWN_OTC = {"Elk B License 004-00"}


def load(name):
    return json.loads((D / name).read_text())


regs, draws, harvest, units, combo = (load(n) for n in ("regs-2026.json", "draws.json", "harvest.json", "units.json", "nr-combo.json"))
AREA = {u["name"]: u for u in units["units"] if u["species"] == "deer-elk"}
# antelope unit keys carry an "A"; FWP's whole districts 701 and 703 are replaced by their two portions each
AREA.update({f"A{u['name']}": u for u in units["units"] if u["species"] == "antelope" and u["name"] not in ("701", "703")})
REGION = {u: a.get("region") for u, a in AREA.items()}
_land = load("land.json")  # scripts/mt_build_land.py
LAND = {**_land["districts"], **{f"A{k}": v for k, v in _land["antelope"].items()}}
HISTORY = load("district-history.json")
STABLE = HISTORY["stableIou"]


def unit_keys(sp: str, hds: list[str]) -> list[str]:
    """Regulation district names -> unit keys (deer/elk "261"; antelope "A320", Region 7 areas -> portions)."""
    if sp != "PRONGHORN":
        return hds
    out = []
    for h in hds:
        if h.startswith("R7:"):
            out += R7_AREAS["North" if "North" in h else "South"]
        else:
            out.append(f"A{h}")
    return sorted(set(out), key=lambda k: (len(k), k))


def harvest_district(key: str) -> str:
    """Unit key -> FWP harvest district: "A701N" -> "701" (FWP estimates whole districts, not portions)."""
    return re.sub(r"^A|[NS]$", "", key) if key.startswith("A") else key


WHOLE = {u["name"]: u for u in units["units"] if u["species"] == "antelope" and not u.get("portionOf")}


def stable_season(key: str, year: int) -> bool:
    """Antelope: was this season's district the same ground as today's? Season Y uses the latest regulation year
    <= Y (FWP sets districts for two seasons). Deer/elk: no crosswalk yet, so every season counts (see doc §4)."""
    if not key.startswith("A"):
        return True
    rec = HISTORY["antelope"].get(harvest_district(key), {})
    rys = [int(r) for r in rec if int(r) <= year]
    if not rys:
        return False
    iou = rec[str(max(rys))]
    return iou is not None and iou >= STABLE


def land(hds: list[str]) -> dict:
    """Public and private share of the hunt's districts, weighted by district acres (Wyoming's rule)."""
    recs = [LAND.get(h) for h in hds]
    if not recs or any(r is None for r in recs):
        problems.append(f"no land record for districts {hds}")
        return {"publicPct": None, "privatePct": None}
    acres = sum(r["acres"] for r in recs)
    return {k: round(sum(r[k] * r["acres"] for r in recs) / acres, 1) for k in ("publicPct", "privatePct")}


def iso(md: str, after: date | None = None) -> str:
    m = re.fullmatch(r"([A-Z][a-z]{2})[a-z]*\.? ?(\d{1,2})", md.strip())
    if not m:
        raise ValueError(md)
    d = date(YEAR, MON[m.group(1)], int(m.group(2)))
    if after and d < after:
        d = date(YEAR + 1, d.month, d.day)
    return d.isoformat()


def span(text: str):
    a, b = text.split("-")
    o = iso(a)
    return {"open": o, "close": iso(b, date.fromisoformat(o))}


def antler_of(opp: str) -> str:
    t = (opp or "").lower()
    if "antlerless" in t or "doe" in t:
        return "ANTLERLESS"
    if "either-sex" in t or "either sex" in t or " or antlerless" in t:
        return "EITHER"
    if "antlered" in t or "bull" in t or "buck" in t:
        return "ANTLERED"
    return "EITHER"


def seasons_of(rows):
    """regulation rows -> tagSeasons entries (one per row and season column)."""
    out = []
    for r in rows:
        arch_only = bool(re.search(r"ArchEquip only", r["details"] or "", re.I))
        for col, weapon, label in SEASON_COLS:
            v = r["seasons"].get(col)
            if not v:
                continue
            out.append({"weapon": "ARCHERY" if arch_only else weapon, "sex": r["opportunity"] or "", "dates": [span(v)],
                         "notes": "; ".join(x for x in [label if col in ("early", "late", "heritage") else "", r["details"] or ""] if x)})
    return out


def youth_only(r) -> bool:
    return bool(re.search(r"\bonly youth\b|\byouth only\b|^only youth", r["details"] or "", re.I))


def weapon_of(seasons) -> str:
    ws = {s["weapon"] for s in seasons}
    return next(iter(ws)) if len(ws) == 1 else "ANY"


def antler_class(rows) -> str:
    cls = {antler_of(r["opportunity"]) for r in rows}
    return cls.pop() if len(cls) == 1 else "EITHER"


def date_range(seasons):
    if not seasons:
        return None, None
    return min(s["dates"][0]["open"] for s in seasons), max(s["dates"][-1]["close"] for s in seasons)


# ---------------------------------------------------------------- harvest

def district_harvest(sp: str, hd: str):
    """Yearly rows for a district; elk portions (391N/391S ...) are combined when the parent has no row."""
    ds = harvest["species"][sp]["districts"]
    own = {r["year"]: r for r in ds.get(hd, [])}
    parts = [k for k in ds if re.fullmatch(rf"{hd}[NSEW]{{1,2}}", k)]
    years = {}
    for y in sorted(set(own) | {r["year"] for k in parts for r in ds[k]}):
        r = own.get(y)
        if r and r.get("hunters"):
            years[y] = dict(r, combined=None)
            continue
        rows = [x for k in parts for x in ds[k] if x["year"] == y and x.get("hunters")]
        if rows:
            years[y] = {"year": y, "hunters": sum(x["hunters"] for x in rows), "harvest": sum(x["harvest"] for x in rows),
                        "days": sum(x["days"] for x in rows) if all(x.get("days") is not None for x in rows) else None,
                        "antlered": sum(x["antlered"] for x in rows), "big": sum(x.get("big") or 0 for x in rows),
                        "combined": sorted(k for k in parts if any(x["year"] == y for x in ds[k]))}
    return years


def harvest_fields(sp: str, keys: list[str]):
    surveyed = harvest["species"][sp]["surveyedYears"]
    hds = sorted({harvest_district(k) for k in keys}, key=lambda h: (len(h), h))
    akey = {harvest_district(k): k for k in keys}
    per = {hd: {y: r for y, r in district_harvest(sp, hd).items() if stable_season(akey[hd], y)} for hd in hds}
    # a multi-district hunt counts a season only when every district was estimated (and, for antelope, unchanged)
    yrs = [y for y in surveyed if all(y in per[hd] for hd in hds)][-5:]
    hv = []
    for y in yrs:
        rows = [per[hd][y] for hd in hds]
        hv.append({"year": y, "hunters": sum(r["hunters"] for r in rows), "harvest": sum(r["harvest"] for r in rows),
                   "days": sum(r["days"] for r in rows) if all(r.get("days") is not None for r in rows) else None,
                   "antlered": sum(r["antlered"] for r in rows), "big": sum(r.get("big") or 0 for r in rows)})
    combined = sorted({c for hd in hds for r in per[hd].values() for c in (r.get("combined") or [])})
    # density uses the area FWP estimated: whole districts, also where the licence covers a portion
    sqmi = sum(((WHOLE.get(hd) if sp == "PRONGHORN" else AREA.get(hd)) or {}).get("acres") or 0 for hd in hds) / 640 or None
    basis = (f"FWP district estimate for all {SPECIES[sp]} hunters in {'HD ' + hds[0] if len(hds) == 1 else str(len(hds)) + ' districts'}, "
             "every licence type, surveyed seasons only")
    if sp == "PRONGHORN":
        basis += "; only seasons whose district outline matches today's"
        if any(k.endswith(("N", "S")) for k in keys):
            basis += "; FWP estimates HDs 701 and 703 whole, not north or south of the Yellowstone"
    if len(hds) > 1:
        basis += "; summed across districts (a hunter who hunted several is counted in each)"
    if combined:
        basis += f"; combined from FWP's portions {', '.join(combined)}"
    if not hv:
        return {"success5": None, "hunters5": None, "harvest5": None, "harvestYears": 0, "harvestLastYear": None,
                "successLast": None, "daysPerHunter5": None, "smallSample": False, "huntersSqMi": None, "bigPct5": None}, [], basis
    hunters5, harvest5 = sum(x["hunters"] for x in hv), sum(x["harvest"] for x in hv)
    ant = sum(x["antlered"] for x in hv)
    return {
        "success5": harvest5 / hunters5 if hunters5 else None, "hunters5": hunters5, "harvest5": harvest5,
        "harvestYears": len(hv), "harvestLastYear": hv[-1]["year"],
        "successLast": hv[-1]["harvest"] / hv[-1]["hunters"] if hv[-1]["hunters"] else None,
        "daysPerHunter5": (sum(x["days"] for x in hv) / hunters5) if hunters5 and all(x["days"] is not None for x in hv) else None,
        "smallSample": hunters5 / len(hv) < 20,
        "huntersSqMi": hunters5 / len(hv) / sqmi if sqmi else None,
        # FWP's antelope estimates count bucks and does, not horn size: no trophy share, rather than a false 0%
        "bigPct5": None if sp == "PRONGHORN" else sum(x["big"] for x in hv) / ant if ant else None,
        **deer_mix(sp, hds, [x["year"] for x in hv]),
    }, hv, basis


def deer_mix(sp, hds, years):
    """Whitetail share of the deer harvest in the same seasons, and Idaho's deerType rule (src/sync/core/math.ts)."""
    if sp != "DEER" or not years:
        return {}
    wt = mu = 0
    for hd in hds:
        for y in years:
            w = district_harvest("DEER_WHITETAIL", hd).get(y)
            m = district_harvest("DEER_MULE", hd).get(y)
            wt += w["harvest"] if w else 0
            mu += m["harvest"] if m else 0
    if not wt + mu:
        return {"whitetailPct5": None, "deerType": None}
    pct = 100 * wt / (wt + mu)
    return {"whitetailPct5": pct, "deerType": "WHITETAIL" if pct >= 60 else "MULE" if pct <= 40 else "MIXED"}


# ---------------------------------------------------------------- odds

def odds_by_points(levels):
    """[[points-as-printed, apps, succ]...] -> (array indexed by banked points N, no-purchase odds or None)."""
    buy = {int(float(p)): (a, s) for p, a, s in levels if p not in ("", "0")}
    nb = [(a, s) for p, a, s in levels if p in ("", "0")]
    no_buy = (sum(s for a, s in nb) / sum(a for a, s in nb)) if nb and sum(a for a, s in nb) else None
    if not buy:
        return [], no_buy
    top = min(max(buy), MAX_PTS + 1)
    arr, cur, best = [], None, 0.0
    for lvl in range(1, top + 1):  # level L = N + 1 for a hunter holding N who buys
        if lvl in buy and buy[lvl][0]:
            cur = buy[lvl][1] / buy[lvl][0]
        v = cur if cur is not None else 0.0
        best = max(best, v)
        arr.append(round(best, 4))
    return arr, (round(no_buy, 4) if no_buy is not None else None)


def pool_rate(pool):
    a, s = pool["apps"][0], pool["succ"][0]
    return (s / a) if a else None


def combo_odds(key: str):
    """Nonresident combination licence odds at 0..3 whole preference points, last draw."""
    lic = next(l for l in combo["licenses"] if l["key"] == key)
    year = max(lic["years"], key=int)
    lv = lic["years"][year]["levels"]
    out = []
    for p in range(0, 4):
        hit = [l for l in lv if l["min"] <= p <= l["max"]]
        out.append(round(hit[0]["pct"] / 100, 4) if hit and hit[0]["pct"] is not None else None)
    return int(year), out, lic["name"]


# ---------------------------------------------------------------- build

def district_name(hd, species=None):
    t = next((t for t in regs["districts"] if t["hd"] == hd and (species is None or t["species"] == species)), None)
    return t["name"] if t else None


hunts = []
codes = regs["codes"]
rep = draws["years"][str(YEAR)]

# draw hunts
for key, c in sorted(codes.items()):
    if c["license"] not in LICENSES:
        continue
    sp = LICENSES[c["license"]]
    e = rep.get(key)
    if c["otc"] is True or e is None:
        # Elk B 004-00: the regulations disagree with themselves (HD 417 prints "Jun 1"); it has no draw report,
        # so it was sold over the counter (docs/states/mt-onboarding.md §3.5). Anything else is a problem.
        if e is None and c["otc"] is not True and key not in KNOWN_OTC:
            problems.append(f"{key}: not over the counter but no {YEAR} draw report")
        continue
    hds = unit_keys(sp, sorted(c["districts"], key=lambda h: (len(h), h)))
    rows = [dict(o, hd=t["hd"]) for t in regs["districts"] if t["species"] == REGS_SPECIES[sp]
            for o in t["opportunities"] if o["license"] == c["license"] and o["code"] == c["code"]]
    seasons = seasons_of(rows)
    open_, close = date_range(seasons)
    res_arr, res_nb = odds_by_points(e["levels"].get("res", []))
    nr_arr, nr_nb = odds_by_points(e["levels"].get("nr", []))
    hist = []
    for y in sorted(draws["years"], key=int):
        x = draws["years"][y].get(key)
        if x:
            hist.append({"year": int(y), "quota": x["quota"], "res": [x["pools"]["res"]["apps"][0], x["pools"]["res"]["succ"][0]],
                         "nr": [x["pools"]["nr"]["apps"][0], x["pools"]["nr"]["succ"][0]],
                         "pointsKnown": draws["pointsColumn"][y] == "used"})
    five = [h for h in hist if h["year"] > YEAR - 5]
    pooled = lambda k: (sum(h[k][1] for h in five) / sum(h[k][0] for h in five)) if sum(h[k][0] for h in five) else None
    prev = next((h for h in hist if h["year"] == YEAR - 1), None)
    hf, hv, hbasis = harvest_fields(sp, hds)
    land_private = bool(rows) and all(r.get("landLimit") == "private" for r in rows)
    quota = e["quota"] if isinstance(e["quota"], int) else None
    regs_hds = sorted(c["districts"], key=lambda h: (len(h), h))
    names = [district_name(h, REGS_SPECIES[sp]) for h in regs_hds]
    area = (f"HD {regs_hds[0]} · {names[0]}" if len(regs_hds) == 1 and not regs_hds[0].startswith("R7:")
            else names[0] if len(regs_hds) == 1 else (c.get("validIn", {}).get("text") or f"{len(regs_hds)} districts"))
    rec = {
        "id": f"MT:{SLUG[c['license']]}:{c['code']}", "slug": f"mt-{SLUG[c['license']]}-{c['code']}", "state": "MT",
        "species": sp, "type": "CONTROLLED", "tagCode": c["code"],
        "name": f"{c['license'].replace(' License', '')} {c['code']}", "areaName": area,
        "description": "; ".join(sorted({r["opportunity"] for r in rows if r["opportunity"]})),
        "units": hds, "weapon": weapon_of(seasons), "antlerClass": antler_class(rows),
        "takeMethod": "; ".join(sorted({r["opportunity"] for r in rows if r["opportunity"]})),
        "openDate": open_, "closeDate": close, "tags": quota, "privateOnly": land_private,
        "youthOnly": bool(rows) and all(youth_only(r) for r in rows),
        "oddsLastYear": YEAR, "oddsYears": len(hist),
        "resOddsLast": pool_rate(e["pools"]["res"]), "nrOddsLast": pool_rate(e["pools"]["nr"]),
        "resOdds5": pooled("res"), "nrOdds5": pooled("nr"),
        "resOddsPrev": (prev["res"][1] / prev["res"][0]) if prev and prev["res"][0] else None,
        "nrOddsPrev": (prev["nr"][1] / prev["nr"][0]) if prev and prev["nr"][0] else None,
        "resAppsLast": e["pools"]["res"]["apps"][0], "nrAppsLast": e["pools"]["nr"]["apps"][0],
        "appsLast": e["pools"]["res"]["apps"][0] + e["pools"]["nr"]["apps"][0],
        "nrPermitsLast": e["pools"]["nr"]["succ"][0], "permitsLast": e["totalSucc"] if isinstance(e["totalSucc"], int) else None,
        "secondDrewLast": sum(e["pools"][p]["succ"][1] for p in ("res", "nr")),
        "secondAppsLast": sum(e["pools"][p]["apps"][1] for p in ("res", "nr")),
        **hf, "acres": sum(AREA[h].get("acres") or 0 for h in hds) or None, **land(hds),
        "oddsByPts": {"proj": {"res": res_arr, "nr": nr_arr}, "last": {"res": res_arr, "nr": nr_arr},
                      **({"noBuy": {"res": res_nb, "nr": nr_nb}})},
        "tagSeasons": {"year": YEAR, "seasons": seasons},
        "pointOdds": {
            "state": "MT", "kind": "bonus", "year": YEAR, "projected": False, "license": c["license"],
            "pointsMeaning": draws["pointsColumn"]["used"],
            "pools": {p: {"levels": e["levels"].get(p, []), "quota": e["pools"][p]["quota"],
                          "apps": e["pools"][p]["apps"], "succ": e["pools"][p]["succ"]} for p in ("res", "nr")},
            "landowner": {p: {"quota": e["pools"][p]["quota"], "apps": e["pools"][p]["apps"][0], "succ": e["pools"][p]["succ"][0]}
                          for p in ("loRes", "loNr")},
            "history": hist, "quota": e["quota"], "regsQuota": c.get("quota"), "regsQuotaRange": c.get("quotaRange"),
            "note": e.get("note"), "deerSpecies": e.get("species"),
            "regs": {"year": YEAR, "rows": [{k: r.get(k) for k in ("hd", "opportunity", "applyBy", "seasons", "details", "section", "landLimit")} for r in rows],
                     "validIn": c.get("validIn", {}).get("text"), "conflicts": c.get("conflicts"), "referenceConflict": c.get("referenceConflict")},
            "harvest": hv, "harvestBasis": hbasis,
            # deer/elk permits are added to a general licence, so a nonresident must hold a combination licence;
            # antelope licences stand alone (a nonresident needs no combination licence)
            "needsGeneral": c["license"] in ("Deer Permit", "Elk Permit"),
            **({"regsDistricts": regs_hds} if sp == "PRONGHORN" else {}),
        },
    }
    if not rows:
        problems.append(f"{key}: no regulation rows")
    hunts.append(rec)

# general hunts
DEER_COMBO, ELK_COMBO = combo_odds("deer"), combo_odds("biggame-elk")
for t in regs["districts"]:
    if t["species"] not in ("DEER", "ELK"):
        continue
    lic = f"General {t['species'].title()} License"
    rows = [dict(o, hd=t["hd"]) for o in t["opportunities"] if o["license"] == lic]
    if not rows:
        continue
    sp, hd = t["species"], t["hd"]
    if hd not in AREA:
        problems.append(f"{sp} HD {hd}: no district boundary")
    seasons = seasons_of(rows)
    open_, close = date_range(seasons)
    cyear, codds, cname = DEER_COMBO if sp == "DEER" else ELK_COMBO
    hf, hv, hbasis = harvest_fields(sp, [hd])
    nr_arr = []
    for v in codds:  # a running maximum would hide Montana's dead zone; keep it exactly as drawn
        nr_arr.append(v if v is not None else (nr_arr[-1] if nr_arr else 0.0))
    rec = {
        "id": f"MT:{SLUG[lic]}:{hd}", "slug": f"mt-{SPECIES[sp]}-{hd}-general", "state": "MT", "species": sp, "type": "GENERAL",
        "tagCode": f"HD {hd}", "name": f"HD {hd} · General {SPECIES[sp]}", "areaName": t["name"],
        "description": "; ".join(sorted({r["opportunity"] for r in rows if r["opportunity"]})),
        "units": [hd], "weapon": "ANY", "antlerClass": antler_class(rows),
        "takeMethod": "; ".join(sorted({r["opportunity"] for r in rows if r["opportunity"]})),
        "openDate": open_, "closeDate": close, "tags": None,
        "privateOnly": all(r.get("landLimit") == "private" for r in rows),
        "youthOnly": all(youth_only(r) for r in rows),
        "oddsLastYear": cyear, "oddsYears": 1, "resOddsLast": 1.0, "nrOddsLast": None,
        **hf, "acres": AREA.get(hd, {}).get("acres"), **land([hd]),
        "nrTag": False, "capped": False,
        # residents: over the counter. Nonresidents: the combination draw at 0..3 preference points (NOT smoothed:
        # 1-2 points below the cutoff drew 0% while 0 points drew from the random quarter)
        "oddsByPts": {"proj": {"res": [1.0], "nr": nr_arr}, "last": {"res": [1.0], "nr": nr_arr}},
        "tagSeasons": {"year": YEAR, "seasons": seasons},
        "pointOdds": {
            "state": "MT", "kind": "general", "year": YEAR, "projected": False, "license": lic,
            "combo": {"key": "deer" if sp == "DEER" else "biggame-elk", "name": cname, "year": cyear},
            "regs": {"year": YEAR, "rows": [{k: r.get(k) for k in ("hd", "opportunity", "seasons", "details", "section", "landLimit")} for r in rows],
                     "notes": t["notes"]},
            "harvest": hv, "harvestBasis": hbasis,
        },
    }
    hunts.append(rec)

ids = [h["id"] for h in hunts]
if len(ids) != len(set(ids)):
    problems.append("duplicate hunt ids")
for h in hunts:
    for u in h["units"]:
        if u not in AREA:
            problems.append(f"{h['id']}: unit {u} has no boundary")
    for m in ("proj", "last"):
        for pool, arr in h["oddsByPts"][m].items():
            if any(not (0 <= v <= 1) for v in arr):
                problems.append(f"{h['id']}: {m} {pool} odds out of range")

out = {"generated": date.today().isoformat(), "drawYear": YEAR, "regsYear": YEAR, "problems": problems, "hunts": hunts}
(D / "hunts.json").write_text(json.dumps(out, indent=None, separators=(",", ":"), ensure_ascii=False))
n = {k: sum(1 for h in hunts if (h["species"], h["type"]) == k) for k in [("DEER", "GENERAL"), ("ELK", "GENERAL"), ("DEER", "CONTROLLED"), ("ELK", "CONTROLLED"), ("PRONGHORN", "CONTROLLED")]}
print(f"{len(hunts)} hunts {n}; {len(problems)} problems")
for p in problems[:40]:
    print("PROBLEM", p)
