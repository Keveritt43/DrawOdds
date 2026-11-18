#!/usr/bin/env python3
"""Washington moose, bighorn sheep and mountain goat special permits (WA-3), for data/wa/hunts.json.

Called by scripts/wa_build_hunts.py (build()); run alone it prints the hunts and the drift check:
  python3 -I scripts/wa_build_msg.py [--check] [--merge]
  --check  the draw-weighting test; --merge  replace only the moose/sheep/goat rows in data/wa/hunts.json

Sources (data/wa/source/, saved in Claude in Chrome on 2026-11-17; docs/states/wa-onboarding.md §10):
  msg-regulation-2017-2026.json  WDFW Hunt Planner Regulation service (the pamphlet tables as data): every moose,
      goat and sheep permit 2017-2026 with its units, dates, permits and "<prior year> apps / avg points".
  msg-drawing-points-2018-2020.csv  WDFW per-point drawing tables 2018-2020 for every moose, goat and sheep
      category WDFW posted (no Conflict Goat, Juvenile Ram 2018-19 or disabled-hunter ewe file found).
  msg-harvest-2013-2025.json  WDFW special-permit harvest reports, moose/sheep/goat, 2013-2025.

The drawing is the deer and elk one (pamphlet pp. 17-19): a weighted lottery per category, (points + 1)² entries,
one pool for residents and nonresidents, up to 4 choices, groups of 2. scripts/wa_build_msg.py --check re-runs the
weighting test on these tables (P² best for moose, goat and sheep). Points reset when drawn. Once in a lifetime:
WDFW bars a hunter who has *harvested* (or failed to report) under Any Antlered Bull Moose, Goat or Any Ram from that
category again; drawing alone doesn't. Antlerless moose, ewe, juvenile ram and the youth/65+/disabled categories
may be drawn every year.

Odds: wa_build_hunts.py's method. Each 2026 hunt is chained back by category + name (WDFW renumbers: 2026 sheep
5001 Cleman Mountain was 5000 in 2025), the chain's 2020 point table (else 2019, 2018) seeds the point mix, and it is
rolled forward year by year through the applications and permits each pamphlet printed. Backtest (§10): rolling
beat last year's odds in every species group in 2019 and 2020.
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
YEAR, LAST = 2026, 2025
PROJ = YEAR + 1
HARVEST_YEARS = list(range(2021, 2026))
MAXP = 40

# WDFW HuntCategory (Regulation service) -> our category, as the pamphlet heads its tables
CATEGORY = {
    "Any Antlered Bull Moose Hunt": "Any Antlered Bull Moose", "Any Moose Hunt": "Any Antlered Bull Moose",
    "Antlerless Only Moose Hunt": "Antlerless Moose", "Youth Only - Antlerless Only Moose Hunt": "Moose - Youth",
    "65 And Over - Antlerless Only Moose Hunt": "Moose - 65 and Over",
    "Disabled Hunter - Antlerless Only Moose Hunt": "Moose - Hunters with Disabilities",
    "Master Hunter - Any Moose Hunt": "Moose - Master Hunter (2017)", "Mountain Goat Hunt": "Mountain Goat", "Conflict Reduction Mountain Goat Hunt": "Mountain Goat - Conflict Reduction",
    "Any Ram Bighorn Sheep Hunt": "Bighorn Sheep - Any Ram", "Adult Ewe Only Bighorn Sheep Hunt": "Bighorn Sheep - Adult Ewe",
    "Juvenile Ram Bighorn Sheep Hunt": "Bighorn Sheep - Juvenile Ram", "Youth Bighorn Sheep Hunt": "Bighorn Sheep - Youth",
    "Youth Only - Adult Ewe Only Bighorn Sheep Hunt": "Bighorn Sheep - Youth",
    "Youth Only - Juvenile Ram or Adult Ewe Bighorn Sheep Hunt": "Bighorn Sheep - Youth", "Youth": "Bighorn Sheep - Juvenile Ram",
    "Hunters with Disabilities - Adult Ewe Only Bighorn Sheep Hunt": "Bighorn Sheep - Hunters with Disabilities (Ewe)",
    "Hunters with Disabilities - Juvenile Ram Only Bighorn Sheep Hunt": "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)",
}
# 2018-2020 per-point file names -> category
PTS_CATEGORY = {
    "any antlered bull moose": "Any Antlered Bull Moose", "antlerless moose": "Antlerless Moose", "moose youth": "Moose - Youth",
    "moose 65 and over": "Moose - 65 and Over", "moose disabled": "Moose - Hunters with Disabilities",
    "mountain goat": "Mountain Goat", "goat": "Mountain Goat", "sheep any ram": "Bighorn Sheep - Any Ram",
    "sheep ewe": "Bighorn Sheep - Adult Ewe", "sheep juvenile ram only": "Bighorn Sheep - Juvenile Ram",
    "sheep youth": "Bighorn Sheep - Youth", "disabled hunter juvenile ram": "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)",
}
SPECIES = {"Moose": "MOOSE", "Mountain Goat": "GOAT", "Bighorn Sheep": "BIGHORN"}
ONCE = {"Any Antlered Bull Moose", "Mountain Goat", "Bighorn Sheep - Any Ram"}
YOUTH = {"Moose - Youth", "Bighorn Sheep - Youth"}
RESTRICTED = {"Moose - 65 and Over", "Moose - Hunters with Disabilities", "Bighorn Sheep - Hunters with Disabilities (Ewe)",
              "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)"}
# Share of unselected applications that come back, picked per group on 2019 and held on 2020 (§10): 1.0 everywhere
# except the sheep ewe / juvenile ram / youth / disabled group, where 0.7 scored best on 2019 (5.610 vs 5.625 ×10⁻³)
# and still beat last year's odds on 2020 (3.136 vs 3.382).
RETURN = {"Bighorn Sheep - Adult Ewe": 0.7, "Bighorn Sheep - Juvenile Ram": 0.7, "Bighorn Sheep - Youth": 0.7,
          "Bighorn Sheep - Hunters with Disabilities (Ewe)": 0.7, "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)": 0.7}
LABEL = {"Any Antlered Bull Moose": "Bull Moose", "Antlerless Moose": "Antlerless Moose", "Moose - Youth": "Youth Antlerless Moose",
         "Moose - 65 and Over": "65+ Antlerless Moose", "Moose - Hunters with Disabilities": "Hunters with Disabilities Antlerless Moose",
         "Mountain Goat": "Mountain Goat", "Bighorn Sheep - Any Ram": "Ram Bighorn Sheep", "Bighorn Sheep - Adult Ewe": "Ewe Bighorn Sheep",
         "Bighorn Sheep - Juvenile Ram": "Juvenile Ram Bighorn Sheep", "Bighorn Sheep - Youth": "Youth Ewe Bighorn Sheep",
         "Bighorn Sheep - Hunters with Disabilities (Ewe)": "Hunters with Disabilities Ewe Bighorn Sheep",
         "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)": "Hunters with Disabilities Juvenile Ram Bighorn Sheep"}
LEGAL = {"Any Antlered Bull Moose": ("Any antlered bull moose", "ANTLERED"), "Antlerless Moose": ("Antlerless moose", "ANTLERLESS"),
         "Moose - Youth": ("Antlerless moose", "ANTLERLESS"), "Moose - 65 and Over": ("Antlerless moose", "ANTLERLESS"),
         "Moose - Hunters with Disabilities": ("Antlerless moose", "ANTLERLESS"),
         "Mountain Goat": ("One adult goat of either sex, horns 4 in. or longer", "EITHER"),
         "Bighorn Sheep - Any Ram": ("Any bighorn ram", "ANTLERED"), "Bighorn Sheep - Adult Ewe": ("Adult ewe only", "ANTLERLESS"),
         "Bighorn Sheep - Juvenile Ram": ("Juvenile ram only", "ANTLERED"), "Bighorn Sheep - Youth": ("Adult ewe only", "ANTLERLESS"),
         "Bighorn Sheep - Hunters with Disabilities (Ewe)": ("Adult ewe only", "ANTLERLESS"),
         "Bighorn Sheep - Hunters with Disabilities (Juvenile Ram)": ("Juvenile ram only", "ANTLERED")}
NOTES = {"A": "Juvenile ram: at least one unbroomed horn not past a line from the horn base through the back of the eye.",
         "C": "Private lands; access is extremely limited. If you cannot secure access to private lands, do not apply.",
         "D": "Present the head of a harvested juvenile ram to WDFW within 10 days.",
         "E": "Hunters are asked to avoid harvesting collared animals."}
# Unit corrections, checked against the 2026 pamphlet table (the pamphlet governs): the Regulation service puts
# 8027 "Mt Spokane South D" in Moose Area 2; the pamphlet (p. 63) says Moose Area 1, as its name does.
UNIT_FIX = {(2026, 8027): ["MA1"]}
# Area wording the Regulation service drops (pamphlet p. 62): these two hunts are only part of GMU 124
AREA_NOTE = {8010: "GMU 124 west of Hwy 395", 8018: "GMU 124 west of Hwy 395"}
MON = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."]


def label(u: str) -> str:
    return (f"Moose Area {u[2:]} (within GMU 124)" if u.startswith("MA") else f"Sheep Unit {u[2:]}" if u.startswith("SH")
            else f"Mountain Goat Unit {u[2:]}" if u.startswith("MG") else f"GMU {u}")


def span(a: str, b: str) -> str:
    da, db = dt.date.fromisoformat(a), dt.date.fromisoformat(b)
    return f"{MON[da.month - 1]} {da.day}-{db.day}" if da.month == db.month else f"{MON[da.month - 1]} {da.day}-{MON[db.month - 1]} {db.day}"


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower().replace("–", "-"))


def unit_key(r: dict) -> str | None:
    t, txt = r["UnitType"], r["UnitNumberTypeText"] or ""
    if t == "GMU":
        m = re.search(r"(\d{3})", txt)
        return m.group(1) if m else None
    m = re.search(r"(\d+-\d+[a-z]?)" if t == "Mountain Goat Area" else r"(\d+)", txt)
    if not m:
        return None
    return {"Moose Area": "MA", "Bighorn Sheep Area": "SH", "Mountain Goat Area": "MG"}[t] + m.group(1)


def day(ms) -> str | None:
    # WDFW stores local midnight (07:00 or 08:00 UTC); shifting 7 h keeps the Pacific calendar date
    return dt.datetime.fromtimestamp(ms / 1000 - 7 * 3600, dt.timezone.utc).date().isoformat() if ms else None


def cutoff(dist, target):
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


def roll(dist, u, total, r=1.0):
    nxt = collections.Counter()
    for p, n in dist.items():
        nxt[p + 1] += r * n * (1 - u) ** (p * p)
    kept = sum(nxt.values())
    if total > kept:
        nxt[1] += total - kept
    elif kept:
        nxt = collections.Counter({p: v * total / kept for p, v in nxt.items()})
    return dict(nxt)


def odds_by_banked(u):
    out = []
    for b in range(MAXP + 1):
        v = 1 - (1 - u) ** ((b + 1) ** 2)
        out.append(max(round(v, 6), 1e-6) if v > 0 else 0.0)
    return out


def avg_drawn(dist, u):
    sel = {p: n * (1 - (1 - u) ** (p * p)) for p, n in dist.items()}
    t = sum(sel.values())
    return sum(p * v for p, v in sel.items()) / t if t else None


def load():
    reg = json.load(open(SRC / "msg-regulation-2017-2026.json"))["regulation"]
    hunts = {}   # (year, number) -> hunt
    for r in reg:
        if not r["PermitHuntNumber"] or r["Animal"] not in SPECIES:
            continue
        cat = CATEGORY.get(r["HuntCategory"] or "")
        if cat is None and r["LicenseYear"] == 2023 and "Ewe" in (r["LegalHarvest"] or ""):
            cat = "?2023"   # five 2023 ewe hunts have no category in the service: resolved below
        if cat is None:
            raise SystemExit(f"unknown category {r['LicenseYear']} {r['PermitHuntNumber']} {r['HuntCategory']}")
        k = (r["LicenseYear"], r["PermitHuntNumber"])
        h = hunts.setdefault(k, {"year": k[0], "choice": k[1], "name": r["PermitHuntName"].strip(), "category": cat,
                                 "species": SPECIES[r["Animal"]], "units": [], "dates": set(), "permits": r["PermitTotalIssued"],
                                 "prior": r["PermitAppsPerAvgPts"], "notes": set(), "legal": r["LegalHarvest"],
                                 "restriction": r["HunterRestriction"]})
        u = unit_key(r)
        if u and u not in h["units"]:
            h["units"].append(u)
        if r["StartDate"]:
            h["dates"].add((day(r["StartDate"]), day(r["EndDate"])))
        for n in re.findall(r"[A-Z]", r["Notes"] or ""):
            h["notes"].add(n)
    for k, us in UNIT_FIX.items():
        if k in hunts:
            hunts[k]["units"] = us
    for h in hunts.values():
        p = (h["prior"] or "").strip()
        m = re.match(r"^(\d+)\s*/\s*(\d+(?:\.\d+)?)$", p)
        h["prior_apps"], h["prior_avg"] = (int(m.group(1)), float(m.group(2))) if m else (None, None)
        h["is_new"] = p.upper() == "NEW"
    pts = collections.defaultdict(collections.Counter)
    sel = collections.defaultdict(collections.Counter)
    for r in csv.DictReader(open(SRC / "msg-drawing-points-2018-2020.csv")):
        k = (int(r["year"]), int(r["hunt"]))
        pts[k][int(r["point_total"])] += int(r["applications"])
        sel[k][int(r["point_total"])] += int(r["selected_applications"])
    H = json.load(open(SRC / "msg-harvest-2013-2025.json"))["pages"]
    harvest = {}
    for key, tabs in H.items():
        y = int(key[:4])
        for t in tabs:
            m = re.match(r"^(\d{4})\s*-\s*(.*?)(?:\s+-\s+(?:GMU|SHEEP UNIT|Sheep Unit|Mountain Goat Unit|MOOSE AREA|Moose Area|Goat Unit).*)?$", t["cap"])
            if not m or len(t["rows"]) < 2:
                continue
            d = dict(zip(t["rows"][0], t["rows"][1]))
            num = lambda s: float(s.replace(",", "").replace("%", "")) if s and s.replace(",", "").replace("%", "").replace(".", "").isdigit() else None
            harvest[(y, int(m.group(1)))] = {"name": m.group(2).strip(), "apps": num(d.get("Total Applicants")),
                                              "permits": num(d.get("Permits Issued")), "hunters": num(d.get("Hunters")),
                                              "harvest": num(d.get("Total Harvest")), "days": num(d.get("Hunter Days"))}
    # The five uncategorised 2023 ewe hunts: take the category of the 2022 hunt whose applications match what the
    # 2023 pamphlet prints as last year's (Cleman Mountain 1774 = 2022's youth hunt, 1777); otherwise adult ewe.
    for h in hunts.values():
        if h["category"] != "?2023":
            continue
        m = [x for x in hunts.values() if x["year"] == 2022 and x["species"] == "BIGHORN" and h["prior_apps"]
             and (harvest.get((2022, x["choice"])) or {}).get("apps")
             and abs(harvest[(2022, x["choice"])]["apps"] / h["prior_apps"] - 1) <= 0.03]
        h["category"] = m[0]["category"] if len(m) == 1 else "Bighorn Sheep - Adult Ewe"
    return hunts, pts, sel, harvest


def chain(hunts, h, harvest=None, for_harvest=False):
    """Year -> hunt, walking back in the same category. A predecessor is the unique hunt with the same name (and, for
    harvest, the same units). For the drawing only, when names changed, WDFW's own link is used: the hunt in year y-1
    whose own application count (harvest report) is within 3% of what year y's pamphlet prints as last year's
    applications (2021 renamed "Cleman Mountain A" to "Cleman Mountain"; 2026 moved the youth moose hunt from Moose
    Area 1 to 2 under the same number). Stops at NEW, a gap or an ambiguous match."""
    out = {h["year"]: h}
    cur = h
    for y in range(h["year"] - 1, 2016, -1):
        if cur["is_new"]:
            break
        same = [x for x in hunts.values() if x["year"] == y and x["category"] == cur["category"]]
        c = [x for x in same if norm(x["name"]) == norm(cur["name"])]
        if len(c) > 1 or for_harvest:
            c = [x for x in c if sorted(x["units"]) == sorted(cur["units"])]
        if len(c) != 1 and not for_harvest and harvest is not None and cur["prior_apps"]:
            c = [x for x in same if (harvest.get((y, x["choice"])) or {}).get("apps")
                 and abs(harvest[(y, x["choice"])]["apps"] / cur["prior_apps"] - 1) <= 0.03]
            if len(c) > 1:
                c = [x for x in c if sorted(x["units"]) == sorted(cur["units"])]
        if len(c) != 1:
            break
        cur = out[y] = c[0]
    return out


def model(hunts, pts, sel, h, ch):
    """Seed + roll. Returns (dist, u per year, seed info) or None."""
    demand = {}
    for y, x in ch.items():
        if x["prior_apps"] is not None and (y - 1) in ch:
            demand[y - 1] = (x["prior_apps"], ch[y - 1]["permits"], x["prior_avg"])
    seed = None
    for sy in (2020, 2019, 2018):
        if sy in ch and (sy, ch[sy]["choice"]) in pts:
            k = (sy, ch[sy]["choice"])
            seed = (sy, dict(pts[k]), sum(sel[k].values()))
            break
    kind = "own"
    if seed is None:
        # No table of its own (a hunt first held after 2020): its category's pooled 2020 mix, scaled to the hunt's
        # first published application count, as wa_build_hunts.py does for deer and elk (the category pool beat a
        # flat guess in scripts/wa_backtest_no_table.py). A category WDFW never tabled (disabled-hunter ewe) has none.
        pool = collections.Counter(); psel = 0
        for (yy, num), d in pts.items():
            x = hunts.get((yy, num))
            if yy == 2020 and x and x["category"] == h["category"]:
                pool.update(d); psel += sum(sel[(yy, num)].values())
        first = next((demand[y][0] for y in sorted(demand)), None)
        if not pool or not first:
            return None
        tot = sum(pool.values())
        seed = (2020, {p: n * first / tot for p, n in pool.items()}, psel * first / tot)
        kind = "category"
    sy, dist, s = seed
    u = cutoff(dist, s)
    r = RETURN.get(h["category"], 1.0)
    trail = []
    for y in range(sy + 1, LAST + 1):
        apps, permits, avg = demand.get(y, (None, None, None))
        if apps is None:
            apps = sum(dist.values())
        if permits is None:
            permits = (ch.get(y) or h)["permits"]
        dist = roll(dist, u, apps, r)
        u = cutoff(dist, permits)
        trail.append((y, apps, permits, u, avg_drawn(dist, u), avg))
    return {"seedYear": sy, "seed": kind, "dist": dist, "u": u, "r": r, "demand": demand, "trail": trail}


def build(known_units: set[str], land: dict):
    hunts, pts, sel, harvest = load()
    out, problems = [], []

    def land_for(us):
        recs = [land.get(u) for u in us]
        if not us or any(x is None for x in recs):
            return None
        acres = sum(x["acres"] for x in recs)
        w = lambda k: round(sum(x[k] * x["acres"] for x in recs) / acres, 1)
        return {"acres": acres, "publicPct": w("publicPct"), "privatePct": w("privatePct")}

    for (y, num), h in sorted(hunts.items()):
        if y != YEAR:
            continue
        hid = f"WA:{num}"
        us = [u for u in h["units"] if u in known_units]
        if not us or len(us) != len(h["units"]):
            problems.append(f"{hid} {h['name']}: unit missing {h['units']}")
            continue
        ch = chain(hunts, h, harvest)
        hch = chain(hunts, h, for_harvest=True)
        m = None if h["is_new"] else model(hunts, pts, sel, h, ch)
        # harvest: each chained year's hunt, by that year's number and name
        hv = {}
        for yy in HARVEST_YEARS:
            x = hch.get(yy)
            rec = harvest.get((yy, x["choice"])) if x else None
            if rec and norm(rec["name"]).startswith(norm(x["name"])[:12]) and rec["hunters"] is not None and rec["harvest"] is not None:
                hv[yy] = rec
        use = sorted(hv)
        hu = sum(hv[k]["hunters"] for k in use); ha = sum(hv[k]["harvest"] for k in use)
        days = [(hv[k]["days"], hv[k]["hunters"]) for k in use if hv[k].get("days")]
        hfields = {"success5": ha / hu if hu else None, "hunters5": hu or None, "harvest5": ha if hu else None,
                   "harvestYears": len([k for k in use if hv[k]["hunters"]]), "harvestLastYear": use[-1] if use else None,
                   "successLast": (hv[use[-1]]["harvest"] / hv[use[-1]]["hunters"]) if use and hv[use[-1]]["hunters"] else None,
                   "daysPerHunter5": (sum(d for d, _ in days) / sum(n for _, n in days)) if days else None,
                   "smallSample": hu < 10, "bigPct5": None}
        legal, antler = LEGAL[h["category"]]
        dates = sorted(h["dates"])
        lf = land_for(us)
        notes = sorted(h["notes"])
        demand = {}
        if m:
            demand = {str(k): {"apps": a, "permits": p} for k, (a, p, _) in sorted(m["demand"].items())}
        elif h["prior_apps"] is not None:
            demand = {str(YEAR - 1): {"apps": h["prior_apps"], "permits": (ch.get(YEAR - 1) or {}).get("permits")}}
        last = m["trail"][-1] if m and m["trail"] else None
        po = {"state": "WA", "kind": "squared", "year": LAST, "projected": bool(m), "projYear": PROJ, "estimated": True,
              "seed": m["seed"] if m else None, "seedYear": m["seedYear"] if m else None, "category": h["category"], "tag": "",
              "notes": ", ".join(notes), "noteText": [NOTES[n] for n in notes if n in NOTES],
              "dates": ", ".join(span(a, b) for a, b in dates), "legal": legal,
              "area": AREA_NOTE.get(num) or (("GMUs " + ", ".join(us)) if len(us) > 1 and all(u.isdigit() for u in us) else ", ".join(label(u) for u in us)),
              "onceInALifetime": h["category"] in ONCE,
              "pointsMeaning": "Points you hold in this category before applying. You draw with your points plus this year's, squared: "
                               "4 banked points = 5 = 25 entries.",
              "demand": demand,
              "harvest": [{"year": k, "hunters": hv[k]["hunters"], "harvest": hv[k]["harvest"], "apps": hv[k]["apps"], "permits": hv[k]["permits"]} for k in use],
              "harvestIdentityBasis": "WDFW annual hunt number and name in the same category; unmatched years excluded.",
              "restricted": h["category"] in RESTRICTED}
        odds = {"proj": {}, "last": {}}
        if m:
            r = m["r"]
            d26 = roll(m["dist"], m["u"], last[1], r)
            u26 = cutoff(d26, h["permits"] or 0)
            d27 = roll(d26, u26, last[1], r)
            u27 = cutoff(d27, h["permits"] or 0)
            po["cutoff"] = {"last": m["u"], "y2026": u26, "proj": u27}
            odds = {"proj": {"res": odds_by_banked(u27), "nr": odds_by_banked(u27)}, "last": {"res": odds_by_banked(m["u"]), "nr": odds_by_banked(m["u"])}}
        elif h["is_new"]:
            po["oddsUnavailableReason"] = "New hunt for 2026: no drawing yet, so no applications to estimate odds from."
        else:
            po["oddsUnavailableReason"] = "WDFW has never published this category's results by point level, so no odds at your points."
            po["noPointData"] = True
        out.append({
            "id": hid, "slug": f"wa-{num}", "state": "WA", "species": h["species"], "type": "CONTROLLED", "tagCode": str(num),
            "name": f"{h['name']} {LABEL[h['category']]}", "areaName": po["area"], "description": h["category"],
            "huntCategory": h["category"], "units": us, "weapon": "ANY", "antlerClass": antler, "takeMethod": legal,
            "tagRequired": "", "notes": ", ".join(notes),
            "openDate": dates[0][0] if dates else None, "closeDate": dates[-1][1] if dates else None,
            "tags": h["permits"], "privateOnly": False, "youthOnly": h["category"] in YOUTH, "restricted": h["category"] in RESTRICTED,
            "oddsLastYear": LAST if last else None, "oddsYears": len(m["demand"]) if m else (1 if demand else 0),
            "appsLast": last[1] if last else h["prior_apps"], "permitsLast": last[2] if last else (ch.get(YEAR - 1) or {}).get("permits"),
            "resOddsLast": (last[2] / last[1]) if last and last[1] else None, "nrOddsLast": (last[2] / last[1]) if last and last[1] else None,
            "resAppsLast": None, "nrAppsLast": None, **hfields,
            "acres": lf["acres"] if lf else None, "publicPct": lf["publicPct"] if lf else None, "privatePct": lf["privatePct"] if lf else None,
            "oddsByPts": odds,
            "tagSeasons": {"year": YEAR, "seasons": [{"weapon": "ANY", "sex": legal, "dates": [{"open": a, "close": b} for a, b in dates],
                                                      "notes": ", ".join(notes)}]},
            "pointOdds": po,
        })
    return out, problems


def check_weights():
    import math
    g = collections.defaultdict(dict)
    for r in csv.DictReader(open(SRC / "msg-drawing-points-2018-2020.csv")):
        k = (int(r["year"]), r["category"], int(r["hunt"]))
        a = g[k].get(int(r["point_total"]), (0, 0))
        g[k][int(r["point_total"])] = (a[0] + int(r["applications"]), a[1] + int(r["selected_applications"]))
    W = {"P²": lambda p: p * p, "P²+1": lambda p: p * p + 1, "(P+1)²": lambda p: (p + 1) ** 2, "P": lambda p: p, "P³": lambda p: p ** 3, "flat": lambda p: 1}
    for sp in ("moose", "goat", "sheep"):
        res = {}
        for name, w in W.items():
            ll = 0.0
            for k, d in g.items():
                if sp not in k[1] and not (sp == "sheep" and "ram" in k[1]):
                    continue
                t = sum(s for _, s in d.values())
                if not t:
                    continue
                lo, hi = 0.0, 1.0
                for _ in range(80):
                    u = (lo + hi) / 2
                    e = sum(n * (1 - (1 - u) ** w(p)) for p, (n, s) in d.items())
                    lo, hi = (u, hi) if e < t else (lo, u)
                for p, (n, s) in d.items():
                    q = min(max(1 - (1 - u) ** w(p), 1e-12), 1 - 1e-12)
                    ll += s * math.log(q) + (n - s) * math.log(1 - q)
            res[name] = round(ll, 1)
        print(sp, res)


def merge(hs: list[dict]) -> None:
    """Replace only the moose/sheep/goat rows of data/wa/hunts.json, leaving every deer and elk row as it is."""
    f = ROOT / "data" / "wa" / "hunts.json"
    cur = json.loads(f.read_text())
    for h in hs:
        sq = h["acres"] / 640 if h.get("acres") else None
        h["huntersSqMi"] = (h["hunters5"] / h["harvestYears"] / sq) if h.get("hunters5") and sq and h.get("harvestYears") else None
    cur["hunts"] = [h for h in cur["hunts"] if h["species"] not in ("MOOSE", "BIGHORN", "GOAT")] + hs
    f.write_text(json.dumps(cur, separators=(",", ":")) + "\n")
    print(f"merged {len(hs)} moose/sheep/goat hunts into {f.name} ({len(cur['hunts'])} hunts)")


if __name__ == "__main__":
    units = {u["name"] for u in json.load(open(ROOT / "data" / "wa" / "units.json"))["units"]}
    land = json.load(open(ROOT / "data" / "wa" / "land.json"))["units"]
    if "--check" in sys.argv:
        check_weights()
    hs, probs = build(units, land)
    if "--merge" in sys.argv:
        if probs:
            raise SystemExit(f"problems: {probs}")
        merge(hs)
    for h in hs:
        po = h["pointOdds"]
        o = h["oddsByPts"]["proj"].get("res")
        print(f"{h['id']:8} {h['name'][:46]:46} {h['tags']:>3} apps {h['appsLast']!s:>6} seed {po.get('seedYear')} "
              f"odds@0 {o[0] if o else '-':<9} @20 {o[20] if o else '-':<9} succ {h['success5'] and round(h['success5'], 2)} n {h['hunters5']} "
              f"pub {h['publicPct']}")
    print("problems", probs)
    # drift: the model's average points of drawn applications vs WDFW's printed average, by year
    hunts, pts, sel, harvest = load()
    err = collections.defaultdict(list); noise = collections.defaultdict(list)
    for (y, num), h in hunts.items():
        if y != YEAR:
            continue
        mm = model(hunts, pts, sel, h, chain(hunts, h, harvest))
        for (yy, apps, permits, u, avg, pub) in (mm["trail"] if mm else []):
            if avg is not None and pub is not None:
                err[yy].append(avg - pub)
                # what a perfect model would still miss: the drawn average of `permits` random winners
                noise[yy].append((permits or 1, avg))
    # expected |error| from the luck of the draw alone, from each year's modelled winner-point spread (rolled again
    # to get the distribution); a perfect model would show about this much
    for yy in sorted(err):
        e = err[yy]
        print(f"drift {yy}: hunts {len(e)} mean {sum(e) / len(e):+.2f} mean|e| {sum(abs(x) for x in e) / len(e):.2f}")
    exp = collections.defaultdict(list)
    for (y, num), h in hunts.items():
        if y != YEAR:
            continue
        mm = model(hunts, pts, sel, h, chain(hunts, h, harvest))
        if not mm or mm["seed"] != "own":
            continue
        # replay to get each year's distribution
        sy = mm["seedYear"]; ch = chain(hunts, h, harvest)
        dist = dict(pts[(sy, ch[sy]["choice"])]); u = cutoff(dist, sum(sel[(sy, ch[sy]["choice"])].values()))
        for (yy, apps, permits, _, _, pub) in mm["trail"]:
            dist = roll(dist, u, apps, mm["r"]); u = cutoff(dist, permits)
            if pub is None:
                continue
            w = {p: n * (1 - (1 - u) ** (p * p)) for p, n in dist.items()}; t = sum(w.values())
            if not t:
                continue
            mu = sum(p * v for p, v in w.items()) / t
            sd = (sum((p - mu) ** 2 * v for p, v in w.items()) / t) ** 0.5
            exp[yy].append(sd / max(permits, 1) ** 0.5 * (2 / 3.14159) ** 0.5)
    for yy in sorted(exp):
        print(f"  luck alone {yy}: expected mean|e| {sum(exp[yy]) / len(exp[yy]):.2f}")
