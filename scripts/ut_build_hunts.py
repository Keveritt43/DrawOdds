#!/usr/bin/env python3
"""Build data/ut/hunts.json: one record per Utah deer or elk hunt (UT-1), in the HuntSummary shape the other states use.

    python3 -I scripts/ut_build_hunts.py

Inputs (docs/states/ut-onboarding.md §3, §5a):
  data/ut/source/odds-2026.json          2026 draw results, utahdraws.com DrawOddsData (by species ID)
  data/ut/source/odds-2021-2025.json     2021-2025 DWR bonus-point and general-deer odds reports (parsed PDFs)
  data/ut/source/harvest-2020-2025.json  DWR harvest reports (2025 preliminary)
  data/ut/units.json, data/ut/land.json  hunt boundaries, hunt -> boundaries, land ownership (ut_build_land.py)

Hunts:
  LE deer / premium LE deer / LE elk   drawn with bonus points (species IDs 8, 9). Odds by points from the model
      that reproduces DWR's results (§5a): per residency pool, the max-point permits go to the top point levels in
      order, then the rest go to a draw where an applicant holding N points has N + 1 entries. The 2026 table
      is that model run on 2026's own applicants and quotas ("last draw"); it is monotone by construction.
  general buck deer                    drawn with preference points (species ID 5): a strict queue per unit
      and pool, so odds at N points are DWR's printed first-choice rate at N, filled upward (a level nobody
      applied at takes the next level below it, then a running maximum).
  general bull elk                     sold over the counter (no draw, statewide caps); one record per DWR hunt
      number (any bull, spike, archery, muzzleloader, multiseason), valid on that hunt's boundaries.
  draw-only youth any bull elk (EB1007) is a youth-only draw (species ID 6); kept with youthOnly.
CWMU hunts (Cooperative Wildlife Management Units: private land, residents only in the public draw) are kept with
privateOnly, so the shared filter hides them by default.
Left out (labelled in the doc): dedicated hunter, landowner, antlerless, conservation/expo/sportsman permits,
and EB1012 (Uinta Basin private-lands-only any bull: DWR's hunt planner gives it no boundary).

Points: DWR's tables are by the points an applicant held when applying ("Point" in the 2026 data). Index N of
oddsByPts is a hunter applying with N points. Last draw only: no projection has been backtested (§5.2), so
proj = last and pointOdds.projected = false.

Harvest: DWR's per-hunt estimates (hunters afield, harvest), 2021-2025 with 2025 preliminary. Success = harvest /
hunters over those seasons. DWR's own printed success is computed from raw survey answers, so it can differ.
"""
from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data" / "ut"
YEAR = 2026
MAX_PTS = 32
HARVEST_YEARS = [2021, 2022, 2023, 2024, 2025]

WEAPON = {"Archery": "ARCHERY", "Any Legal Weapon": "ANY", "Muzzleloader": "MUZZLELOADER", "Restricted Muzzleloader": "MUZZLELOADER",
          "Early Any Legal Weapon": "ANY", "Late Any Legal Weapon": "ANY", "Restricted Rifle": "ANY", "Extended Archery": "ARCHERY",
          "Multiseason": "ANY", "HAMSS": "ANY", "Restricted Any Legal Weapon": "ANY"}

# 2026 general-season elk (field regulations guidebook p. 8; hunt numbers from DWR's 2025 preliminary harvest report)
GENERAL_ELK = {
    "EB1001": ("Any bull elk, any legal weapon (early)", "ANY", "2026-10-03", "2026-10-09", "Any bull"),
    "EB1010": ("Any bull elk, any legal weapon (late)", "ANY", "2026-10-10", "2026-10-16", "Any bull"),
    "EB1002": ("Any bull elk, muzzleloader", "MUZZLELOADER", "2026-10-28", "2026-11-05", "Any bull"),
    "EB1005": ("Bull elk, archery (any bull and spike units)", "ARCHERY", "2026-08-15", "2026-09-16", "Bull"),
    "EB1003": ("Spike bull elk, any legal weapon", "ANY", "2026-10-03", "2026-10-15", "Spike bull"),
    "EB1004": ("Spike bull elk, muzzleloader", "MUZZLELOADER", "2026-10-28", "2026-11-05", "Spike bull"),
    "EB1009": ("Spike bull elk, multiseason", "ANY", "2026-08-15", "2026-11-05", "Spike bull"),
}
# the annual report's statewide row for each general elk hunt, for 2021-2024 harvest (2025 is in the preliminary file)
GENERAL_ELK_TABLE = {
    "EB1001": r"early any (legal )?weapon any.bull", "EB1010": r"late any (legal )?weapon any.bull",
    "EB1002": r"muzzleloader any.bull", "EB1005": r"general-season archery elk", "EB1003": r"any (legal )?weapon spike.bull",
    "EB1004": r"muzzleloader spike.bull", "EB1009": r"multiseason spike.bull", "EB1007": r"draw-only youth",
}


def iso(s):
    return s[:10] if s else None


def weapon_of(name):
    return WEAPON.get(name.strip(), "ANY")


def incl(groups, R, wf):
    """Expected inclusion probability of each group in a weighted draw without replacement of R winners
    (Efraimidis-Spirakis keys; exact expected value via the exponential race, solved for the stopping time)."""
    N = sum(n for _, n in groups)
    if R <= 0:
        return [0.0] * len(groups)
    if R >= N:
        return [1.0] * len(groups)
    f = lambda t: sum(n * (1 - math.exp(-wf(p) * t)) for p, n in groups)
    lo, hi = 0.0, 1.0
    while f(hi) < R:
        hi *= 2
    for _ in range(80):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if f(m) < R else (lo, m)
    return [1 - math.exp(-wf(p) * hi) for p, _ in groups]


def bonus_odds(levels, M, R):
    """levels: {points: applicants} at first choice. Returns odds[0..MAX_PTS] for a hunter applying with N points."""
    # max-point round: top levels in order
    left = M
    bonus_p = {}
    for p in sorted(levels, reverse=True):
        n = levels[p]
        take = min(left, n)
        bonus_p[p] = take / n if n else 0.0
        left -= take
    R = R + left  # max-point permits nobody could use go to the random round
    groups = [(p, levels[p] * (1 - bonus_p.get(p, 0.0))) for p in levels]
    groups = [(p, n) for p, n in groups if n > 0]
    out = []
    # a hypothetical applicant at level N: max-point round first, then the draw
    top = max(levels) if levels else 0
    cut_full = {p for p, v in bonus_p.items() if v >= 1.0}
    for N in range(MAX_PTS + 1):
        if N in bonus_p:
            b = bonus_p[N]
        elif N > top:
            b = 1.0 if M > 0 else 0.0
        else:  # no applicants at N: drawn in the max-point round only if every level above-or-at it was
            above = [p for p in levels if p >= N]
            b = 1.0 if M > 0 and above and all(p in cut_full for p in above) else 0.0
        w = N + 1
        pr = incl(groups + [(N, 1e-9)], R, lambda p: p + 1)[-1] if groups else (1.0 if R > 0 else 0.0)
        out.append(round(b + (1 - b) * pr, 4))
    for i in range(1, len(out)):  # numerical guard
        out[i] = max(out[i], out[i - 1])
    return out


def pref_odds(obs):
    """obs: {points: (applicants, drew)}. Preference queue: printed rate at N, filled upward."""
    out, last = [], 0.0
    top = max(obs) if obs else 0
    for N in range(MAX_PTS + 1):
        if N in obs and obs[N][0]:
            v = obs[N][1] / obs[N][0]
        elif N > top:
            v = 1.0 if any(d for _, d in obs.values()) else last
        else:
            v = last
        last = max(last, v)
        out.append(round(last, 4))
    return out


def trim(arr):
    while len(arr) > 2 and arr[-1] == arr[-2] == 1.0:
        arr = arr[:-1]
    return arr


def main() -> None:
    o26 = json.load(open(D / "source" / "odds-2026.json"))
    F = o26["oddsFields"]
    hist = json.load(open(D / "source" / "odds-2021-2025.json"))
    harv = json.load(open(D / "source" / "harvest-2020-2025.json"))
    units = json.load(open(D / "units.json"))
    land = json.load(open(D / "land.json"))["boundaries"]
    h2b = units["huntToBoundaries"]
    problems: list[str] = []

    # harvest by hunt code and year
    H: dict[str, dict[int, dict]] = {}
    for y in HARVEST_YEARS[:-1]:
        for r in harv["limitedEntry"].get(str(y), []) + harv["generalBuckDeer"].get(str(y), []):
            H.setdefault(r["code"], {}).setdefault(y, r)
    for r in harv["prelim2025AllHunts"]:
        H.setdefault(r["code"], {}).setdefault(2025, r)
    # general elk 2021-2024 from the annual report's statewide rows
    for y in HARVEST_YEARS[:-1]:
        for code, rx in GENERAL_ELK_TABLE.items():
            rows = [r for r in harv["generalElkByUnit"].get(str(y), []) if re.search(rx, r["table"], re.I)
                    and not (code == "EB1005" and "extended" in r["table"].lower())
                    and not (code in ("EB1003", "EB1004") and "multiseason" in r["table"].lower())]
            tot = [r for r in rows if (r.get("name") or "").startswith("Statewide") or (r.get("unit") or "").startswith("Statewide")]
            if tot and tot[0].get("hunters"):
                H.setdefault(code, {}).setdefault(y, {"hunters": tot[0]["hunters"], "harvest": tot[0].get("harvest"),
                                                      "days": tot[0].get("days"), "success": tot[0].get("success")})

    # 2021-2025 first-choice draw ratios by code and pool
    past: dict[str, dict[int, dict]] = {}
    for y, hs in hist["bonusPoint"].items():
        for h in hs:
            for k in ("res", "nr"):
                L = h[k]["levels"] if h.get(k) else []
                e = sum(l[1] for l in L); t = sum(l[4] for l in L)
                if e:
                    past.setdefault(h["code"], {}).setdefault(int(y), {})[k] = (e, t)
    for y, hs in hist["generalBuckDeer"].items():
        for h in hs:
            for k in ("res", "nr"):
                L = h[k]["levels"] if h.get(k) else []
                e = sum(l[1] for l in L); t = sum(l[4] for l in L)
                if e:
                    past.setdefault(h["code"], {}).setdefault(int(y), {})[k] = (e, t)

    def land_for(codes):
        bids = [str(b) for b in codes]
        recs = [land.get(b) for b in bids]
        if not bids or any(r is None for r in recs):
            return None
        acres = sum(r["acres"] for r in recs)
        wavg = lambda k: round(sum(r[k] * r["acres"] for r in recs) / acres, 1)
        return {"acres": acres, "publicPct": wavg("publicPct"), "privatePct": wavg("privatePct")}

    def harvest_fields(code):
        yrs = H.get(code, {})
        use = [y for y in HARVEST_YEARS if y in yrs and yrs[y].get("hunters") and yrs[y].get("harvest") is not None]
        if not use:
            return {"success5": None, "hunters5": None, "harvest5": None, "harvestYears": 0, "harvestLastYear": None,
                    "successLast": None, "daysPerHunter5": None, "smallSample": True}
        hu = sum(yrs[y]["hunters"] for y in use); hv = sum(yrs[y]["harvest"] for y in use)
        last = use[-1]
        days = [(yrs[y].get("days"), yrs[y]["hunters"]) for y in use if yrs[y].get("days") is not None]
        return {"success5": hv / hu, "hunters5": hu, "harvest5": hv, "harvestYears": len(use), "harvestLastYear": last,
                "harvestPrelimYear": 2025 if 2025 in use else None,
                "successLast": yrs[last]["harvest"] / yrs[last]["hunters"],
                "daysPerHunter5": (sum(d * n for d, n in days) / sum(n for _, n in days)) if days else None,
                "smallSample": hu < 30}

    out = []
    for sid, species, kind in (("8", "DEER", "bonus"), ("9", "ELK", "bonus"), ("5", "DEER", "pref"), ("6", "ELK", "bonus")):
        for h in o26["data"][sid]:
            code = h["HuntCode"]
            if not re.fullmatch(r"[A-Z]{2}\d{4}", code):
                continue  # point-only "hunts" (ELK, DEE, ...)
            bids = h2b.get(code)
            if not bids:
                problems.append(f"{code}: no hunt boundary")
                continue
            rows = [dict(zip(F, r)) for r in h["odds"]]
            pools, odds = {}, {}
            for k, rt in (("res", 1), ("nr", 2)):
                lv = {}
                for r in rows:
                    if r["ResidencyTypeID"] == rt and not r["IsYouth"]:
                        a, d = lv.get(r["Point"], (0, 0))
                        lv[r["Point"]] = (a + r["ParticipantCount"], d + r["SuccessfulCount"])
                Q = h["ResidentQuotaQuantity"] if rt == 1 else h["NonResidentQuotaQuantity"]
                M = h["ResidentMaxPointRoundQuota"] if rt == 1 else h["NonResidentMaxPointRoundQuota"]
                Rq = h["ResidentRegularRoundQuota"] if rt == 1 else h["NonResidentRegularRoundQuota"]
                if not Q:
                    continue
                if kind == "bonus":
                    odds[k] = trim(bonus_odds({p: a for p, (a, _) in lv.items() if a}, M or 0, Rq or 0))
                else:
                    odds[k] = trim(pref_odds(lv))
                pools[k] = {"quota": Q, "maxPointQuota": M, "randomQuota": Rq,
                            "levels": [[p, a, d] for p, (a, d) in sorted(lv.items())]}
            if not odds:
                problems.append(f"{code}: no residency quota")
                continue
            sw = h["SeasonWeapons"] or []
            seasons = [{"weapon": weapon_of(s["WeaponName"]), "dates": [{"open": iso(s["SeasonStartDate"]), "close": iso(s["SeasonEndDate"])}],
                        "notes": (s.get("SpecialInstruction") or "").strip()} for s in sw]
            opens = [s["dates"][0]["open"] for s in seasons if s["dates"][0]["open"]]
            closes = [s["dates"][0]["close"] for s in seasons if s["dates"][0]["close"]]
            weapons = {s["weapon"] for s in seasons}
            weapon = weapons.pop() if len(weapons) == 1 else "ANY"
            cat = h["HuntCategoryName"]
            ln = land_for(bids)
            if ln is None:
                problems.append(f"{code}: boundary without land")
                continue
            apps = {k: sum(l[1] for l in pools[k]["levels"]) for k in pools}
            drew = {k: sum(l[2] for l in pools[k]["levels"]) for k in pools}
            p_hist = past.get(code, {})
            prev = p_hist.get(2025, {})
            rec = {
                "id": f"UT:{code}", "slug": f"ut-{code.lower()}", "state": "UT", "species": species,
                "type": "GENERAL" if kind == "pref" else "CONTROLLED", "tagCode": code,
                "name": f"{h['HuntName']} {h['SpeciesSubtypeName']}".strip(), "areaName": h["HuntName"],
                "description": cat, "huntCategory": cat, "units": [str(b) for b in bids],
                "weapon": weapon, "antlerClass": "ANTLERED", "takeMethod": h["SpeciesSubtypeName"],
                "openDate": min(opens) if opens else None, "closeDate": max(closes) if closes else None,
                "tags": h["QuotaQuantity"], "privateOnly": cat == "CWMU", "youthOnly": sid == "6",
                "oddsLastYear": YEAR, "oddsYears": 1 + len([y for y in p_hist if y >= 2021]),
                "resOddsLast": drew["res"] / apps["res"] if apps.get("res") else None,
                "nrOddsLast": drew["nr"] / apps["nr"] if apps.get("nr") else None,
                "resOddsPrev": prev["res"][1] / prev["res"][0] if "res" in prev else None,
                "nrOddsPrev": prev["nr"][1] / prev["nr"][0] if "nr" in prev else None,
                "resAppsLast": apps.get("res"), "nrAppsLast": apps.get("nr"), "appsLast": sum(apps.values()),
                "nrPermitsLast": h["NonResidentQuotaQuantity"], "permitsLast": h["QuotaQuantity"],
                **harvest_fields(code), **ln,
                "oddsByPts": {"proj": odds, "last": odds},
                "tagSeasons": {"year": YEAR, "seasons": seasons},
                "pointOdds": {"state": "UT", "kind": "bonus" if kind == "bonus" else "preference", "year": YEAR, "projected": False,
                              "pointsMeaning": "Points held when applying (DWR's table). " + (
                                  "Half of each pool's permits (rounded up; a one-permit pool none) go to the most points in order; the rest are drawn with points + 1 entries each."
                                  if kind == "bonus" else "A strict queue: the most points draw first, unit by unit."),
                              "pools": pools},
                "history": {str(y): {k: {"apps": v[0], "drew": v[1]} for k, v in p.items()} for y, p in sorted(p_hist.items())},
            }
            out.append(rec)

    for code, (name, weapon, op, cl, take) in GENERAL_ELK.items():
        bids = h2b.get(code)
        ln = land_for(bids or [])
        if not bids or ln is None:
            problems.append(f"{code}: general elk hunt has no boundary/land")
            continue
        out.append({
            "id": f"UT:{code}", "slug": f"ut-{code.lower()}", "state": "UT", "species": "ELK", "type": "GENERAL",
            "kind": "otc", "tagCode": code, "name": name, "areaName": "Any bull units" if take == "Any bull" else
            "Spike units" if take == "Spike bull" else "Any bull and spike units", "description": "General season, over the counter",
            "huntCategory": "General-Season", "units": [str(b) for b in bids], "weapon": weapon, "antlerClass": "ANTLERED",
            "takeMethod": take, "openDate": op, "closeDate": cl, "tags": None, "privateOnly": False, "youthOnly": False,
            "oddsLastYear": None, "oddsYears": 0, "resOddsLast": None, "nrOddsLast": None, "resOddsPrev": None, "nrOddsPrev": None,
            "resAppsLast": None, "nrAppsLast": None, "appsLast": None, "nrPermitsLast": None, "permitsLast": None,
            **harvest_fields(code), **ln, "oddsByPts": {"proj": {}, "last": {}},
            "tagSeasons": {"year": YEAR, "seasons": [{"weapon": weapon, "dates": [{"open": op, "close": cl}], "notes": ""}]},
        })

    for h in out:
        hu = h.get("hunters5"); sq = h["acres"] / 640 if h.get("acres") else None
        h["huntersSqMi"] = (hu / h["harvestYears"] / sq) if hu and sq else None
    ids = [h["id"] for h in out]
    if len(ids) != len(set(ids)):
        problems.append("duplicate hunt ids")
    (D / "hunts.json").write_text(json.dumps({"generated": date.today().isoformat(), "drawYear": YEAR, "regsYear": YEAR,
                                              "problems": problems, "hunts": out}, separators=(",", ":")) + "\n")
    by = {}
    for h in out:
        by[(h["species"], h["type"], h.get("huntCategory"))] = by.get((h["species"], h["type"], h.get("huntCategory")), 0) + 1
    print(f"wrote {len(out)} hunts; problems {len(problems)}: {problems[:8]}")
    for k, v in sorted(by.items(), key=str):
        print(" ", k, v)


if __name__ == "__main__":
    main()
