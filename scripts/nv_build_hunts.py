"""
Nevada deer and elk: NDOW sources -> data/nv/hunts.json, data/nv/units.json, data/nv/land.json.

    python3 -I scripts/nv_build_hunts.py

Input: data/nv/source/ndow-bundle-2026-11-17.json.gz, fetched in Claude in Chrome from ndow.org on Nov 17, 2026
(scripts/nv_fetch_sources.browser.js):
  BP    NDOW "Bonus Point and Application Choice Trends" reports, deer and elk, 2022-2025 draws (62 PDFs, 2,617 hunt
        tables; every table's columns sum to NDOW's printed Total row).
  RAW   PDF text items [str, x, y] per page: CR 26-11 (2026 quotas), 2022-2024 Big Game Hunt Statistics (harvest by hunt),
        2026 application FAQ.
  XL    2025 Nevada Big Game Hunt Data.xlsx (NDOW's hunt statistics for 2025).
  UNITS NDOW_Hunt_Units FeatureServer (129 polygons, EPSG:4326).
  LAND  100 m centre-sampled cell counts per hunt unit by BLM SMA agency (BLM_Natl_SMA_LimitedScale ADMIN_ST='NV',
        both layers in EPSG:5070), computed in the browser by the same scanline rule as scripts/mt_build_land.py.

Draw rule (verified on 2,061 hunts, docs/states/nv-onboarding.md): each applicant gets bonus_points² + 1 random
numbers and keeps the lowest; first choices are filled before any second choice. So a first-choice applicant with P
points draws with probability 1 - (1 - c)^(P² + 1), one cut c per hunt and pool.
"""
import collections
import gzip
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "data" / "nv"
SRC = D / "source" / "ndow-bundle-2026-11-17.json.gz"
LAST = 2025          # last draw NDOW has published by point level
REGS = 2026          # quotas and seasons (CR 26-11, CR 25-07)
MAXP = 30

# 2026 hunt numbers in scope: (res hunt, nr hunt or None) -> category
CATS = [
    # key, species, antler, take, weapon, res, nr, BP title stem, BP weapon, harvest hunt, harvest weapon, youth
    ("deer-alw", "DEER", "ANTLERED", "Antlered", "ANY", "1331", "1332", "Mule Deer Antlered", "Any Legal Weapon", "Mule Deer Antlered", "ALW", False),
    ("deer-arch", "DEER", "ANTLERED", "Antlered", "ARCHERY", "1341", "1342", "Mule Deer Antlered", "Archery", "Mule Deer Antlered", "AR", False),
    ("deer-muzz", "DEER", "ANTLERED", "Antlered", "MUZZLELOADER", "1371", "1372", "Mule Deer Antlered", "Muzzleloader", "Mule Deer Antlered", "M", False),
    ("deer-jr-alw", "DEER", "ANTLERED", "Junior antlered", "ANY", "1106", None, "Mule Deer Junior Antlered", "Any Legal Weapon", "Mule Deer Junior", None, True),
    ("deer-jr-classic", "DEER", "ANTLERED", "Junior antlered (archery, muzzleloader or any legal weapon seasons)", "ANY", "1107", None, "Mule Deer Junior Antlered", "Classic", "Mule Deer Junior", None, True),
    ("deer-jr-prim", "DEER", "ANTLERED", "Junior antlered (archery or muzzleloader seasons)", "MUZZLELOADER", "1105", None, "Mule Deer Junior Antlered", "Primitive", "Mule Deer Junior", None, True),
    ("elk-bull-alw", "ELK", "ANTLERED", "Antlered", "ANY", "4151", "4251", "Elk Antlered", "Any Legal Weapon", "Elk Antlered", "ALW", False),
    ("elk-bull-muzz", "ELK", "ANTLERED", "Antlered", "MUZZLELOADER", "4156", "4256", "Elk Antlered", "Muzzleloader", "Elk Antlered", "M", False),
    ("elk-bull-arch", "ELK", "ANTLERED", "Antlered", "ARCHERY", "4161", "4261", "Elk Antlered", "Archery", "Elk Antlered", "AR", False),
    ("elk-spike", "ELK", "ANTLERED", "Spike", "ANY", "4651", None, "Elk Spike", "Any Legal Weapon", "Elk Spike", "ALW", False),
    ("elk-cow-alw", "ELK", "ANTLERLESS", "Antlerless", "ANY", "4181", "4281", "Elk Antlerless", "Any Legal Weapon", "Elk Antlerless", "ALW", False),
    ("elk-cow-muzz", "ELK", "ANTLERLESS", "Antlerless", "MUZZLELOADER", "4176", "4276", "Elk Antlerless", "Muzzleloader", "Elk Antlerless", "M", False),
    ("elk-cow-arch", "ELK", "ANTLERLESS", "Antlerless", "ARCHERY", "4111", "4211", "Elk Antlerless", "Archery", "Elk Antlerless", "AR", False),
]
OMITTED = [
    "Elk depredation hunts 4102 and 4107: agricultural-land and ranch boundaries (NDOW hunt-unit-boundaries page), not hunt units",
    "Nonresident guided mule deer (CR 25-10, its own regulation and bonus-point category): next pass",
    "Landowner compensation, incentive, private-lands, PIW, Heritage, Dream and Silver State tags: not drawn on bonus points in the main draw",
    "The one 'Shotgun or Bow Only' deer hunt per pool: not in CR 26-11's deer sections",
]
MONTHS = {m: i + 1 for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}

def lines(pg, tol=2):
    rows = {}
    for s, x, y in pg:
        k = next((k for k in rows if abs(k - y) <= tol), y)
        rows.setdefault(k, []).append((x, s))
    return [" ".join(s for _, s in sorted(v)) for _, v in sorted(rows.items(), key=lambda t: -t[0])]

def md(s):
    """'Oct 05' / 'Sept 7' -> (month, day)"""
    m = re.match(r"([A-Z][a-z]{2})[a-z]*\.?\s+(\d{1,2})", s.strip())
    return (MONTHS[m.group(1)], int(m.group(2))) if m else None

def dates_in(text):
    return [md(x) for x in re.findall(r"[A-Z][a-z]{2,4}\.?\s+\d{1,2}", text) if md(x)]

def iso(year, mdv, open_md=None):
    y = year + 1 if open_md and mdv < open_md and mdv[0] <= 3 else year
    return f"{y}-{mdv[0]:02d}-{mdv[1]:02d}"

def expand(group, known):
    out = []
    # "104, 121, North portion of 108 (see CR 25-07)", "203 *": the portion counts as its unit; footnote marks go
    group = re.sub(r"\(.*?\)", "", group.replace("–", "-")).replace("*", "")
    group = re.sub(r"(North|South|East|West)\s+portion\s+of\s+", "", group, flags=re.I)
    for part in re.split(r",", group):
        part = part.strip()
        m = re.match(r"^(\d{3})\s*-\s*(\d{3})$", part)
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            out += [u for u in known if u.isdigit() and a <= int(u) <= b]
        elif re.match(r"^\d{3}$", part):
            out.append(part)
        elif part:
            return None
    return sorted(set(out))

def fit_cut(levels):
    """levels [(P, apps, drew)] -> c, the per-number cut at which the expected first-choice draws under P²+1 numbers
    equal the number NDOW printed (so the table reproduces the 2025 draw exactly in total)."""
    S = sum(d for _, _, d in levels)
    A = sum(a for _, a, _ in levels)
    if A == 0:
        return None
    if S == 0:
        return 0.0
    if S >= A:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(100):
        m = (lo + hi) / 2
        if sum(a * (1 - (1 - m) ** (p * p + 1)) for p, a, _ in levels) < S: lo = m
        else: hi = m
    return (lo + hi) / 2

def table(c):
    return [round(1 - (1 - c) ** (p * p + 1), 6) for p in range(MAXP + 1)]

def main():
    b = json.load(gzip.open(SRC))
    problems = []
    known = sorted(f["properties"]["display_name"] for f in b["UNITS"]["features"] if re.match(r"^\d{3}$", f["properties"]["display_name"]))

    # ---------------- bonus point tables
    bp = collections.defaultdict(list)   # (year, pool, title stem, weapon) -> hunts
    for f in b["BP"]:
        yr = int(re.findall(r"20\d\d", f["file"].split("/")[-1])[-1])
        for h in f["hunts"]:
            t = h["title"].replace(" Application", "")
            pool = "nr" if t.startswith("NR ") else "res"
            stem = re.sub(r"^(Res|NR)\s+", "", t)
            units = expand(h["units"], known)
            s = h["season"]
            dd = dates_in(s)
            lv = [(r[0], r[6], r[1]) for r in h["rows"]]
            bp[(yr, pool, stem, h["weapon"].strip())].append({"units": units, "season": s, "start": dd[0] if dd else None,
                                                             "quota": int(str(h["quota"]).replace(",", "")) if str(h["quota"]).replace(",", "").isdigit() else None, "levels": lv})

    # ---------------- 2026 quotas (CR 26-11)
    L = [l.replace("–", "-").strip() for p in b["RAW"]["quota_2026"]["pages"] for l in lines(p)]
    secs, cur, title, mark = {}, None, None, None
    UNIT = r"\d{3}(?:\s*[-,]\s*\d{3})*"
    for i, l in enumerate(L):
        m = re.match(r"^(.*?)\s*(?:Hunt\s+)?(?:Resident\s+)?(\d{4})$", l)
        if m and not re.match(r"^\d{3}", l) and ("Hunt" in l or "Archery" in l or "Muzzle" in l):
            cur = {"hunt": m.group(2), "title": L[i - 1] if not L[i - 1].startswith("CR 26") else title, "rows": []}
            secs[m.group(2)] = cur; title = cur["title"]; continue
        if re.match(r"^(Resident|Nonresident)", l): title = l; continue
        if cur is None: continue
        if re.match(r"^[A-D](\s*[A-D†*])*\s*$", l): mark = l.split()[0]; continue
        m = re.match(r"^(" + UNIT + r")\s*(.*?)\s+(\d[\d,]*)$", l)
        if m and not re.match(r"^TOTA", l, re.I):
            rest = m.group(2)
            # junior seasons: weapon segments on the lines around the row
            seg = [x for x in (L[i - 1], l, L[i + 1] if i + 1 < len(L) else "") if re.search(r"\b(Arch|Muzz|ALW)\s*-", x)] if cur["hunt"] in ("1105", "1107") else []
            cur["rows"].append({"group": m.group(1), "rest": rest, "quota": int(m.group(3).replace(",", "")), "mark": mark, "segments": seg})
            mark = None; continue
        if re.match(r"^TOTA", l, re.I):
            cur["total"] = int(l.split()[-1].replace(",", ""))
    for c in CATS:
        for hn in (c[5], c[6]):
            if hn and hn not in secs: problems.append(f"CR 26-11 section {hn} not found")
            elif hn and secs[hn].get("total") and sum(r["quota"] for r in secs[hn]["rows"]) != secs[hn]["total"] and hn not in ("1342",):
                problems.append(f"CR 26-11 {hn}: rows sum {sum(r['quota'] for r in secs[hn]['rows'])} != printed total {secs[hn]['total']}")

    # ---------------- harvest by hunt 2022-2025 (NDOW Big Game Hunt Statistics)
    harvest = parse_harvest(b)

    # ---------------- units and land
    land, units_out = build_units(b, problems)

    out, unmatched = [], []
    for (key, sp, antler, take, weapon, rh, nh, stem, bpw, hname, hweap, youth) in CATS:
        res_rows = secs[rh]["rows"]; nr_rows = secs[nh]["rows"] if nh else []
        # one site hunt per unit group + season: the resident row, with its nonresident twin when NDOW has one
        def season_of(r):
            txt = " ".join(r["segments"]) if r["segments"] else r["rest"]
            dd = dates_in(txt)
            label = re.match(r"^(Early|Mid|Late|1st|2nd|3rd)\b", r["rest"])
            return dd, label.group(1) if label else None
        nr_left = list(nr_rows)
        groups = collections.Counter(r["group"] for r in res_rows)
        seen = collections.Counter()
        for r in res_rows:
            dd, label = season_of(r)
            if len(dd) < 2:
                problems.append(f"{rh} {r['group']}: no season dates in '{r['rest']}'"); continue
            units = expand(r["group"], known)
            if not units:
                problems.append(f"{rh} {r['group']}: units not understood"); continue
            twin = None
            for n in nr_left:
                if expand(n["group"], known) == units and season_of(n)[0][:1] == dd[:1]:
                    twin = n; break
            if twin: nr_left.remove(twin)
            seen[r["group"]] += 1
            open_md, close_md = dd[0], dd[-1]   # NDOW prints open - close; junior seasons run Arch, Muzz, ALW in order
            opn, cls = iso(REGS, open_md), iso(REGS, close_md, open_md)
            # 2025 tables for this unit group and season
            def match(pool):
                cand = [h for h in bp[(LAST, pool, stem, bpw)] if h["units"] == units]
                if not cand: return None
                return min(cand, key=lambda h: abs((h["start"][0] * 31 + h["start"][1]) - (open_md[0] * 31 + open_md[1])) if h["start"] else 999)
            pools = {}
            for pool, row in (("res", r), ("nr", twin)):
                if pool == "nr" and not twin: continue
                h = match(pool)
                if h is None:
                    unmatched.append(f"{key} {pool} {r['group']} {r['rest'][:30]}"); pools[pool] = {"quota": row["quota"], "levels": None}; continue
                c = fit_cut(h["levels"])
                hist = {}
                for y in range(2022, LAST + 1):
                    hy = [x for x in bp[(y, pool, stem, bpw)] if x["units"] == units]
                    if hy:
                        hb = min(hy, key=lambda x: abs((x["start"][0] * 31 + x["start"][1]) - (open_md[0] * 31 + open_md[1])) if x["start"] else 999)
                        hist[str(y)] = {"apps": sum(a for _, a, _ in hb["levels"]), "drew": sum(d for _, _, d in hb["levels"])}
                pools[pool] = {"quota": row["quota"], "quotaLast": h["quota"], "levels": [list(l) for l in h["levels"]], "cut": c,
                               "table": table(c) if c is not None else None, "history": hist}
            suffix = "" if groups[r["group"]] == 1 else f"-{(label or str(seen[r['group']])).lower()}"
            gid = re.sub(r"[^0-9]+", "-", r["group"]).strip("-")
            hid = f"NV:{rh}-{gid}{suffix}"
            hv = harvest_for(harvest, hname, hweap, units, open_md, bool(twin))
            ln = land_for(land, units)
            tags = r["quota"] + (twin["quota"] if twin else 0)
            res = pools.get("res"); nr = pools.get("nr")
            odds_last = lambda p: (sum(l[2] for l in p["levels"]) / sum(l[1] for l in p["levels"])) if p and p.get("levels") and sum(l[1] for l in p["levels"]) else None
            apps = lambda p: sum(l[1] for l in p["levels"]) if p and p.get("levels") else None
            last = {k: v["table"] for k, v in pools.items() if v.get("table")}
            name_units = r["group"].replace(" - ", "–")
            sp_word = "Mule Deer" if sp == "DEER" else "Elk"
            wtxt = {"ANY": "Any Legal Weapon", "ARCHERY": "Archery", "MUZZLELOADER": "Muzzleloader"}[weapon]
            if key == "deer-jr-classic": wtxt = "Archery, Muzzleloader or Any Legal Weapon"
            if key == "deer-jr-prim": wtxt = "Archery or Muzzleloader"
            label_txt = f" ({label})" if label else ""
            rec = {
                "id": hid, "slug": hid.lower().replace(":", "-"), "state": "NV", "species": sp, "type": "CONTROLLED",
                "tagCode": rh + (f"/{nh}" if twin else ""), "name": f"Units {name_units} {('Junior ' if youth else '')}{take.split(' (')[0].replace('Junior a', 'A')} {sp_word}{label_txt} · {wtxt}",
                "areaName": f"Units {name_units}", "description": f"{take} {sp_word.lower()}, {wtxt.lower()}",
                "huntCategory": key, "units": units, "weapon": weapon, "antlerClass": antler, "takeMethod": take,
                "openDate": opn, "closeDate": cls, "tags": tags, "privateOnly": False, "youthOnly": youth,
                "oddsLastYear": LAST if last else None, "oddsYears": len((res or {}).get("history") or {}),
                "resOddsLast": odds_last(res), "nrOddsLast": odds_last(nr) if twin else None,
                "resAppsLast": apps(res), "nrAppsLast": apps(nr) if twin else None,
                "appsLast": (apps(res) or 0) + (apps(nr) or 0) if (apps(res) or apps(nr)) else None,
                "permitsLast": ((res or {}).get("quotaLast") or 0) + ((nr or {}).get("quotaLast") or 0) or None,
                "nrPermitsLast": (nr or {}).get("quotaLast"),
                **hv, **(ln or {"acres": None, "publicPct": None, "privatePct": None, "huntablePct": None}),
                "oddsByPts": {"proj": {}, "last": last},
                "pointOdds": {"state": "NV", "kind": "bonus", "year": LAST, "projected": False, "regsYear": REGS, "category": key,
                              "pointsMeaning": "Bonus points held when applying (NDOW's tables). Each application gets points² + 1 random draw numbers and keeps the lowest.",
                              "residentsOnly": not twin,
                              "pools": {k: {"quota": v["quota"], "quotaLast": v.get("quotaLast"), "levels": v.get("levels"), "history": v.get("history")} for k, v in pools.items()},
                              "season": (" / ".join(r["segments"]) if r["segments"] else r["rest"]).strip(),
                              "harvest": hv.pop("_rows", None) if "_rows" in hv else None},
                "tagSeasons": {"year": REGS, "seasons": [{"weapon": weapon, "sex": take, "dates": [{"open": opn, "close": cls}], "notes": label or ""}]},
            }
            rec["pointOdds"]["harvest"] = rec.pop("_rows", None)
            hu = rec.get("hunters5"); sq = rec["acres"] / 640 if rec.get("acres") else None
            rec["huntersSqMi"] = (hu / rec["harvestYears"] / sq) if hu and sq and rec.get("harvestYears") else None
            out.append(rec)
        for n in nr_left:
            problems.append(f"{nh} {n['group']} {n['rest']}: nonresident row with no resident twin")
    ids = [h["id"] for h in out]
    if len(ids) != len(set(ids)):
        problems.append("duplicate ids: " + ", ".join(k for k, v in collections.Counter(ids).items() if v > 1))
    (D / "hunts.json").write_text(json.dumps({"generated": date.today().isoformat(), "drawYear": LAST, "regsYear": REGS,
                                              "problems": problems, "unmatched": unmatched, "omitted": OMITTED, "hunts": out}, separators=(",", ":")) + "\n")
    (D / "units.json").write_text(json.dumps({"source": "NDOW_Hunt_Units FeatureServer (services.arcgis.com/RyxlXSfFi87rAosq), fetched 2026-11-17; land from BLM SMA (data/nv/land.json)",
                                              "units": units_out}, separators=(",", ":")) + "\n")
    by = collections.Counter(h["huntCategory"] for h in out)
    print(f"wrote {len(out)} hunts; problems {len(problems)}; unmatched {len(unmatched)}")
    for p in problems[:20]: print("  problem:", p)
    for u in unmatched[:20]: print("  unmatched:", u)
    for k, v in by.items(): print(" ", k, v)

def parse_harvest(b):
    NUMS = {"Clients": "demand", "Choices": "apps", "Demand": "demand", "Apps": "apps", "Quota": "quota", "Issued": "tags", "Afield": "afield",
            "Hunters": "successful", "Rate": "drawRate", "Rate2": "surveyRate", "Success": "successPct", "Greater": "ptsGreater",
            "Greater2": "lenGreater", "Days": "huntDays", "Days2": "effortDays", "Satisfaction": "satisfaction", "Unique": None, "Total": None}
    out = []
    for k, v in b["RAW"].items():
        if not k.startswith("harv_") or k.endswith("2025"):
            continue
        yr = int(k[-4:])
        for pg in v["pages"]:
            rows = {}
            for s, x, y in pg: rows.setdefault(y, []).append((x, s))
            anc = txt = None
            for y in sorted(rows, reverse=True):
                it = sorted(rows[y]); words = [s for _, s in it]
                if "Issued" in words and "Afield" in words:
                    anc, seen = [], set()
                    for x, s in it:
                        kk = s if s not in seen else s + "2"; seen.add(s); anc.append((x, kk))
                    continue
                if "Residency" in words and "Weapon" in words:
                    txt = {s: x for x, s in it}
                    if "Apps" in txt and anc is not None and not any(kk == "Apps" for _, kk in anc): anc.append((txt["Apps"], "Apps"))
                    continue
                if not anc or not txt: continue
                hasyr = "year" in txt
                if hasyr and it[0][1] != str(yr): continue
                if not hasyr and not (it[0][0] < txt["Residency"] - 8 and any(re.match(r"^[\d,]+$", s) for _, s in it)): continue
                rec = {"year": yr}
                parts = collections.defaultdict(list)
                first = min(x for x, _ in anc) - 14
                for x, s in (it[1:] if hasyr else it):
                    if x < txt["Residency"] - 8: parts["hunt"].append(s)
                    elif x < txt["Species"] - 6: parts["res"].append(s)
                    elif x < txt["Weapon"] - 6: parts["species"].append(s)
                    elif x < txt["Unit Group"] - 12: parts["weapon"].append(s)
                    elif x < txt["Season"] - 14: parts["units"].append(s)
                    elif x < first and not re.match(r"^[\d,.%]+$", s): parts["season"].append(s)
                    else:
                        f = NUMS.get(min(anc, key=lambda a: abs(a[0] + 8 - x))[1])
                        if f:
                            s2 = s.replace(",", "")
                            rec[f] = float(s2[:-1]) / 100 if s2.endswith("%") else float(s2)
                for kk, vv in parts.items(): rec[kk] = " ".join(vv)
                out.append(rec)
    X = b["XL"]["2025 Hunt Summary"]; hd = X[0]
    m = {"Hunt": "hunt", "Residency": "res", "Species": "species", "Weapon": "weapon", "Unit Group": "units", "Season": "season",
         "Demand": "demand", "Unique\r\nApps": "apps", "2025\r\nQuota": "quota", "Tags\r\nIssued": "tags", "Hunters\r\nAfield": "afield",
         "Successful\r\nHunters": "successful", "Points or\r\nGreater": "ptsGreater", "Length or\r\nGreater": "lenGreater", "Hunt\r\nDays": "huntDays"}
    for r in X[1:]:
        rec = {"year": 2025}
        for i, h in enumerate(hd):
            if h in m and i < len(r) and r[i] not in (None, ""): rec[m[h]] = r[i]
        out.append(rec)
    for r in out:
        r["res"] = "nr" if str(r.get("res", "")).upper().startswith("N") else "res"
    return out

def harvest_for(H, hname, hweap, units, open_md, has_nr):
    """Both pools hunt the same season, so their hunters and harvest add up. Pooled over 2022-2025 surveyed seasons."""
    yrs = {}
    for r in H:
        if r.get("hunt") != hname or (hweap and r.get("weapon") != hweap): continue
        if (r["res"] == "nr") and not has_nr: continue
        ex = expand(str(r.get("units", "")), [f"{i:03d}" for i in range(1, 300)])
        if ex is None or set(ex) != set(units): continue
        dd = dates_in(str(r.get("season", "")))
        if not dd or abs((dd[0][0] * 31 + dd[0][1]) - (open_md[0] * 31 + open_md[1])) > 12: continue
        y = yrs.setdefault(r["year"], {"hunters": 0, "harvest": 0, "big": 0.0, "bigN": 0, "days": 0.0})
        af = r.get("afield") or 0; su = r.get("successful") or 0
        y["hunters"] += af; y["harvest"] += su
        if r.get("ptsGreater") is not None and su: y["big"] += r["ptsGreater"] * su; y["bigN"] += su
        if r.get("huntDays") and af: y["days"] += r["huntDays"] * af
    use = [y for y in sorted(yrs) if yrs[y]["hunters"] > 0]
    if not use:
        return {"success5": None, "hunters5": None, "harvest5": None, "harvestYears": 0, "harvestLastYear": None, "successLast": None,
                "daysPerHunter5": None, "smallSample": True, "bigPct5": None, "_rows": []}
    hu = sum(yrs[y]["hunters"] for y in use); hv = sum(yrs[y]["harvest"] for y in use)
    bn = sum(yrs[y]["bigN"] for y in use); bg = sum(yrs[y]["big"] for y in use)
    return {"success5": hv / hu, "hunters5": hu, "harvest5": hv, "harvestYears": len(use), "harvestLastYear": use[-1],
            "successLast": yrs[use[-1]]["harvest"] / yrs[use[-1]]["hunters"],
            "daysPerHunter5": sum(yrs[y]["days"] for y in use) / hu if hu else None, "smallSample": hu < 30,
            "bigPct5": (bg / bn) if bn >= 10 else None,
            "_rows": [{"year": y, "hunters": yrs[y]["hunters"], "harvest": yrs[y]["harvest"]} for y in use]}

AGENCY = {"BLM": "BLM", "USFS": "USFS", "NPS": "NPS", "FWS": "FWS", "USBR": "BOR", "DOD": "DOD", "DOE": "OTHER",
          "ST": "STATE", "PVT": "PRIVATE", "BIA": "TRIBAL", "UND": "UNDETERMINED",
          "ARMY": "DOD", "OTHFE": "OTHER", "FAA": "OTHER", "LG": "LOCAL"}
PUBLIC = {"BLM", "USFS", "NPS", "FWS", "BOR", "DOD", "OTHER", "STATE", "LOCAL"}
CLOSED_CODES = {"DOD", "ARMY", "DOE"}   # Nellis/NTTR, Hawthorne, Fallon ranges; the Nevada National Security Site (DOE)

def build_units(b, problems):
    # cell counts re-run on Nov 17 with CA/OR/ID-administered SMA features filling cells no NV feature covers
    # (NW Nevada and Sheldon are administered from California and Oregon offices); 9 units had been under 97%
    L = json.load(open(D / "source" / "nv-land-2026-11-17.json")); ag = L["agencies"]
    land, units = {}, []
    geo = {f["properties"]["display_name"]: f["geometry"] for f in b["UNITS"]["features"]}
    for u in L["units"]:
        name = u["name"]
        if not re.match(r"^\d{3}$", name): continue
        c = dict(zip(ag, u["cells"]))
        n = sum(c.values()); cov = n - c["NONE"]
        if cov / n < 0.95: problems.append(f"unit {name}: ownership covers {cov / n:.1%}")
        cls = collections.Counter()
        for a, v in c.items():
            if a != "NONE": cls[AGENCY[a]] += v
        pct = {k: round(100 * v / cov, 2) for k, v in cls.items() if v}
        pub = round(sum(v for k, v in pct.items() if k in PUBLIC), 1)
        closed = round(100 * sum(c.get(a, 0) for a in CLOSED_CODES) / cov, 1)
        acres = round(n * 100 * 100 / 4046.8564224)
        land[name] = {"acres": acres, "publicPct": pub, "privatePct": round(pct.get("PRIVATE", 0.0), 1), "tribalPct": round(pct.get("TRIBAL", 0.0), 1),
                      "closedFederalPct": closed, "huntablePct": round(pub - closed, 1), "ownership": pct}
        g = geo.get(name)
        xs = [p[0] for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]) for p in poly[0]]
        ys = [p[1] for poly in (g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]) for p in poly[0]]
        units.append({"name": name, "acres": acres, "bbox": [min(xs), min(ys), max(xs), max(ys)], "geometry": g,
                      "publicPct": pub, "privatePct": land[name]["privatePct"], "huntablePct": land[name]["huntablePct"],
                      "ownership": [{"manager": k, "pct": v} for k, v in sorted(pct.items(), key=lambda t: -t[1])]})
    tot = collections.Counter()
    for u in L["units"]:
        for a, v in zip(ag, u["cells"]):
            if a != "NONE": tot[AGENCY[a]] += v
    T = sum(tot.values())
    (D / "land.json").write_text(json.dumps({
        "source": "BLM national Surface Management Agency (BLM_Natl_SMA_LimitedScale/MapServer/1, ADMIN_ST='NV') x NDOW hunt units, EPSG:5070, 100 m centre-sampled cells; fetched 2026-11-17",
        "resolutionM": 100, "closedFederal": "DOD and DOE land (Nellis/NTTR, Hawthorne, Fallon ranges, Nevada National Security Site) counts as public in publicPct, as in every state, but not in huntablePct: it is closed to the public",
        "statewide": {k: round(100 * v / T, 1) for k, v in tot.most_common()}, "units": land}, separators=(",", ":")) + "\n")
    return land, units

def land_for(land, units):
    recs = [land.get(u) for u in units]
    if not units or any(r is None for r in recs): return None
    acres = sum(r["acres"] for r in recs)
    w = lambda k: round(sum(r[k] * r["acres"] for r in recs) / acres, 1)
    return {"acres": acres, "publicPct": w("publicPct"), "privatePct": w("privatePct"), "huntablePct": w("huntablePct")}

if __name__ == "__main__":
    main()
