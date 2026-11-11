#!/usr/bin/env python3
"""Parse Montana FWP's 2026 Deer, Elk & Antelope regulations district tables into data/mt/regs-2026.json.

    python3 -I scripts/mt_parse_regs.py <regs-text.json> <regs-rules.json> data/mt/regs-2026.json

Neither the Claude workspace nor the owner's PC shell can reach fwp.mt.gov, so both inputs are produced in a
browser (Claude in Chrome) from the published PDF with pdf.js 4.4.168:

  regs-text.json   every text run as [x, y, text, height, fontFamily, fontName], y from the top of the
                   unrotated viewport. Pages 44-120 are stored rotated 90 degrees (wider than tall); this
                   script re-projects them with x' = 594 - y, y' = x before anything else.
  regs-rules.json  for each table page and each column, the y of every horizontal rule drawn in that column,
                   found by rendering the page at 3x and scanning for rows of pixels that are >= 85% dark
                   (luminance < 235) across the middle 70% of the column.

Why the rules: the tables merge cells vertically ("General Deer License" spans four season rows, an Elk B
licence's restrictions differ by row), and merged text is centred on rows of unequal height, so no rule based
on text position alone assigns it reliably. A cell is the band between two consecutive rules in its column;
rows that share the band share the cell. That is exactly how the table is drawn.

Layouts handled, each checked against the rendered page:
  pp. 44-119  deer and elk, by hunting district (rotated)
  pp. 122-123 "Licenses or Permits that are Valid in Multiple Districts" — the authoritative map from a
              multi-district code (399-20, 411-20) to its districts
  pp. 132-138 antelope, by district, plus Region 7's "Portions of HDs ..." sections
  p. 120      youth / PTHFV summary — NOT parsed: it restates rows already in each district's table.

Every season cell must parse as a date range or "-", every quota as a number, UNL or "-", and every piece of
table text must land in a cell that has a row. Anything else is reported and fails the build.
"""
import json
import re
import sys

DATE = r"[A-Z][a-z]{2,4}\.? ?\d{1,2}"
SEASON_RE = re.compile(rf"^{DATE} ?- ?{DATE}$")
CODE_RE = re.compile(r"\b(\d{3})-(\d{2})\b")
HD_RE = re.compile(r"^HD (\d{3}[A-Z]*) ?- ?(.+)$")
PORTION_RE = re.compile(r"^Portions of HDs? (.+)$")
REGION_RE = re.compile(r"^Region (\d)$")
# species band, optionally qualified: "ELK Hunting by Drawing Only", "DEER Inside the Weapons Restriction Area"
BAND_RE = re.compile(r"^(DEER|ELK|Elk)(?:\s+(?!B License|Permit|License)(.+))?$")
LICENSE_RE = re.compile(
    r"^(General (?:Deer|Elk) License|(?:Deer|Elk) B License|(?:Deer|Elk) Permit|Antelope(?: B)? License)")
NOISE = re.compile(r"Turn In Poachers|TIPMONT|Hunters using archery equipment|Antelope HD Regulations|"
                   r"Deer & Elk Regulations|Multi District LPT|^2026 Deer • Elk • Antelope$|Visit fwp\.mt\.gov")

LAYOUTS = {
    "de": {"pages": range(44, 120), "header_bottom": 74, "seasons": ["early", "archery", "general", "heritage", "late"],
           "cols": ["license", "opportunity", "applyBy", "quota", "quotaRange", "early", "archery", "general",
                    "heritage", "late", "details"]},
    # The antelope details column was scanned to x 600, past the table's right edge (~557), so its rules were
    # never found. Antelope rows are never merged, so it borrows the rules of the season column beside it.
    "an": {"pages": range(132, 139), "header_bottom": 66, "seasons": ["archery", "general"], "rules_from": {"details": "general"},
           "cols": ["license", "opportunity", "applyBy", "quota", "quotaRange", "archery", "general", "details"]},
}


def clean(t):
    t = re.sub(r"\s+", " ", t or "").strip()
    t = re.sub(r"([A-Za-z])- ([a-z])", r"\1-\2", t)  # a word hyphenated across lines: "either- sex"
    for a, b in (("ofered", "offered"), ("difcult", "difficult"), ("Specifc", "Specific")):
        t = t.replace(a, b)
    return t


def items_of(pg):
    rot = pg["w"] > pg["h"]
    out = []
    for x, y, s, h, _ff, fn in pg["items"]:
        if rot:
            x, y = 594 - y, x
        s = s.strip()
        # printed page numbers sit at the page edge (x 32, y 41 rotated; y 724 left or right, antelope); a bare number
        # anywhere else is data (a quota of 500)
        if re.fullmatch(r"\d{1,3}", s) and (y > 700 or (x < 45 and y < 50)):
            continue
        if s and not NOISE.search(s):
            out.append({"x": x, "y": y, "s": s, "f": fn})
    return out


def join_line(parts):
    """pdf.js splits runs mid-word ("S" + "ep 05-Oct 18"); a lone letter joins the next run without a space."""
    s = ""
    for p in parts:
        if s and re.search(r"(^|\s)[A-Za-z]$", s):
            s += p
        else:
            s = s + " " + p if s else p
    return s


def band(rules, y):
    """index of the band [rules[k], rules[k+1]) containing y"""
    k = -1
    for i, r in enumerate(rules):
        if r <= y + 0.25:
            k = i
        else:
            break
    return k


def is_season(v):
    v = fix_months(clean(v))
    return v in ("-", "_") or bool(SEASON_RE.match(v))


MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"


def fix_months(v):
    """pdf.js can split a month mid-word ("05-N" + "OV 29"); rejoin and title-case it."""
    def rep(m):
        w = (m.group(1) + m.group(2)).title()
        return w if re.fullmatch(MONTHS, w) else m.group(0)
    return re.sub(r"([A-Za-z]) ([A-Za-z]{1,3})(?= ?\d)", rep, v)


def is_season_text(v):
    return bool(SEASON_RE.match(fix_months(clean(v))))


def season(v):
    v = fix_months(clean(v))
    if v in ("", "-", "_"):
        return None
    if not SEASON_RE.match(v):
        raise ValueError(f"season cell {v!r}")
    return re.sub(r"\s*-\s*", "-", v)


def quota(v):
    v = clean(v)
    if v in ("", "-", "_"):
        return None
    if v == "UNL":
        return "UNL"
    if re.fullmatch(r"[\d,]+", v):
        return int(v.replace(",", ""))
    raise ValueError(f"quota {v!r}")


def qrange(v):
    v = clean(v)
    if v in ("", "-", "_"):
        return None
    m = re.fullmatch(r"([\d,]+) ?- ?([\d,]+)", v)
    if not m:
        raise ValueError(f"quota range {v!r}")
    return [int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))]


def apply_by(v):
    v = clean(v)
    if v in ("", "-", "_"):
        return None, False
    otc = v.startswith("OTC")
    return clean(re.sub(r"^OTC:?", "", v)) or None, otc


def is_mark(i):
    s = i["s"]
    if s in ("DEER", "ELK") and i["x"] < 90:
        return True  # two bands (pp. 87, 103) are indented
    return i["x"] < 60 and bool(HD_RE.match(s) or PORTION_RE.match(s) or REGION_RE.match(s) or BAND_RE.match(s))


def left_margin_lines(its):
    """Runs at the left margin on one line ("Region" + "6") joined, so section marks match as one string."""
    rows = {}
    for i in its:
        if i["x"] < 90:
            rows.setdefault(round(i["y"]), []).append(i)
    out = []
    for _, parts in rows.items():
        parts.sort(key=lambda i: i["x"])
        if parts[0]["x"] < 60:
            out.append({"x": parts[0]["x"], "y": parts[0]["y"], "s": " ".join(p["s"] for p in parts), "parts": parts})
    return out


def parse_page(pg, layout, page_rules, col_ranges, state, out, issues):
    L = LAYOUTS[layout]
    names = L["cols"]
    its = items_of(pg)
    # promote joined left-margin marks ("Region 6") so they are recognised and kept out of the licence column
    for ln in left_margin_lines(its):
        first = ln["parts"][0]["s"]
        joined_band = BAND_RE.match(ln["s"]) and BAND_RE.match(first)
        if (REGION_RE.match(ln["s"]) and len(ln["parts"]) > 1) or (joined_band and not LICENSE_RE.search(ln["s"])):
            for p_ in ln["parts"]:
                its.remove(p_)
            its.append({"x": ln["x"], "y": ln["y"], "s": ln["s"], "f": None})

    # section marks at the left margin: district headers, region sections, species bands, NOTE lines
    marks, note_rows = [], []
    for i in sorted(its, key=lambda i: i["y"]):
        if i["x"] >= 60 and not (i["s"] in ("DEER", "ELK") and i["x"] < 90):
            continue
        s = i["s"]
        if HD_RE.match(s):
            m = HD_RE.match(s)
            marks.append((i["y"], "HD", (m.group(1), re.sub(r"\s*[-–(]*\s*Continued\)?$", "", clean(m.group(2)), flags=re.I))))
        elif PORTION_RE.match(s):
            marks.append((i["y"], "HD", (f"R{state.get('region', '?')}:{clean(s)}", clean(s))))
        elif REGION_RE.match(s):
            state["region"] = int(REGION_RE.match(s).group(1))
        elif BAND_RE.match(s):
            m = BAND_RE.match(s)
            marks.append((i["y"], "BAND", (m.group(1).upper(), clean(m.group(2)) or None)))
    for i in its:
        if re.match(r"^note:", i["s"], re.I) and i["x"] < 250:
            note_rows.append(i["y"])
    marks.sort(key=lambda m: m[0])

    # NOTE paragraphs run across every column: the NOTE line plus continuation lines below it that start at
    # the left margin and come before the next mark or table row
    note_lines = set()
    notes = []
    ys_left = sorted({round(i["y"], 1) for i in its if i["x"] < 60 and not is_mark(i)})
    for ny in note_rows:
        group = [ny]
        for y in ys_left:
            if y > group[-1] and y - group[-1] < 10.5 and not any(group[-1] < my <= y for my, _, _ in marks):
                if any(abs(i["y"] - y) < 1.5 and LICENSE_RE.match(i["s"]) for i in its):
                    break
                group.append(y)
        def line_text(y):
            parts = sorted((i for i in its if abs(i["y"] - y) < 1.5), key=lambda i: i["x"])
            k = next((j for j, i in enumerate(parts) if re.match(r"^note:", i["s"], re.I)), 0)
            return " ".join(i["s"] for i in parts[k:] if not HD_RE.match(i["s"]))
        txt = " ".join(line_text(y) for y in group)
        note_lines.update(group)
        notes.append((ny, clean(re.sub(r"^note:\s*", "", txt, flags=re.I))))

    # text by column, one entry per visual line
    lines = {n: [] for n in names}
    for i in sorted(its, key=lambda i: (round(i["y"], 1), i["x"])):
        if i["y"] < L["header_bottom"] or is_mark(i) or any(abs(i["y"] - ny) < 1.5 for ny in note_lines):
            continue
        col = next((n for n, (a, b) in zip(names, col_ranges) if a <= i["x"] < b), None)
        if col is None:
            continue
        ln = lines[col]
        if ln and abs(ln[-1][0] - i["y"]) < 1.5:
            ln[-1][1].append(i["s"])
        else:
            ln.append([i["y"], [i["s"]]])
    lines = {n: [(y, join_line(p)) for y, p in v] for n, v in lines.items()}
    # outside the season columns a lone dash carries no data, and FWP draws the quota-range dash a few points
    # below its row, on the rule itself, where it would land in the next row's cell
    lines = {n: [(y, t) for y, t in v if n in L["seasons"] or clean(t) not in ("-", "_")] for n, v in lines.items()}

    # rows: a line whose season cells are all date ranges or dashes
    seasons = L["seasons"]
    by_y = {}
    for n in seasons:
        for y, t in lines[n]:
            by_y.setdefault(round(y, 1), {})[n] = t
    anchors = []
    for y in sorted(by_y):
        c = by_y[y]
        if len(c) >= max(1, len(seasons) - 3) and all(is_season(v) for v in c.values()):
            if anchors and y - anchors[-1] < 3.5:
                continue  # a dash sitting a couple of points off its row's line
            anchors.append(y)

    def ctx(y):
        hd, sp = state.get("hd"), state.get("sp")
        for my, kind, v in marks:
            if my > y:
                break
            if kind == "HD":
                hd, sp = v, None
            elif kind == "BAND":
                sp = v
        return hd, sp

    rule = {n: page_rules[k] for k, n in enumerate(names)}
    for n, src in L.get("rules_from", {}).items():
        rule[n] = rule[src]
    rows = []
    for a in anchors:
        hd, sp = ctx(a)
        rows.append({"y": a, "hd": hd, "sp": (sp[0] if sp else None) if layout == "de" else "ANTELOPE",
                     "section": sp[1] if (sp and layout == "de") else None, "cells": {}})
    for n in names:
        bands = {}
        for y, t in lines[n]:
            bands.setdefault(band(rule[n], y), []).append((y, t))
        used = set()
        for r in rows:
            b = band(rule[n], r["y"])
            used.add(b)
            if n in seasons:
                near = [t for y, t in lines[n] if abs(y - r["y"]) <= 3]
                r["cells"][n] = near[0] if near else ""
            else:
                r["cells"][n] = clean(" ".join(t for _, t in sorted(bands.get(b, []))))
        if n not in seasons:
            for b, txt in bands.items():
                if b not in used:
                    issues.append(f"p{pg['p']}: {n} text with no row: {' / '.join(t for _, t in txt)[:90]!r}")

    for r in rows:
        lic = r["cells"]["license"]
        if not lic:
            issues.append(f"p{pg['p']} y{r['y']:.0f}: row has no licence")
            continue
        if r["hd"] is None:
            issues.append(f"p{pg['p']} y{r['y']:.0f}: row has no district")
            continue
        m = LICENSE_RE.match(lic)
        if not m:
            issues.append(f"p{pg['p']}: unrecognised licence {lic!r}")
            continue
        code = CODE_RE.search(lic)
        try:
            q, rg = r["cells"]["quota"], r["cells"]["quotaRange"]
            mq = re.fullmatch(r"([\d,]+|UNL) ([\d,]+ ?- ?[\d,]+)", clean(q))
            if mq and not clean(rg):
                # a wide range ("1,000-4,000") starts left of the range column and lands in the quota cell
                r["cells"]["quota"], r["cells"]["quotaRange"] = mq.group(1), mq.group(2)
            ab, otc = apply_by(r["cells"]["applyBy"])
            rec = {
                "page": pg["p"],
                "license": m.group(1),
                "code": code.group(0) if code else None,
                "opportunity": r["cells"]["opportunity"] or None,
                "applyBy": ab,
                "otc": otc,
                "quota": quota(r["cells"]["quota"]),
                "quotaRange": qrange(r["cells"]["quotaRange"]),
                "seasons": {s: season(r["cells"][s]) for s in seasons},
                "details": None if r["cells"]["details"] in ("", "-", "_") else r["cells"]["details"],
            }
            if r["section"]:
                rec["section"] = r["section"]
            if land_limit(rec["details"], r["hd"][0]):
                rec["landLimit"] = "private"
        except ValueError as e:
            issues.append(f"p{pg['p']} {lic}: unparsed {e}")
            continue
        if r["sp"] is None:
            issues.append(f"p{pg['p']} y{r['y']:.0f}: {lic} has no species band")
            continue
        key = (r["sp"], r["hd"][0])
        d = out.setdefault(key, {"hd": r["hd"][0], "name": r["hd"][1], "species": r["sp"], "notes": [], "opportunities": []})
        d["opportunities"].append(rec)

    for ny, t in notes:
        hd, _ = ctx(ny + 0.5)
        if not hd:
            issues.append(f"p{pg['p']}: NOTE with no district: {t[:60]!r}")
            continue
        for (s, h), d in out.items():
            if h == hd[0] and t not in d["notes"]:
                d["notes"].append(t)
        state.setdefault("pending_notes", []).append((hd[0], t))
    state["hd"], state["sp"] = ctx(1e9)


# Places where FWP's 2026 regulations print the same licence differently in two district tables. Each was checked
# against the page text on 2026-11-11; the parser reads them correctly and the regulations disagree with
# themselves. Any conflict not in this set fails the build, so a parsing error cannot hide among them.
REVIEWED_CONFLICTS = {
    ("Deer B License 395-01", "applyBy"),   # HD 380 "Jun 1"; HD 391 "OTC: Jun 15" (p. 84). Ref. table: June 1
    ("Deer B License 395-01", "otc"),
    ("Elk B License 004-00", "applyBy"),    # HD 417 "Jun 1" (p. 92); every other R4 HD and the ref. table: OTC Jun 15
    ("Elk B License 004-00", "otc"),
    ("Elk B License 210-03", "quota"),      # HD 210 prints 300 (p. 53); HDs 211, 212, 216 print 200
    ("Elk Permit 799-21", "quotaRange"),    # HD 704 prints "1,000-1,000" (p. 118); HDs 702, 705 print none
}

# The reference table (pp. 122-123) and the district tables disagree on how three licences are sold. Checked
# against the page text 2026-11-11; recorded per code as `referenceConflict`. Anything else fails the build.
REVIEWED_REFERENCE_CONFLICTS = {
    "Deer B License 006-00",  # ref. table "OTC: June 15"; every R6 district table "Jun 1", quota 2,000
    "Elk B License 005-00",   # ref. table "June 1"; every R5 district table "OTC: Jun 15", UNL
    "Elk B License 201-01",   # ref. table "June 1"; HD 201 and HD 260 tables "OTC: Jun 15", UNL
}


PRIVATE_ONLY_RE = re.compile(r"\b(only valid on private lands?|valid on private lands? only|private land only)\b", re.I)
NOT_ONLY_RE = re.compile(r"\b(also valid on|and DNRC|and state)\b", re.I)


def land_limit(details, hd):
    """'private' when the opportunity is valid only on private land in this district, else None.

    Conservative on purpose: "Only valid on private land", "Valid on private land only" and "Private land only"
    count; anything that adds other land ("AND ALSO VALID on DNRC lands") does not. A restriction scoped to other
    districts ("In HD 390, only valid on private land" read in HD 380) does not count here.
    """
    if not details:
        return None
    for sentence in re.split(r"(?<=\.)\s+", details):
        if not PRIVATE_ONLY_RE.search(sentence) or NOT_ONLY_RE.search(details):
            continue
        scoped = re.match(r"^In HDs? ([\d ,&and]+)", sentence)
        if scoped and hd not in re.findall(r"\d{3}", scoped.group(1)):
            continue
        return "private"
    return None


def districts_of(text):
    m = re.search(r"all (?:R|Region )(\d) HDs?(?: except (?:HDs? )?([\d ,&and]+))?", text)
    if m:
        return {"region": int(m.group(1)), "except": re.findall(r"\d{3}", m.group(2) or "")}
    # the first sentence lists the districts, with words in between ("HDs 204, 261, 262, and a portion of 270",
    # "south portion of 210 (Rattling Gulch-Henderson Creek)"), so take every district number in it
    first = re.split(r"\.\s|\.$|Restrictions", text)[0]
    found = re.findall(r"\b\d{3}\b", first)
    return {"districts": found} if found else {}


def parse_multi(pages, issues):
    """pp. 122-123: code -> licence, apply/purchase date, where it is valid."""
    out = {}
    for pg in pages:
        its = items_of(pg)
        rows = sorted({round(i["y"], 1) for i in its if CODE_RE.fullmatch(i["s"]) and i["x"] < 60})
        heads = sorted(i["y"] for i in its if re.fullmatch(r"(Deer|Elk|Antelope)( B)? (Licenses|Permits)", i["s"]))
        for k, y in enumerate(rows):
            lo = (rows[k - 1] + y) / 2 if k else y - 14
            hi = (y + rows[k + 1]) / 2 if k + 1 < len(rows) else y + 14
            for hy in heads:
                if lo < hy < y:
                    lo = hy + 1
                if y < hy < hi:
                    hi = hy - 1
            cell = sorted([i for i in its if lo <= i["y"] < hi], key=lambda i: (i["y"], i["x"]))
            code = next(i["s"] for i in cell if abs(i["y"] - y) < 1 and i["x"] < 60)
            kind = clean(" ".join(i["s"] for i in cell if 85 <= i["x"] < 160))
            ab, otc = apply_by(" ".join(i["s"] for i in cell if 160 <= i["x"] < 230))
            valid = clean(" ".join(i["s"] for i in cell if i["x"] >= 230))
            key = code + " " + kind
            if key in out:
                issues.append(f"multi-district table: {key} twice")
            out[key] = {"code": code, "license": kind, "applyBy": ab, "otc": otc, "validIn": valid, "page": pg["p"],
                        **districts_of(valid)}
    return list(out.values())


def main(text_path, rules_path, dst):
    d = json.load(open(text_path))
    rules = json.load(open(rules_path))
    pages = {pg["p"]: pg for pg in d["regs"]}
    out, issues = {}, []
    for layout in ("de", "an"):
        state = {}
        cols = rules["cols"][layout]
        for p in LAYOUTS[layout]["pages"]:
            parse_page(pages[p], layout, rules["pages"][str(p)], cols, state, out, issues)
    multi = parse_multi([pages[122], pages[123]], issues)
    corrections = [clean(" ".join(i[2] for i in sorted(p["items"], key=lambda i: (round(i[1]), i[0])))) for p in d["corrections"]]
    districts = sorted(out.values(), key=lambda v: (v["species"], v["hd"]))

    # code -> where it appears. Built from the district tables, then checked against FWP's own multi-district
    # reference table (pp. 122-123), which is laid out and printed independently.
    codes = {}
    for t in districts:
        for o in t["opportunities"]:
            if not o["code"]:
                continue
            # an LPT code is NOT unique on its own: 100-00 is both a Deer B and an Elk B licence, 005-00 an
            # over-the-counter Deer B and a drawn Elk B. FWP's draw reports are split by licence type the same way.
            key = f"{o['license']} {o['code']}"
            c = codes.setdefault(key, {"key": key, "code": o["code"], "license": o["license"], "species": t["species"],
                                             "districts": [], "quota": o["quota"], "quotaRange": o["quotaRange"],
                                             "applyBy": o["applyBy"], "otc": o["otc"]})
            if t["hd"] not in c["districts"]:
                c["districts"].append(t["hd"])
            for f in ("quota", "quotaRange", "applyBy", "otc"):
                if c[f] != o[f]:
                    conflict = {"field": f, "values": {}}
                    for c2 in c.setdefault("conflicts", []):
                        if c2["field"] == f:
                            conflict = c2
                            break
                    else:
                        c["conflicts"].append(conflict)
                    conflict["values"].setdefault(json.dumps(c[f]), [])
                    conflict["values"].setdefault(json.dumps(o[f]), [])
                    if t["hd"] not in conflict["values"][json.dumps(o[f])]:
                        conflict["values"][json.dumps(o[f])].append(t["hd"])
    for c in codes.values():
        for cf in c.get("conflicts", []):
            first = json.dumps(c[cf["field"]])
            cf["values"][first] = [h for h in c["districts"] if all(h not in v for k, v in cf["values"].items() if k != first)]
            cf["values"] = {k: v for k, v in cf["values"].items() if v}
            # the first district's value is not "the" value: there is none. Each district keeps what its own
            # table prints (data/mt/regs-2026.json districts[].opportunities[]).
            c[cf["field"]] = None
    found = {(c["key"], cf["field"]) for c in codes.values() for cf in c.get("conflicts", [])}
    if found != REVIEWED_CONFLICTS:
        for k in sorted(found - REVIEWED_CONFLICTS):
            issues.append(f"new conflict between district tables: {k} — check the page, then add it to REVIEWED_CONFLICTS")
        for k in sorted(REVIEWED_CONFLICTS - found):
            issues.append(f"reviewed conflict no longer present: {k}")
    region_of = lambda hd: hd[0] if hd[0].isdigit() else None
    norm_date = lambda v: (v or "").replace("June", "Jun").replace("April", "April").strip() or None
    for m in multi:
        c = codes.get(f"{m['license']} {m['code']}")
        if not c:
            issues.append(f"multi-district code {m['code']} ({m['license']}) appears in no district table")
            continue
        # the reference table's own apply/purchase date against what the district tables print
        if c["applyBy"] is not None and (norm_date(m["applyBy"]) != norm_date(c["applyBy"]) or m["otc"] != c["otc"]):
            c["referenceConflict"] = {"referenceTable": {"applyBy": m["applyBy"], "otc": m["otc"]},
                                      "districtTables": {"applyBy": c["applyBy"], "otc": c["otc"]}}
        listed = set(m.get("districts") or [])
        if "region" in m:
            listed = {h for t in districts if t["species"] == c["species"] and region_of(t["hd"]) == str(m["region"])
                      for h in [t["hd"]] if h not in m["except"]}
            found = {h for h in c["districts"] if h.isdigit() or h[:3].isdigit()}
            # a region-wide licence is listed under every district it is valid in, but FWP may leave it out of a
            # district where restrictions make it moot; only flag a district table naming it outside the region
            stray = sorted(h for h in found if region_of(h) != str(m["region"]) or h in m["except"])
            if stray:
                # e.g. Elk B 005-00 (Region 5) is printed in HD 701 "in portion of HD 701 north of the Yellowstone"
                c["outsideRegion"] = stray
            c["validIn"] = {"region": m["region"], "except": m["except"], "text": m["validIn"]}
        else:
            found = set(c["districts"])
            if listed and listed != found:
                issues.append(f"{c['key']}: reference table lists {sorted(listed)}, district tables {sorted(found)}")
            c["validIn"] = {"districts": sorted(listed) or sorted(found), "text": m["validIn"]}
    n = sum(len(v["opportunities"]) for v in districts)
    print(f"{len(districts)} district tables, {n} opportunity rows, {len(codes)} licence/permit codes, "
          f"{len(multi)} multi-district codes", file=sys.stderr)
    ref = {c["key"] for c in codes.values() if "referenceConflict" in c}
    for k in sorted(ref ^ REVIEWED_REFERENCE_CONFLICTS):
        issues.append(f"reference-table conflict set changed: {k}")
    for i in issues:
        print("ISSUE", i, file=sys.stderr)
    json.dump({
        "source": {**d["source"], "rules": rules["source"],
                   "parsedPages": "44-119 deer & elk, 122-123 multi-district reference, 132-138 antelope",
                   "notParsed": "p. 120 youth/PTHFV summary (restates district rows)"},
        "corrections": {"text": corrections,
                        "checked": "2026-11-11: both items (HD 202 archery season; HD 535 youth mule deer antlerless) "
                                   "are already reflected in the web edition parsed here; nothing applied"},
        "multiDistrict": multi,
        "codes": dict(sorted(codes.items())),
        "districts": districts,
    }, open(dst, "w"), indent=1, ensure_ascii=False)
    if issues:
        sys.exit(1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
