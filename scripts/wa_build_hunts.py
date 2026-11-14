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
import json, math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "wa" / "source"
YEAR = 2026
LAST = 2025          # latest drawing with published applications
PROJ = YEAR + 1
HARVEST_YEARS = list(range(2021, 2026))
MAIN = {"DEER": {"Quality Deer", "Buck Deer", "Antlerless Deer", "Second Deer", "Deer - Youth",
                 "Deer - 65 Years or Over", "Deer - Hunters with Disabilities", "Deer - Master Hunter"},
        "ELK": {"Quality Elk", "Bull Elk", "Antlerless Elk", "Elk - Youth",
                "Elk - 65 and Over", "Elk - Hunters with Disabilities", "Elk - Master Hunter"}}
YOUTH = {"Deer - Youth", "Elk - Youth"}
# Eligibility categories: who may apply is limited (65 or older, registered hunters with disabilities, certified
# Master Hunters). Hidden in Find Hunts unless the category is picked.
RESTRICTED = {"Deer - 65 Years or Over", "Elk - 65 and Over", "Deer - Hunters with Disabilities",
              "Elk - Hunters with Disabilities", "Deer - Master Hunter", "Elk - Master Hunter"}
# WDFW has never published 65+ results by point level (no table 2017-2020), and borrowing another category's mix
# scored worse than a flat permits/applications guess when tested on the categories that do have tables
# (scripts/wa_backtest_no_table.py, docs §7: flat 0.07549, antlerless mix 0.07684). So 65+ hunts get no odds by point level.
NO_POINT_DATA = {"Deer - 65 Years or Over", "Elk - 65 and Over"}
SHORT = {"Deer - 65 Years or Over": "65+", "Elk - 65 and Over": "65+", "Deer - Hunters with Disabilities": "Hunters with Disabilities",
         "Elk - Hunters with Disabilities": "Hunters with Disabilities", "Deer - Master Hunter": "Master Hunter",
         "Elk - Master Hunter": "Master Hunter", "Deer - Youth": "Youth", "Elk - Youth": "Youth"}
# Share of unselected applications that come back next year. 1.0 for the main categories (backtest, §5). Youth
# applicants age out at 16, and the youth backtest picked 0.7 on 2019 (Brier 0.11126 vs 0.11278 at 1.0, last-year
# 0.11690) and it held on 2020 (0.10418 vs 0.10445, last-year 0.11656).
RETURN = {"Deer - Youth": 0.7, "Elk - Youth": 0.7}
# 2018-2020 point-file category labels -> pamphlet categories
PTS_CAT = {("Deer", "Quality Deer"): "Quality Deer", ("Deer", "Quality"): "Quality Deer", ("Deer", "Buck Deer"): "Buck Deer",
           ("Deer", "Buck deer"): "Buck Deer", ("Deer", "Antlerless Deer"): "Antlerless Deer", ("Deer", "Antlerless"): "Antlerless Deer",
           ("Deer", "Second Deer"): "Second Deer", ("Elk", "Quality Elk"): "Quality Elk", ("Elk", "Bull Elk"): "Bull Elk",
           ("Elk", "Antlerless Elk"): "Antlerless Elk", ("Elk", "Antlerless"): "Antlerless Elk",
           ("Deer", "Youth"): "Deer - Youth", ("Deer", "Deer Youth"): "Deer - Youth",
           ("Elk", "Youth"): "Elk - Youth", ("Elk", "Elk Youth"): "Elk - Youth",
           ("Deer", "Deer Disabled"): "Deer - Hunters with Disabilities", ("Elk", "Elk Disabled"): "Elk - Hunters with Disabilities",
           ("Deer", "Deer Master Hunter"): "Deer - Master Hunter", ("Deer", "Master Hunter"): "Deer - Master Hunter",
           ("Elk", "Elk Master Hunter"): "Elk - Master Hunter"}
MAXP = 40   # account input allows 40; Entiat, Desert and Colockum applicants already pass 30
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


def roll(dist: dict[int, float], u: float, total: float, r: float = 1.0) -> dict[int, float]:
    nxt: dict[int, float] = collections.Counter()
    for p, n in dist.items():
        nxt[p + 1] += r * n * (1 - u) ** (p * p)   # unselected come back with a point (r = 1, the backtest's best; youth 0.7)
    kept = sum(nxt.values())
    if total > kept:
        nxt[1] += total - kept
    elif kept:
        nxt = collections.Counter({p: v * total / kept for p, v in nxt.items()})
    return dict(nxt)


def odds_by_banked(u: float) -> list[float]:
    # A weighted lottery with permits left is never 0: keep a tiny floor so a long shot isn't shown as "No chance"
    # (owner's rule: "No chance" only when nothing can draw).
    out = []
    for b in range(MAXP + 1):
        v = 1 - (1 - u) ** ((b + 1) ** 2)
        out.append(max(round(v, 6), 1e-6) if v > 0 else 0.0)
    return out


def parse_dates(s: str, year: int):
    """'Oct. 31-Nov. 8', 'Nov. 20-24', 'Sept. 21-25, Oct. 1-5' -> list of (open, close) ISO dates."""
    # Some PDF extraction splits a two-digit day ("Sept. 2 5 -2 9").
    s = re.sub(r'(?<=\d) (?=\d(?:\s*[-,]|$))', '', s)
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
    out = [g for g in dict.fromkeys(gm) if g in known]
    if not out:
        # Master Hunter hunts name a WDFW region ("Region 3", "Designated Areas in Region 6"; Region 4 North/South by
        # name). WDFW numbers GMUs by region (1xx Eastern ... 6xx Coastal), so the region's GMUs stand in for its
        # designated areas, which WDFW announces to selected hunters and doesn't map.
        m = re.search(r"Region\s*(\d)", a)
        if m:
            out = sorted((g for g in known if g.isdigit() and g[0] == m.group(1)), key=int)
    return out


def permit_only_gmus() -> dict[str, set[str]]:
    """GMUs where the 2026 pamphlet allows deer or elk only by special permit (or closes them). A general-season
    harvest row in one of these is a reporting artifact, not a general hunt: GMU 653 White River elk shows ~45
    "general" hunters a year in the harvest report, but the pamphlet lists it as permit only."""
    pages = json.load(open(SRC / "regs-2026.json"))["pamphlet"]
    pages = pages if isinstance(pages, list) else pages["pages"]
    out = {"DEER": set(), "ELK": set()}
    for pg in pages:
        texts = [it[4] for it in pg["items"]]
        joined = " ".join(texts)
        for i, t in enumerate(texts):
            if t.startswith("PERMIT ONLY UNITS"):          # deer page: "...to hunt deer: 290 Desert, 329 ..."
                tail = " ".join(texts[i + 1:i + 4])
                if "deer" in tail:
                    out["DEER"] |= set(re.findall(r"\b(\d{3})\b", tail.split("deer", 1)[1]))
            if t.replace(" ", "") in ("ONLYINGMUS:", "GMUSCLOSEDTOHUNTING:") and "elk" in joined.lower():
                out["ELK"] |= set(re.findall(r"\b(\d{3})\b", texts[i + 1] if i + 1 < len(texts) else ""))
    return out


def main() -> None:
    units = {u["name"]: u for u in json.load(open(ROOT / "data" / "wa" / "units.json"))["units"]}
    land = json.load(open(ROOT / "data" / "wa" / "land.json"))["units"]
    rows = json.load(open(SRC / "permit-tables-2021-2026.json"))["rows"]
    for r in rows:
        # "APPS/AVG PTS" cells print as "1810/16". One 2021 cell lost its slash in the PDF text ("44505", Prescott
        # archery elk, a hunt with 14-26 applications every other year); treat any slashless cell as unknown.
        if r.get("prior_apps") is not None and "/" not in str(r.get("prior_raw") or ""):
            r["prior_apps"] = None
        # "NEW", and "0/0" (17 cells in 2026, e.g. the rebuilt Alkali antlerless hunts), mean the hunt had no drawing
        # last year. Don't count 0 applications, and don't chain it to last year's hunt of the same name.
        r["is_new"] = str(r.get("prior_raw") or "").strip() in ("NEW", "0/0")
        if r["is_new"]:
            r["prior_apps"] = None
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
        pname[k] = r["hunt_name"] or pname.get(k, "")   # continuation rows of a split PDF table have no name
    catmix = collections.defaultdict(collections.Counter)
    for k, d in pts.items():
        if k[0] == 2020:
            for p, n in d.items():
                catmix[(k[1], pcat[k])][p] += n
    # Deer - Hunters with Disabilities and Elk - Master Hunter have tables for 2018-2019 only: roll the 2019 pool one
    # year (unselected gain a point, the total refilled at P = 1) to stand in for 2020.
    late = collections.defaultdict(collections.Counter); late_sel = collections.defaultdict(collections.Counter)
    for k, d in pts.items():
        if k[0] == 2019 and (k[1], pcat.get(k)) not in catmix:
            for p, n in d.items():
                late[(k[1], pcat[k])][p] += n
                late_sel[(k[1], pcat[k])][p] += ptsel[k].get(p, 0)
    for key, d in late.items():
        nxt = collections.Counter({p + 1: n - late_sel[key][p] for p, n in d.items()})
        nxt[1] += sum(d.values()) - sum(nxt.values())
        catmix[key] = nxt

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
            # Several hunts can share name, tag, area and legal animal (Desert has two modern Quality hunts, Colockum
            # several), differing only in season dates and permit count; hunt numbers move between years. Score the
            # cheap identity fields, then break ties on dates, then on the closest permit count.
            score = lambda r: ((norm(r["tag"]) == norm(like["tag"])) * 8 + (norm(r["area"]) == norm(like["area"])) * 4
                               + (norm(r["legal"]) == norm(like["legal"])) * 2 + (norm(r.get("dates") or "") == norm(like.get("dates") or "")))
            def tie(r):
                pa, pb = r.get("permits") or 0, like.get("permits") or 0
                return -abs(math.log((pa + 1) / (pb + 1)))
            best = sorted(cands, key=lambda r: (score(r), tie(r)), reverse=True)
            if score(best[0]) >= 8 and (len(best) == 1 or (score(best[0]), tie(best[0])) > (score(best[1]), tie(best[1]))):
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
        us = area_units(r["area"] + " | " + r["name"], known)
        if not us:
            problems.append(f"{hid} {r['name']}: no unit in '{r['area']}'")
            continue
        # demand by year, walking back by name (WDFW's Y+1 pamphlet carries Y's apps under the Y+1 number)
        demand = {}   # year -> (apps, permits)
        cur_name, cur_num, like = r["name"], r["choice"], r
        for y in range(YEAR, 2020, -1):
            row = r if y == YEAR else find(y, sp, r["category"], cur_name, None, like)
            if row is None or row.get("is_new"):
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
                agree = (k[2] == pub20[2]) * 2 + bool(words & set(re.findall(r"[a-z]{4,}", pname[k].lower())))
                # Same number and name: the table is this hunt even when its count runs low (archery tables hold
                # 70-80% of the printed applications). Otherwise demand the usual 85-102% fit.
                lo, hi = (0.6, 1.1) if agree == 3 else (0.85, 1.02)
                if not lo <= ratio <= hi:
                    continue
                if agree and (best is None or (agree, -abs(ratio - 0.95)) > best[0]):
                    best = ((agree, -abs(ratio - 0.95)), k)
            if best:
                k = best[1]
                seed, seed_year, seed_kind, seed_sel = dict(pts[k]), 2020, "own", sum(ptsel[k].values())
        if seed is None and r["category"] in NO_POINT_DATA:
            # placeholder so the demand and permit fields get built; the odds tables are dropped below
            catmix[(sp, r["category"])] = collections.Counter({1: 1})
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
            dist = roll(dist, u, apps, RETURN.get(r["category"], 1.0))
            u = cutoff(dist, permits)
            last_u, last_apps, last_permits = u, apps, permits
        if last_u is None:
            problems.append(f"{hid}: nothing to roll")
            continue
        # projection: 2026 (permits known, apps = 2025's), then 2027 (same)
        rr = RETURN.get(r["category"], 1.0)
        d26 = roll(dist, u, last_apps, rr)
        u26 = cutoff(d26, r["permits"] or 0)
        d27 = roll(d26, u26, last_apps, rr)
        u27 = cutoff(d27, r["permits"] or 0)
        units_land = land_for(us)
        # Colockum 2016 was the later Oct/Nov hunt before the 2023 code reassignment.
        same_hunt = {y: v for y, v in ind.get((sp, r["choice"]), {}).items()
                     if norm(v["name"]) == norm(r["name"]) and not (sp == 'ELK' and r['choice'] == 2016 and norm(r['name']) == 'colockum' and y < 2023)}
        hv = harvest_fields(same_hunt, sp)
        dates = parse_dates(r["dates"], YEAR)
        tag = r["tag"]
        weapon = "ARCHERY" if "Archery" in tag or tag in ("EA", "WA") else "MUZZLELOADER" if "Muzzle" in tag or tag in ("EM", "WM") else "ANY"
        legal = r["legal"]
        antler = "ANTLERLESS" if re.search(r"antlerless", legal, re.I) and not re.search(r"any (elk|deer)|either", legal, re.I) else \
                 "EITHER" if re.search(r"any (elk|deer)|either", legal, re.I) else "ANTLERED"
        priv = bool(re.search(r"\bJ\b", r["notes"])) or bool(re.search(r"private lands? only", r["area"] + " " + legal, re.I))
        h = {
            "id": hid, "slug": f"wa-{r['choice']}", "state": "WA", "species": sp, "type": "CONTROLLED", "tagCode": str(r["choice"]),
            "name": (f"{r['name']} {SHORT[r['category']]} {sp.title()}" if r["category"] in SHORT
                     else f"{r['name']} {r['category'].replace(' Deer', '').replace(' Elk', '')} {sp.title()}".replace("  ", " ")),
            "areaName": r["area"], "description": r["category"], "huntCategory": r["category"], "units": us,
            "weapon": weapon, "antlerClass": antler, "takeMethod": legal, "tagRequired": tag, "notes": r["notes"],
            "openDate": dates[0][0] if dates else None, "closeDate": dates[-1][1] if dates else None,
            "tags": r["permits"], "privateOnly": priv, "youthOnly": r["category"] in YOUTH,
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
                          "estimated": True, "seed": seed_kind, "category": r["category"], "tag": tag, "notes": r["notes"],
                          "dates": r["dates"], "legal": legal, "area": r["area"],
                          "seedYear": seed_year,
                          "pointsMeaning": "Points you hold before applying. You draw with your points plus this year's, squared: "
                                           "4 banked points = 5 = 25 entries.",
                          "demand": {str(y): {"apps": a, "permits": p} for y, (a, p, _) in sorted(demand.items())},
                          "cutoff": {"last": last_u, "y2026": u26, "proj": u27},
                          "harvest": [{"year": y, **{k: v for k, v in rec.items() if k in ("hunters", "harvest", "apps", "permits")}}
                                      for y, rec in sorted(same_hunt.items())]},
        }
        if h["publicPct"] is None:
            problems.append(f"{hid}: no land for {us}")
        if r['dates'] == 'Sept. 2 5 -2 9' and sp == 'ELK' and r['choice'] in (2015, 2016, 2018, 2019, 2020, 2022, 2023, 2024, 2025):
            h['pointOdds']['dates'] = 'Sept. 25–29'  # WDFW April 22, 2026 corrections
        if sp == 'ELK' and r['choice'] == 2016 and norm(r['name']) == 'colockum':
            h['oddsByPts'] = {'proj': {}, 'last': {}}
            h['pointOdds']['demand'] = {year: v for year, v in h['pointOdds']['demand'].items() if int(year) >= 2023}
            h['pointOdds']['oddsUnavailableReason'] = 'Point-level estimates are unavailable because this hunt number previously identified a different season.'
        if r["category"] in NO_POINT_DATA:
            h["oddsByPts"] = {"proj": {}, "last": {}}
            h["pointOdds"].update({"projected": False, "estimated": False, "seed": None, "seedYear": None, "cutoff": None, "noPointData": True})
            seeds["category"] -= 1; seeds["none"] += 1
        h["restricted"] = r["category"] in RESTRICTED
        h["pointOdds"]["restricted"] = h["restricted"]
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
                          "seed": "own", "seedYear": seed_k[0], "multiSeason": True, "category": f"Multi-season {sp.title()}", "tag": "Multi-season",
                          "pointsMeaning": "Points you hold before applying. You draw with your points plus this year's, squared.",
                          "demand": {str(y): {"apps": v.get("apps"), "permits": v.get("permits")} for y, v in sorted(yrs.items())},
                          "cutoff": {"last": last_u, "y2026": u26, "proj": u27}},
        })

    # ---- general seasons: GMU x weapon with hunters in the latest harvest year
    METHOD = {"Archery": "ARCHERY", "Modern Firearm": "ANY", "Muzzleloader": "MUZZLELOADER"}
    WNAME = {"ARCHERY": "Archery", "ANY": "Modern Firearm", "MUZZLELOADER": "Muzzleloader"}
    latest = max(y for v in gen.values() for y in v)
    permit_only = permit_only_gmus()
    print("permit-only GMUs", {k: sorted(v) for k, v in permit_only.items()})
    # The 2026 pamphlet's general-season tables (scripts/wa_parse_general_seasons.py): the seasons an adult with a
    # general tag can use, per species, weapon and GMU. These decide which general hunts exist and their legal animal;
    # harvest only supplies success. (Before Nov 13 the legal animal was guessed from the harvest mix and was wrong
    # for ~30 GMUs: WDFW's general harvest rows include Master Hunter and youth kills.)
    regs = collections.defaultdict(list)
    youth_regs = collections.defaultdict(list)   # youth-only general days (2026: GMU 124 and 127-142 modern deer)
    for s in json.load(open(ROOT / "data" / "wa" / "general-seasons-2026.json"))["rows"]:
        if s["dates"] and (s["adult"] or s["youth"]):
            for g in s["gmus"]:
                (regs if s["adult"] else youth_regs)[(s["species"], g, s["weapon"])].append(s)
    by_weapon = {}
    for (sp, gmu, meth), yrs in gen.items():
        if meth in METHOD:
            by_weapon[(sp, gmu, METHOD[meth])] = yrs
    any_sex = re.compile(r"any (elk|deer)|either|spike or antlerless")
    for key in sorted(set(by_weapon) | set(regs)):
        sp, gmu, w = key
        yrs = by_weapon.get(key, {})
        if gmu not in units:
            continue
        if gmu in permit_only.get(sp, set()):
            problems.append(f"general {sp.lower()} {w} in GMU {gmu}: pamphlet says permit only; harvest row dropped")
            continue
        seasons = regs.get(key)
        if not seasons:
            if yrs.get(latest, {}).get("hunters"):
                problems.append(f"general {sp.lower()} {w} in GMU {gmu}: harvest shows general hunters but the 2026 tables list "
                                "no adult general season (Master Hunter, youth or closed); dropped")
            continue
        sexes = [x["sex"] for x in seasons]
        f = any(any_sex.search(x) or x.startswith("antlerless") for x in sexes)
        m = any(any_sex.search(x) or not x.startswith("antlerless") for x in sexes)
        antler = "EITHER" if f and m else "ANTLERLESS" if f else "ANTLERED"
        # success counts only the animals an adult may take here
        if antler == "ANTLERED":
            yrs = {y: {**v, "harvest": v.get("antlered") if v.get("antlered") is not None else v.get("harvest")} for y, v in yrs.items()}
        elif antler == "ANTLERLESS":
            yrs = {y: {**v, "harvest": (v.get("harvest") or 0) - (v.get("antlered") or 0)} for y, v in yrs.items()}
        side = gmu_side.get(gmu)
        lf = land_for([gmu])
        tagc = (("E" if side == "EAST" else "W") + {"ANY": "F", "ARCHERY": "A", "MUZZLELOADER": "M"}[w]) if sp == "ELK" else WNAME[w]
        hv = harvest_fields(yrs, sp)
        MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        def span(o: str, c: str) -> str:
            mo, mc = MO[int(o[5:7]) - 1], MO[int(c[5:7]) - 1]
            return f"{mo} {int(o[8:])}–{int(c[8:])}" if mo == mc else f"{mo} {int(o[8:])}–{mc} {int(c[8:])}"
        def who(x: dict) -> str:
            t = {"Black-tailed": "Black-tailed deer", "White-tailed": "White-tailed deer", "Mule": "Mule deer"}.get(x["deer_type"] or "", "")
            when = "Early" if "EARLY" in x["section"] else "Late" if "LATE" in x["section"] else ""
            return ", ".join(v for v in (when, t.lower() if when else t) if v)
        def law(x: dict) -> str:
            t = re.sub(r"\s+", " ", x["legal"]).strip(" ,-")
            t = re.sub(r"^3 pt\. min\.", ("Buck" if sp == "DEER" else "Bull") + ", 3 pt. min.", t)
            return t[:1].upper() + t[1:]
        seasons = sorted(seasons, key=lambda x: x["dates"][0][0])
        ts = [{"weapon": w, "sex": x["sex"], "dates": [{"open": o, "close": c} for o, c in x["dates"]], "notes": who(x)} for x in seasons]
        opens = [d["open"] for t in ts for d in t["dates"]]
        closes = [d["close"] for t in ts for d in t["dates"]]
        legal = " · ".join(dict.fromkeys(
            (f"{who(x)}: " if who(x) else "") + law(x)
            + " (" + ", ".join(span(o, c) for o, c in x["dates"]) + ")" for x in seasons))
        # Youth general days: a youth on the same general tag can also hunt these. They go in tagSeasons (marked youth,
        # so the shared Youth Hunts filter decides whether they count) and in the legal line, but not in the hunt's
        # dates or legal animal, which are what an adult gets.
        youth = sorted(youth_regs.get(key, []), key=lambda x: x["dates"][0][0])
        ts += [{"weapon": w, "sex": x["sex"], "dates": [{"open": o, "close": c} for o, c in x["dates"]],
                "notes": "Youth (under 16)" + (", " + who(x).lower() if who(x) else "")} for x in youth]
        if youth:
            legal += " · " + " · ".join(f"Youth only{', ' + who(x).lower() if who(x) else ''}: " + law(x)
                                        + " (" + ", ".join(span(o, c) for o, c in x["dates"]) + ")" for x in youth)
        datestr = " · ".join(dict.fromkeys(span(o, c) for x in seasons for o, c in x["dates"]))
        hunts.append({
            "id": f"WA:G{sp[0]}-{gmu}-{w}", "slug": f"wa-g{sp[0].lower()}-{gmu}-{w.lower()}", "state": "WA", "species": sp,
            "type": "GENERAL", "tagCode": tagc,
            "name": f"{units[gmu]['label']} ({gmu}) General {WNAME[w]} {sp.title()}", "areaName": f"GMU {gmu} {units[gmu]['label']}",
            "description": "General season", "huntCategory": "General", "units": [gmu], "weapon": w, "antlerClass": antler,
            "takeMethod": legal, "tagRequired": tagc, "notes": "",
            "elkSide": side if sp == "ELK" else None,
            "openDate": min(opens), "closeDate": max(closes), "tags": None, "privateOnly": False, "youthOnly": False,
            "oddsLastYear": None, "oddsYears": 0, **hv,
            "acres": lf["acres"] if lf else None, "publicPct": lf["publicPct"] if lf else None, "privatePct": lf["privatePct"] if lf else None,
            "oddsByPts": {"proj": {}, "last": {}},
            "tagSeasons": {"year": YEAR, "seasons": ts},
            "pointOdds": {"state": "WA", "kind": "otc", "year": YEAR, "projected": False, "pools": {}, "category": "General", "tag": tagc,
                          "side": side if sp == "ELK" else None, "legal": legal,
                          "dates": datestr,
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
