#!/usr/bin/env python3
"""Parse Montana FWP's deer, elk and antelope drawing statistics, 2021-2026, into data/mt/draws.json.

    python3 -I scripts/mt_parse_draws.py data/mt/source/draw-reports-2021-2026.json data/mt/source/draw-xls-csv data/mt/draws.json

Inputs (the workspace cannot reach myfwp.mt.gov; both come from a browser, see docs/states/mt-onboarding.md):
  draw-reports.json  the FWP listing plus, for every PDF report, pdf.js 4.4.168 text runs [x, y, text]; the
                     2021 and 2022 reports are Excel files and are carried as raw bytes
  xls-csv-dir        those Excel files converted to CSV (LibreOffice), named <objectID>-*.csv

Two report kinds per licence type and year:
  detail   one row per (code, residency pool, point level): applications, successes, % successful.
           First-choice applicants only (FWP's legend). Four pools: RESIDENT, NONRESIDENT and the two
           LANDOWNER pools, which are separate quotas and are never merged into the public pools.
  summary  one row per code: quota, quota by pool, and 1st/2nd/3rd-choice applicants and successes.

The points column is NOT the same thing in every year. Kept exactly as printed ("" and "0" are different
values); docs/states/mt-onboarding.md §3.4 sets out what each means and how it was established.
"""
import csv
import glob
import json
import os
import re
import sys

CODE = re.compile(r"^\d{3}-\d{2}$")
# 2026 deer reports print the species in the code cell: "004-01 WT", "101-50 MULE"
# ... and others carry a note: "270-45 (First Choice Only)", "411-21 (First and Only) ARCHERY ONLY"
CODE_CELL = re.compile(r"^(\d{3}-\d{2})(\s.*)?$")
POOLS = ("RESIDENT LANDOWNER", "NONRESIDENT LANDOWNER", "RESIDENT", "NONRESIDENT")
NUM = re.compile(r"^-?\d[\d,]*(\.\d+)?$")
# report titles -> licence type, the same names the regulations use (data/mt/regs-2026.json)
TYPES = [
    (r"antelope 900|archery only", "Antelope License", "archery"),
    (r"antelope b", "Antelope B License", None),
    (r"antelope", "Antelope License", None),
    (r"deer permit", "Deer Permit", None),
    (r"deer b", "Deer B License", None),
    (r"elk permit", "Elk Permit", None),
    (r"elk b|elk a9", "Elk B License", None),
]
# item descriptions inside the combined detail files (2021 all species; 2022 antelope + antelope B)
ITEM_TYPES = [
    (r"^ANTELOPE B", "Antelope B License"), (r"^ANTELOPE", "Antelope License"),
    (r"^DEER PERMIT", "Deer Permit"), (r"^DEER B", "Deer B License"),
    (r"^ELK PERMIT", "Elk Permit"), (r"^ELK B", "Elk B License"),
]


# FWP's printed TOTAL row disagrees with its own rows. Checked on the page; the rows are kept as printed.
REVIEWED_TOTALS = {
    (2024, "Deer B License", "393-01"),  # rows sum to 151 applications, TOTAL prints 152 (successes agree: 100)
}


# What the points column means. FWP never defines it; established from the reports' own structure
# (docs/states/mt-onboarding.md §3.4). Odds by point level are published only for the years marked "used".
POINTS_COLUMN = {
    "2023": "used", "2024": "used", "2025": "used", "2026": "used",
    "2022": "unclear", "2021": "unclear",
    "used": ("Points used in that drawing: the applicant's banked points plus the point bought with that "
             "application. Buyers start at 1. The last group (blank in 2023, \"0\" from 2024) applied without "
             "buying a point, so their banked points were not used; FWP's regulations say unbought points do not "
             "count. A hunter holding N points who buys one this year compares with last year's N+1 row."),
    "unclear": ("2021 prints a blank group, a 0 group and levels from 1 in almost every pool; 2022 does the same in "
                "141 pools, and there its 0 group draws worse than the blank group, which no reading of the rules "
                "explains. Kept as printed for totals and trends; not used for odds by point level."),
}


def kind_of(title):
    t = title.lower()
    return "detail" if "bonus point" in t else "summary"


def type_of_title(title):
    t = title.lower()
    if "deer, elk" in t or "antelope and antelope b" in t:
        return None  # combined file: type comes from each row's item description
    for pat, name, _ in TYPES:
        if re.search(pat, t):
            return name
    raise ValueError(f"unknown licence type in title {title!r}")


def type_of_item(item):
    for pat, name in ITEM_TYPES:
        if re.search(pat, item.strip().upper()):
            return name
    raise ValueError(f"unknown item description {item!r}")


def num(s):
    s = s.replace(",", "").strip()
    return float(s) if "." in s else int(s)


def pdf_lines(report):
    for pg in report["pages"]:
        rows = {}
        for x, y, s in pg["items"]:
            rows.setdefault(round(y * 2) / 2, []).append((x, s.strip()))
        merged = []
        for y in sorted(rows):
            if merged and y - merged[-1][0] < 2:
                merged[-1][1].extend(rows[y])
            else:
                merged.append([y, list(rows[y])])
        for _, toks in merged:
            yield [s for _, s in sorted(toks) if s]


def detail_rows_pdf(report, issues):
    """Token-typed, not positional: column x positions differ in every report."""
    for toks in pdf_lines(report):
        if not toks or toks[0].startswith("Item Description") or toks[0] in ("Number", "Number of"):
            continue
        ci = next((i for i, t in enumerate(toks) if CODE_CELL.match(t)), None)
        if ci is None:
            if any(t in POOLS for t in toks):
                issues.append(f"{report['objectID']}: data line without a code: {toks}")  # never skip silently
            continue
        m = CODE_CELL.match(toks[ci])
        item, code, rest = " ".join(toks[:ci]), m.group(1), toks[ci + 1:]
        suffix = (m.group(2) or "").strip()
        if "TOTAL" in item.upper():
            yield {"item": item, "code": code, "total": True, "nums": rest}
            continue
        pool = next((p for p in POOLS if rest and rest[0] == p), None)
        if not pool:
            issues.append(f"{report['objectID']}: no residency in {toks}")
            continue
        nums = rest[1:]
        if not all(NUM.match(n) for n in nums) or len(nums) not in (3, 4):
            issues.append(f"{report['objectID']}: bad numbers in {toks}")
            continue
        points = nums[0] if len(nums) == 4 else ""  # a blank points cell is kept blank, never read as 0
        rec = {"item": item, "code": code, "pool": pool, "points": points,
               "apps": num(nums[-3]), "succ": num(nums[-2]), "pct": num(nums[-1])}
        if suffix:
            rec["suffix"] = suffix
        yield rec


def detail_rows_csv(path, issues):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        rd = csv.reader(f)
        head = [h.strip() for h in next(rd)]
        ix = {h: i for i, h in enumerate(head)}
        for row in rd:
            if not row or not row[ix["District"]].strip():
                continue
            if "TOTAL" in row[ix["Item Description"]].upper():
                yield {"item": row[ix["Item Description"]].strip(), "code": row[ix["District"]].strip(), "total": True,
                       "nums": [row[ix["Number of Applications"]], row[ix["Number of Successes"]]]}
                continue
            pool = row[ix["Residency"]].strip()
            if pool not in POOLS:
                issues.append(f"{os.path.basename(path)}: residency {pool!r}")
                continue
            yield {"item": row[ix["Item Description"]].strip(), "code": row[ix["District"]].strip(), "pool": pool,
                   "points": row[ix["Number of Points"]].strip(), "apps": num(row[ix["Number of Applications"]]),
                   "succ": num(row[ix["Number of Successes"]]), "pct": num(row[ix["% Successful"]])}


SUMMARY_FIELDS = ["quota", "lo_res_qta", "lo_res_apps1", "lo_res_succ1", "lo_nr_qta", "lo_nr_apps1", "lo_nr_succ1",
                  "res_qta", "res_apps1", "res_apps2", "res_apps3", "res_succ1", "res_succ2", "res_succ3",
                  "nr_qta", "nr_apps1", "nr_apps2", "nr_apps3", "nr_succ1", "nr_succ2", "nr_succ3",
                  "total_succ", "surplus"]


def summary_value(t):
    t = t.replace(",", "").strip()
    return "UNL" if t == "UNL" else int(t)


def join_codes(toks):
    """Some summary PDFs split a code into three runs: "100", "-", "00"."""
    out, i = [], 0
    while i < len(toks):
        if i + 2 < len(toks) and re.fullmatch(r"\d{3}", toks[i]) and toks[i + 1] == "-" and re.fullmatch(r"\d{2}.*", toks[i + 2]):
            out.append(toks[i] + "-" + toks[i + 2])
            i += 3
        else:
            out.append(toks[i])
            i += 1
    return out


def summary_rows(tokens_iter, src, issues):
    for toks in tokens_iter:
        toks = join_codes(toks)
        if not toks or not re.match(r"^\d{3}-\d{2}", toks[0]):
            continue
        code = toks[0][:6]
        vals = [t for t in toks[1:] if re.fullmatch(r"UNL|[\d,]+", t.strip())]
        note = clean_note(" ".join([toks[0][6:]] + [t for t in toks[1:] if not re.fullmatch(r"UNL|[\d,]+", t.strip())]))
        if len(vals) != len(SUMMARY_FIELDS):
            issues.append(f"{src}: summary row {code} has {len(vals)} values, expected {len(SUMMARY_FIELDS)}: {toks}")
            continue
        rec = dict(zip(SUMMARY_FIELDS, map(summary_value, vals)))
        rec["code"] = code
        if note:
            rec["note"] = note
        yield rec


def clean_note(s):
    s = s.replace("&amp;", "&").strip(" ;")
    return re.sub(r"\s+", " ", s) or None


def csv_tokens(path):
    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        for row in csv.reader(f):
            yield [c.strip() for c in row if c.strip()]


def main(src, csv_dir, dst):
    d = json.load(open(src))
    issues = []
    reports = {}
    for r in d["listing"]:
        reports.setdefault(r["objectID"], r)
    detail, summary, files, totals = [], [], [], {}
    for oid, r in sorted(reports.items(), key=lambda kv: (kv[1]["year"], kv[1]["title"])):
        kind, ltype = kind_of(r["title"]), type_of_title(r["title"])
        is_xls = oid in d["xls"]
        csvs = glob.glob(os.path.join(csv_dir, f"{oid}-*.csv"))
        if is_xls and len(csvs) != 1:
            issues.append(f"{oid}: expected one CSV, found {csvs}")
            continue
        files.append({"objectID": oid, "year": r["year"], "title": r["title"], "kind": kind, "format": "xls" if is_xls else "pdf",
                      "url": f"https://myfwp.mt.gov/getRepositoryFile?objectID={oid}"})
        if kind == "detail":
            rows = detail_rows_csv(csvs[0], issues) if is_xls else detail_rows_pdf(d["pdf"][oid], issues)
            for row in rows:
                if row.get("total"):
                    # FWP's own per-code total: kept only to check the rows add up to it
                    lt = ltype or type_of_item(row["item"].replace(" TOTAL", ""))
                    if "ARCHERY ONLY" in row["item"].upper() or row["item"].upper().startswith("ANTELOPE 900"):
                        lt = "Antelope License"
                    n = [x for x in row["nums"] if NUM.match(str(x).strip())]
                    totals[(r["year"], lt, row["code"], oid)] = (num(str(n[0])), num(str(n[1])))
                    continue
                lt = ltype or type_of_item(row["item"])
                if row["item"].upper().startswith("ANTELOPE 900") or "ARCHERY ONLY" in row["item"].upper():
                    lt = "Antelope License"
                rec = {"year": r["year"], "license": lt, "code": row["code"], "pool": row["pool"],
                       "points": row["points"], "apps": row["apps"], "succ": row["succ"], "pct": row["pct"], "src": oid}
                sfx = clean_note(row.get("suffix") or "")
                if sfx in ("WT", "MULE", "MD"):
                    rec["species"] = sfx
                elif sfx:
                    rec["note"] = sfx
                detail.append(rec)
        else:
            toks = csv_tokens(csvs[0]) if is_xls else pdf_lines(d["pdf"][oid])
            for rec in summary_rows(toks, oid, issues):
                summary.append({"year": r["year"], "license": ltype, **rec, "src": oid})

    # every printed % must match successes / applications at the report's own precision
    for row in detail:
        if row["apps"]:
            pct = 100 * row["succ"] / row["apps"]
            if abs(pct - row["pct"]) > 0.51:
                issues.append(f"{row['year']} {row['license']} {row['code']} {row['pool']} {row['points']!r}: "
                              f"printed {row['pct']}% but {row['succ']}/{row['apps']} = {pct:.2f}%")
    sums = {}
    for row in detail:
        k = (row["year"], row["license"], row["code"], row["src"])
        a, b = sums.get(k, (0, 0))
        sums[k] = (a + row["apps"], b + row["succ"])
    for k, t in totals.items():
        if sums.get(k) != t and (k[0], k[1], k[2]) not in REVIEWED_TOTALS:
            issues.append(f"{k[0]} {k[1]} {k[2]}: rows sum to {sums.get(k)} but FWP's TOTAL row says {t}")
    missing = {k for k in sums if k not in totals}
    print(f"{len(totals)} printed TOTAL rows checked; {len(missing)} codes have no TOTAL row", file=sys.stderr)
    # ---- assemble: year -> "licence code" -> summary + point levels per pool ----
    POOL_KEY = {"RESIDENT": "res", "NONRESIDENT": "nr", "RESIDENT LANDOWNER": "loRes", "NONRESIDENT LANDOWNER": "loNr"}
    years = {}
    for row in summary:
        y = years.setdefault(str(row["year"]), {})
        key = f"{row['license']} {row['code']}"
        if key in y:
            issues.append(f"{row['year']} {key}: two summary rows")
        g = lambda f: row[f]
        y[key] = {
            "license": row["license"], "code": row["code"], **({"note": row["note"]} if row.get("note") else {}),
            "quota": g("quota"), "surplus": g("surplus"), "totalSucc": g("total_succ"),
            "pools": {
                "res": {"quota": g("res_qta"), "apps": [g("res_apps1"), g("res_apps2"), g("res_apps3")],
                        "succ": [g("res_succ1"), g("res_succ2"), g("res_succ3")]},
                "nr": {"quota": g("nr_qta"), "apps": [g("nr_apps1"), g("nr_apps2"), g("nr_apps3")],
                       "succ": [g("nr_succ1"), g("nr_succ2"), g("nr_succ3")]},
                "loRes": {"quota": g("lo_res_qta"), "apps": [g("lo_res_apps1")], "succ": [g("lo_res_succ1")]},
                "loNr": {"quota": g("lo_nr_qta"), "apps": [g("lo_nr_apps1")], "succ": [g("lo_nr_succ1")]},
            },
            "levels": {},
        }
    for row in detail:
        y = years.setdefault(str(row["year"]), {})
        key = f"{row['license']} {row['code']}"
        e = y.get(key)
        if e is None:
            issues.append(f"{row['year']} {key}: detail rows but no summary row")
            continue
        for f in ("species", "note"):
            if row.get(f) and f not in e:
                e[f] = row[f]
        e["levels"].setdefault(POOL_KEY[row["pool"]], []).append([row["points"], row["apps"], row["succ"]])
    def order(p):  # buyers by points, then the no-purchase group last, as FWP prints it
        return (1, 0) if p in ("", "0") else (0, float(p))
    for y in years.values():
        for e in y.values():
            for pool, lv in e["levels"].items():
                lv.sort(key=lambda r: order(r[0]))
    out = {
        "source": {"listing": d["source"], "extracted": d["extracted"], "files": files},
        "pointsColumn": POINTS_COLUMN,
        "levelFormat": "[points as printed, first-choice applications, first-choice successes]",
        "years": {k: dict(sorted(v.items())) for k, v in sorted(years.items())},
    }
    json.dump(out, open(dst, "w"), indent=None, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(files)} reports, {len(detail)} detail rows, {len(summary)} summary rows, "
          f"{sum(len(v) for v in years.values())} licence-years", file=sys.stderr)
    for i in issues[:60]:
        print("ISSUE", i, file=sys.stderr)
    if len(issues) > 60:
        print(f"... {len(issues) - 60} more", file=sys.stderr)
    if issues:
        sys.exit(1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
