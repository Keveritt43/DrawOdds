#!/usr/bin/env python3
"""Build data/wa/hunts.json: Washington deer and elk hunts for 2026 with odds, harvest and land.

Usage: python3 -I scripts/wa_build_hunts.py   (reads data/wa/source/*, data/wa/units.json, data/wa/land.json)

Hunts (docs/states/wa-onboarding.md §1):
  - special permits, 2026 pamphlet tables, main categories only: Quality, Buck, Antlerless and Second Deer;
    Quality, Bull and Antlerless Elk. Youth, 65+, disabled and Master Hunter are parsed but left out (WA-2);
  - multi-season deer and elk tags (statewide drawings; WDFW harvest-report hunts 1999 and 2999);
  - general seasons: one hunt per GMU x weapon (archery, modern, muzzleloader) that had general-season hunters
    in the latest harvest year, so a GMU closed to a weapon has no row. Elk carries East/West from the GMU.

Odds (§5, scripts/wa_backtest.py): entries are P^2, P = banked points + 1. For each special hunt the point mix
starts from WDFW's last per-point table for that hunt (2020, else 2019, else 2018) and is rolled forward a year
at a time: unselected applications gain a point, selected ones leave, new applications enter at P = 1 to make up
that year's published application count (pamphlet "<year> APPS", harvest-report "Total Applicants"). Each year's
cutoff u solves expected selections = that year's permits; odds at P are 1 - (1 - u)^(P^2).
  last = the latest drawing with published applications (2025), estimated.
  proj = 2027: two more roll steps with 2025's application count, 2026 permits (2027's aren't set yet).
A hunt with no per-point table of its own starts from its category's pooled 2020 mix, flagged seed='category'.

Years are linked by hunt number AND name: WDFW reuses numbers for different hunts. The pamphlet for year Y+1
prints year Y's applications under the Y+1 number, which is WDFW's own link; earlier years must keep the name.
"""
from __future__ import annotations

import collections
import csv
import datetime as dt
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "wa" / "source"
YEAR = 2026
LAST = 2025          # latest drawing with published applications
PROJ = YEAR + 1
HARVEST_YEARS = list(range(2021, 2026))
MAIN = {"DEER": {"Quality Deer", "Buck Deer", "Antlerless Deer", "Second Deer"},
        "ELK": {"Quality Elk", "Bull Elk", "Antlerless Elk"}}
# 2018-2020 point-file category labels -> pamphlet categories
PTS_CAT = {("Deer", "Quality Deer"): "Quality Deer", ("Deer", "Quality"): "Quality Deer", ("Deer", "Buck Deer"): "Buck Deer",
           ("Deer", "Buck deer"): "Buck Deer", ("Deer", "Antlerless Deer"): "Antlerless Deer", ("Deer", "Antlerless"): "Antlerless Deer",
           ("Deer", "Second Deer"): "Second Deer", ("Elk", "Quality Elk"): "Quality Elk", ("Elk", "Bull Elk"): "Bull Elk",
           ("Elk", "Antlerless Elk"): "Antlerless Elk", ("Elk", "Antlerless"): "Antlerless Elk"}
MAXP = 25
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def cutoff(dist: dict[int, float], target: float) -> float:
    tot = sum(dist.values())
    if target <= 0 or tot <= 0:
        return 0.0
    if target >= tot:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(70):
        u = (lo + hi) / 2
        e = sum(n * (1 - (1 - u) ** (p * p)) for p, n in dist.items())
        lo, hi = (u, hi) if e < target else (lo, u)
    return (lo + hi) / 2


def roll(dist: dict[int, float], u: float, total: float) -> dict[int, float]:
    nxt: dict[int, float] = collections.Counter()
    for p, n in dist.items():
        nxt[min(p + 1, MAXP + 5)] += n * (1 - u) ** (p * p)   # unselected keep applying (r = 1, the backtest's best)
    kept = sum(nxt.values())
    if total > kept:
        nxt[1] += total - kept
    elif kept:
        nxt = collections.Counter({p: v * total / kept for p, v in nxt.items()})
    return dict(nxt)


def odds_by_banked(u: float) -> list[float]:
    return [round(1 - (1 - u) ** ((b + 1) ** 2), 4) for b in range(MAXP + 1)]


def parse_dates(s: str, year: int):
    """'Oct. 31-Nov. 8', 'Nov. 20-24', 'Sept. 21-25, Oct. 1-5' -> list of (open, close) ISO dates."""
    out, month = [], None
    for part in re.split(r",\s*(?=[A-Z][a-z]{2,4}\.?\s*\d)", s.replace("–", "-")):
        m = re.match(r"\s*([A-Z][a-z]{2,4})\.?\s*(\d{1,2})\s*-\s*(?:([A-Z][a-z]{2,4})\.?\s*)?(\d{1,2})", part)
        if not m:
            continue
        m1 = MONTHS.get(m.group(1)[:3].lower()); m2 = MONTHS.get((m.group(3) or m.group(1))[:3].lower())
        if not m1 or not m2:
            continue
        y2 = year + (1 if m2 < m1 else 0)
        try:
            out.append((dt.date(year, m1, int(m.group(2))).isoformat(), dt.date(y2, m2, int(m.group(4))).isoformat()))
        except ValueError:
            continue
    return out


def area_units(area: str, known: set[str]):
    """'GMUs 101, 105, 204' / 'Deer Area 3071' / 'GMU 373 (except Elk Area 3722)' -> unit names."""
    a = re.sub(r"\(except[^)]*\)|except[^;,.]*", "", area, flags=re.I)
    areas = [f"DA{x}" for x in re.findall(r"Deer Areas?\s*(\d{4})", a)] + [f"EA{x}" for x in re.findall(r"Elk Areas?\s*(\d{4})", a)]
    if areas:
        return [u for u in areas if u in known]
    gm = []
    for m in re.finditer(r"GMUs?\s*([\d,\s and-]+)", a):
        gm += re.findall(r"\d{3}", m.group(1))
    return [g for g in dict.fromkeys(gm) if g in known]


def main() -> None:
    units = {u["name"]: u for u in json.load(open(ROOT / "data" / "wa" / "units.json"))["units"]}
    land = json.load(open(ROOT / "data" / "wa" / "land.json"))["units"]
    rows = json.load(open(SRC / "permit-tables-2021-2026.json"))["rows"]
    H = json.load(open(SRC / "harvest-2013-2025.json"))["pages"]
    problems: list[str] = []

    # ---- harvest
    def num(s):
        s = (s or "").replace(",", "").replace("%", "").strip()
        try:
            return float(s)
        except ValueError:
            return None
    gen = collections.defaultdict(dict)       # (species, gmu, method) -> year -> rec
    for key, tabs in H.items():
        y, page = key.split("/")
        sp = "DEER" if page.startswith("deer") else "ELK"
        if page.endswith("-general"):
            for t in tabs:
                m = re.match(r"^(\d{3})\s*-", t["cap"])
                if not m or not t["rows"]:
                    continue
                hdr = t["rows"][0]
                for r in t["rows"][1:]:
                    d = dict(zip(hdr, r))
                    big = (num(d.get("4 Point")) or 0) + (num(d.get("5+ Point")) or 0) if sp == "DEER" else (num(d.get("6+ Point")) or 0)
                    gen[(sp, m.group(1), d["Method"])][int(y)] = {
                        "hunters": num(d.get("Number Hunters")), "harvest": num(d.get("Total Harvest")),
                        "antlered": num(d.get("Antlered Harvest")), "big": big, "days": num(d.get("Hunter Days"))}
    ind = collections.defaultdict(dict)       # (species, number) -> year -> rec (with name)
    for key, tabs in H.items():
        y, page = key.split("/")
        if not page.endswith("-individual"):
            continue
        sp = "DEER" if page.startswith("deer") else "ELK"
        for t in tabs:
            m = re.match(r"^(\d{4})\s*-\s*(.*)$", t["cap"])
            if not m or len(t["rows"]) < 2:
                continue
            d = dict(zip(t["rows"][0], t["rows"][1]))
            big = (num(d.get("4 Point")) or 0) + (num(d.get("5+ Point")) or 0)
            ind[(sp, int(m.group(1)))][int(y)] = {
                "name": m.group(2).strip(), "apps": num(d.get("Total Applicants")), "permits": num(d.get("Permits Issued")),
                "hunters": num(d.get("Hunters")), "harvest": num(d.get("Total Harvest")),
                "antlered": num(d.get("Antlered Harvest")), "big": big}

    def harvest_fields(yrs: dict[int, dict], species: str):
        use = [y for y in HARVEST_YEARS if y in yrs and yrs[y].get("hunters") and yrs[y].get("harvest") is not None]
        if not use:
            return {"success5": None, "hunters5": None, "harvest5": None, "harvestYears": 0, "harvestLastYear": None,
                    "successLast": None, "daysPerHunter5": None, "smallSample": True, "bigPct5": None}
        hu = sum(yrs[y]["hunters"] for y in use); hv = sum(yrs[y]["harvest"] for y in use)
        an = sum(yrs[y].get("antlered") or 0 for y in use); bg = sum(yrs[y].get("big") or 0 for y in use)
        days = [(yrs[y]["days"], yrs[y]["hunters"]) for y in use if yrs[y].get("days")]
        last = use[-1]
        return {"success5": hv / hu, "hunters5": hu, "harvest5": hv, "harvestYears": len(use), "harvestLastYear": last,
                "successLast": yrs[last]["harvest"] / yrs[last]["hunters"],
                "daysPerHunter5": (sum(d for d, _ in days) / sum(n for _, n in days)) if days else None,
                "smallSample": hu < 30, "bigPct5": (bg / an) if an >= 10 else None}

    # ---- point tables 2018-2020
    pts = collections.defaultdict(lambda: collections.Counter())   # (year, species, hunt) -> P -> applications
    ptsel = collections.defaultdict(lambda: collections.Counter())
    pcat, pname = {}, {}
    for r in csv.DictReader(open(SRC / "drawing-points-2018-2020.csv")):
        k = (int(r["year"]), r["species"].upper(), int(r["hunt"]))
        pts[k][int(r["point_total"])] += int(r["applications"])
        ptsel[k][int(r["point_total"])] += int(r["selected_applications"])
        pcat[k] = PTS_CAT.get((r["species"], r["category"]), r["category"])
        pname[k] = r["hunt_name"]
    catmix = collections.defaultdict(collections.Counter)
    for k, d in pts.items():
        if k[0] == 2020:
            for p, n in d.items():
                catmix[(k[1], pcat[k])][p] += n

    # pamphlet rows by year
    by_year = collections.defaultdict(list)
    for r in rows:
        if r["species"]:
            by_year[r["year"]].append(r)

    def find(year: int, species: str, category: str, name: str, number: int | None = None, like: dict | None = None):
        """The row for this hunt in another year's pamphlet: same category and name; when several hunts share the
        name (one per weapon or season), the one with the same number, else the same tag, area and legal animal."""
        cands = [r for r in by_year[year] if r["species"].upper() == species and r["category"] == category and norm(r["name"]) == norm(name)]
        if len(cands) <= 1:
            return cands[0] if cands else None
        if number is not None:
            exact = [r for r in cands if r["choice"] == number]
            if exact and (like is None or norm(exact[0]["tag"]) == norm(like["tag"])):
                return exact[0]
        if like is not None:
            score = lambda r: (norm(r["tag"]) == norm(like["tag"])) * 4 + (norm(r["area"]) == norm(like["area"])) * 2 + (norm(r["legal"]) == norm(like["legal"]))
            best = sorted(cands, key=score, reverse=True)
            if score(best[0]) >= 4 and (len(best) == 1 or score(best[0]) > score(best[1])):
                return best[0]
        return None

    hunts = []
    known = set(units)
    gmu_side = {k: u.get("side") for k, u in units.items() if u["kind"] == "gmu"}

    def land_for(us):
        recs = [land.get(u) for u in us]
        if not us or any(r is None for r in recs):
            return None
        acres = sum(r["acres"] for r in recs)
        w = lambda k: round(sum(r[k] * r["acres"] for r in recs) / acres, 1)
        return {"acres": acres, "publicPct": w("publicPct"), "privatePct": w("privatePct"),
                "accessAcres": sum(r.get("accessAcres", 0) for r in recs)}

    # ---- special permits
    seeds = collections.Counter()
    for r in by_year[YEAR]:
        sp = r["species"].upper()
        if r["category"] not in MAIN[sp]:
            continue
        hid = f"WA:{r['choice']}"
        us = area_units(r["area"], known)
        if not us:
            problems.append(f"{hid} {r['name']}: no unit in '{r['area']}'")
            continue
        # demand by year, walking back by name (WDFW's Y+1 pamphlet carries Y's apps under the Y+1 number)
        demand = {}   # year -> (apps, permits)
        cur_name, cur_num, like = r["name"], r["choice"], r
        for y in range(YEAR, 2020, -1):
            row = r if y == YEAR else find(y, sp, r["category"], cur_name, None, like)
            if row is None:
                break
            like = row
            if row["prior_apps"] is not None:
                prev = find(y - 1, sp, r["category"], cur_name, None, row) if y - 1 >= 2021 else None
                permits_prev = prev["permits"] if prev else None
                demand[y - 1] = (row["prior_apps"], permits_prev, row["choice"])
            cur_num = row["choice"]
        # seed point mix: the hunt's own WDFW table from the earliest linked year, by number in that year
        seed, seed_year, seed_kind, seed_sel = None, None, "category", None
        # The 2021 pamphlet prints 2020's applications under the 2021 number; the 2020 table may use another
        # number. Take the 2020 table in the same category whose application total fits (the tables count ~95% of
        # the any-choice applications the pamphlet prints) and whose number or name agrees.
        pub20 = demand.get(2020, (None, None, None))
        if pub20[0]:
            words = {w for w in re.findall(r"[a-z]{4,}", r["name"].lower())}
            best = None
            for k, d in pts.items():
                if k[0] != 2020 or k[1] != sp or pcat.get(k) != r["category"]:
                    continue
                ratio = sum(d.values()) / pub20[0]
                if not 0.85 <= ratio <= 1.02:
                    continue
                agree = (k[2] == pub20[2]) * 2 + bool(words & set(re.findall(r"[a-z]{4,}", pname[k].lower())))
                if agree and (best is None or (agree, -abs(ratio - 0.95)) > best[0]):
                    best = ((agree, -abs(ratio - 0.95)), k)
            if best:
                k = best[1]
                seed, seed_year, seed_kind, seed_sel = dict(pts[k]), 2020, "own", sum(ptsel[k].values())
        if seed is None:
            mix = catmix.get((sp, r["category"]))
            if not mix:
                problems.append(f"{hid}: no category mix for {r['category']}")
                continue
            seed_year = 2020
            first_apps = demand.get(2020, (None,))[0] or next((demand[y][0] for y in sorted(demand)), None)
            if not first_apps:
                problems.append(f"{hid} {r['name']}: no published applications in any year")
                continue
            tot = sum(mix.values())
            seed = {p: n * first_apps / tot for p, n in mix.items()}
            seeds["category"] += 1
        else:
            seeds["own"] += 1
        # the seed year's own cutoff: from its real selections when we have the table, else its permits
        if seed_sel is not None:
            u = cutoff(seed, seed_sel)
        else:
            pm = demand.get(seed_year, (None, None))[1] or r["permits"]
            u = cutoff(seed, pm or 0)
        dist = seed
        last_u, last_apps, last_permits = None, None, None
        for y in range(seed_year + 1, LAST + 1):
            apps, permits, _ = demand.get(y, (None, None, None))
            if apps is None:
                apps = sum(dist.values())          # no published count that year: carry the last one
            if permits is None:
                permits = r["permits"]
            dist = roll(dist, u, apps)
            u = cutoff(dist, permits)
            last_u, last_apps, last_permits = u, apps, permits
        if last_u is None:
            problems.append(f"{hid}: nothing to roll")
            continue
        # projection: 2026 (permits known, apps = 2025's), then 2027 (same)
        d26 = roll(dist, u, last_apps)
        u26 = cutoff(d26, r["permits"] or 0)
        d27 = roll(d26, u26, last_apps)
        u27 = cutoff(d27, r["permits"] or 0)
        units_land = land_for(us)
        hv = harvest_fields({y: v for y, v in ind.get((sp, r["choice"]), {}).items()
                             if norm(v["name"]) == norm(r["name"])}, sp)
        dates = parse_dates(r["dates"], YEAR)
        tag = r["tag"]
        weapon = "ARCHERY" if "Archery" in tag or tag in ("EA", "WA") else "MUZZLELOADER" if "Muzzle" in tag or tag in ("EM", "WM") else "ANY"
        legal = r["legal"]
        antler = "ANTLERLESS" if re.search(r"antlerless", legal, re.I) and not re.search(r"any (elk|deer)|either", legal, re.I) else \
                 "EITHER" if re.search(r"any (elk|deer)|either", legal, re.I) else "ANTLERED"
        priv = bool(re.search(r"\bJ\b", r["notes"])) or bool(re.search(r"private lands? only", r["area"] + " " + legal, re.I))
        h = {
            "id": hid, "slug": f"wa-{r['choice']}", "state": "WA", "species": sp, "type": "CONTROLLED", "tagCode": str(r["choice"]),
            "name": f"{r['name']} {r['category'].replace(' Deer', '').replace(' Elk', '')} {sp.title()}".replace("  ", " "),
            "areaName": r["area"], "description": r["category"], "huntCategory": r["category"], "units": us,
            "weapon": weapon, "antlerClass": antler, "takeMethod": legal, "tagRequired": tag, "notes": r["notes"],
            "openDate": dates[0][0] if dates else None, "closeDate": dates[-1][1] if dates else None,
            "tags": r["permits"], "privateOnly": priv, "youthOnly": False,
            "oddsLastYear": LAST, "oddsYears": len([y for y in demand if y <= LAST]),
            "appsLast": last_apps, "permitsLast": last_permits,
            "resOddsLast": (last_permits / last_apps) if last_apps else None, "nrOddsLast": (last_permits / last_apps) if last_apps else None,
            "resAppsLast": None, "nrAppsLast": None,
            **hv,
            "acres": units_land["acres"] if units_land else None,
            "publicPct": units_land["publicPct"] if units_land else None,
            "privatePct": units_land["privatePct"] if units_land else None,
            "oddsByPts": {"proj": {"res": odds_by_banked(u27), "nr": odds_by_banked(u27)},
                          "last": {"res": odds_by_banked(last_u), "nr": odds_by_banked(last_u)}},
            "tagSeasons": {"year": YEAR, "seasons": [{"weapon": weapon, "sex": legal,
                           "dates": [{"open": a, "close": b} for a, b in dates], "notes": r["notes"]}]},
            "pointOdds": {"state": "WA", "kind": "squared", "year": LAST, "projected": True, "projYear": PROJ,
                          "estimated": True, "seed": seed_kind,
                          "seedYear": seed_year,
                          "pointsMeaning": "Points you hold before applying. You draw with your points plus this year's, squared: "
                                           "4 banked points = 5 = 25 entries.",
                          "demand": {str(y): {"apps": a, "permits": p} for y, (a, p, _) in sorted(demand.items())},
                          "cutoff": {"last": last_u, "y2026": u26, "proj": u27},
                          "harvest": [{"year": y, **{k: v for k, v in rec.items() if k in ("hunters", "harvest", "apps", "permits")}}
                                      for y, rec in sorted(ind.get((sp, r["choice"]), {}).items()) if norm(rec["name"]) == norm(r["name"])]},
        }
        if h["publicPct"] is None:
            problems.append(f"{hid}: no land for {us}")
        hunts.append(h)

    # ---- multi-season (harvest-report hunts 1999 deer, 2999 elk carry Total Applicants every year)
    for sp, num_, quota in (("DEER", 1999, 8500), ("ELK", 2999, 1000)):
        yrs = ind.get((sp, num_), {})
        k20 = [k for k in pts if k[0] in (2019, 2018) and k[1] == sp and pcat.get(k, "").lower().startswith("multiseason")]
        k20.sort(reverse=True)
        if not yrs or not k20:
            problems.append(f"multi-season {sp}: missing applications ({sorted(yrs)}) or point table ({k20})")
            continue
        seed_k = k20[0]
        dist = dict(pts[seed_k])
        u = cutoff(dist, sum(ptsel[seed_k].values()))
        last_u = last_apps = None
        for y in range(seed_k[0] + 1, LAST + 1):
            apps = (yrs.get(y) or {}).get("apps") or sum(dist.values())
            dist = roll(dist, u, apps)
            u = cutoff(dist, quota)
            last_u, last_apps = u, apps
        d26 = roll(dist, u, last_apps); u26 = cutoff(d26, quota)
        d27 = roll(d26, u26, last_apps); u27 = cutoff(d27, quota)
        gmus = sorted(k for k, v in units.items() if v["kind"] == "gmu")
        lf = land_for(gmus)
        hv = harvest_fields(yrs, sp)
        hunts.append({
            "id": f"WA:MS-{sp}", "slug": f"wa-ms-{sp.lower()}", "state": "WA", "species": sp, "type": "CONTROLLED",
            "tagCode": str(num_), "name": f"Multi-season {sp.title()} Tag", "areaName": "Statewide (general seasons, any weapon)",
            "description": "Multi-season", "huntCategory": "Multi-season", "units": gmus, "weapon": "ANY", "antlerClass": "EITHER",
            "takeMethod": "Legal animal per the general season you hunt", "tagRequired": "Multi-season", "notes": "",
            "openDate": None, "closeDate": None, "tags": quota, "privateOnly": False, "youthOnly": False,
            "oddsLastYear": LAST, "oddsYears": len([y for y in yrs if y <= LAST and yrs[y].get("apps")]),
            "appsLast": last_apps, "permitsLast": quota, "resOddsLast": quota / last_apps if last_apps else None,
            "nrOddsLast": quota / last_apps if last_apps else None, "resAppsLast": None, "nrAppsLast": None, **hv,
            "acres": lf["acres"] if lf else None, "publicPct": lf["publicPct"] if lf else None, "privatePct": lf["privatePct"] if lf else None,
            "oddsByPts": {"proj": {"res": odds_by_banked(u27), "nr": odds_by_banked(u27)},
                          "last": {"res": odds_by_banked(last_u), "nr": odds_by_banked(last_u)}},
            "tagSeasons": {"year": YEAR, "seasons": []},
            "pointOdds": {"state": "WA", "kind": "squared", "year": LAST, "projected": True, "projYear": PROJ, "estimated": True,
                          "seed": "own", "seedYear": seed_k[0], "multiSeason": True,
                          "pointsMeaning": "Points you hold before applying. You draw with your points plus this year's, squared.",
                          "demand": {str(y): {"apps": v.get("apps"), "permits": v.get("permits")} for y, v in sorted(yrs.items())},
                          "cutoff": {"last": last_u, "y2026": u26, "proj": u27}},
        })

    # ---- general seasons: GMU x weapon with hunters in the latest harvest year
    METHOD = {"Archery": "ARCHERY", "Modern Firearm": "ANY", "Muzzleloader": "MUZZLELOADER"}
    WNAME = {"ARCHERY": "Archery", "ANY": "Modern Firearm", "MUZZLELOADER": "Muzzleloader"}
    latest = max(y for v in gen.values() for y in v)
    for (sp, gmu, meth), yrs in sorted(gen.items()):
        if meth not in METHOD or gmu not in units:
            continue
        rec = yrs.get(latest)
        if not rec or not rec.get("hunters"):
            continue
        w = METHOD[meth]
        side = gmu_side.get(gmu)
        lf = land_for([gmu])
        hv = harvest_fields(yrs, sp)
        tagc = (("E" if side == "EAST" else "W") + {"ANY": "F", "ARCHERY": "A", "MUZZLELOADER": "M"}[w]) if sp == "ELK" else WNAME[w]
        hunts.append({
            "id": f"WA:G{sp[0]}-{gmu}-{w}", "slug": f"wa-g{sp[0].lower()}-{gmu}-{w.lower()}", "state": "WA", "species": sp,
            "type": "GENERAL", "tagCode": tagc,
            "name": f"{units[gmu]['label']} ({gmu}) General {WNAME[w]} {sp.title()}", "areaName": f"GMU {gmu} {units[gmu]['label']}",
            "description": "General season", "huntCategory": "General", "units": [gmu], "weapon": w, "antlerClass": "ANTLERED",
            "takeMethod": "See the 2026 pamphlet for this GMU's legal animal", "tagRequired": tagc, "notes": "",
            "elkSide": side if sp == "ELK" else None,
            "openDate": None, "closeDate": None, "tags": None, "privateOnly": False, "youthOnly": False,
            "oddsLastYear": None, "oddsYears": 0, **hv,
            "acres": lf["acres"] if lf else None, "publicPct": lf["publicPct"] if lf else None, "privatePct": lf["privatePct"] if lf else None,
            "oddsByPts": {"proj": {}, "last": {}},
            "tagSeasons": {"year": YEAR, "seasons": []},
            "pointOdds": {"state": "WA", "kind": "otc", "year": YEAR, "projected": False, "pools": {},
                          "harvest": [{"year": y, "hunters": v["hunters"], "harvest": v["harvest"]} for y, v in sorted(yrs.items()) if v.get("hunters")]},
        })

    for h in hunts:
        sq = h["acres"] / 640 if h.get("acres") else None
        h["huntersSqMi"] = (h["hunters5"] / h["harvestYears"] / sq) if h.get("hunters5") and sq and h.get("harvestYears") else None

    out = {"generated": dt.date.today().isoformat(), "drawYear": LAST, "regsYear": YEAR, "problems": [],
           "omitted": problems, "seeds": dict(seeds), "hunts": hunts}
    (ROOT / "data" / "wa" / "hunts.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    c = collections.Counter((h["species"], h["type"], h.get("huntCategory")) for h in hunts)
    for k in sorted(c):
        print(k, c[k])
    print("seeds", dict(seeds), "omitted", len(problems))
    for p in problems[:30]:
        print("  ", p)


if __name__ == "__main__":
    main()
