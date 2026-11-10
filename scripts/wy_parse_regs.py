#!/usr/bin/env python3
"""Parse the WGFD antelope/deer/elk regulation season tables (Section 2 of each chapter).

Usage: python3 -I scripts/wy_parse_regs.py <regs.pdf> <year> <out.json>

The tables are printed rotated, two hunts side by side. `pdftotext -layout` gives readable lines, so each
page is split into its two columns at the header's character positions ("Hunt Area Type Opens Closes Opens
Closes Quota Limitations" appears twice). Within a column:
  - a row starts with the hunt area(s) and type ("1", "1, 2, 3", "12," continued on the next lines; type is a
    number or "Gen" for general licenses);
  - dates are assigned to Special Archery Opens/Closes or Regular Opens/Closes by their start position;
  - quota is a number, "Unlimited", or blank (a further season segment of the same license);
  - limitation text may wrap above and below its row; fragments are rejoined by hyphenation and proximity.
Output per species: rows in printed order, plus licenses keyed "area-type" (one per hunt area) with their
season segments, quota and limitations.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import date

MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8,
          "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12}
DATE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?\s?(\d{1,2})\b")
KEEP_HYPHEN = {"white-tailed", "one-half", "one-quarter", "three-quarters", "muzzle-loading", "non-resident"}
UNFINISHED = re.compile(r"(-|,|;|\b(?:and|or|of|the|on|in|within|valid|north|south|east|west|from|to|a|any|except))$", re.I)
COLS = ["area", "type", "aOpen", "aClose", "rOpen", "rClose", "quota", "lim"]


class RegsError(Exception):
    pass


def page_text(pdf: str, page: int) -> list[str]:
    return subprocess.run(["pdftotext", "-layout", "-f", str(page), "-l", str(page), pdf, "-"],
                          check=True, capture_output=True, text=True).stdout.splitlines()


def header_positions(lines: list[str]) -> tuple[int, list[dict]]:
    """Index of the column header line and, per column half, the start position of each header word."""
    for i, line in enumerate(lines):
        if re.search(r"Area\s+Type\s+Opens\s+Closes\s+Opens\s+Closes\s+Quota\s+Limitations", line):
            halves = []
            for m in re.finditer(r"Area\s+Type\s+Opens\s+Closes\s+Opens\s+Closes\s+Quota\s+Limitations", line):
                seg = line[m.start():m.end()]
                pos = {}
                off = m.start()
                for name, word in zip(COLS, ["Area", "Type", "Opens", "Closes", "Opens", "Closes", "Quota", "Limitations"]):
                    j = seg.index(word, (pos[list(pos)[-1]] - off + 1) if pos else 0)
                    pos[name] = off + j
                halves.append(pos)
            return i, halves
    raise RegsError("no column header")


def to_date(mon: str, day: str, year: int, season_start_month: int = 7) -> str:
    m = MONTHS[mon.lower().rstrip(".")]
    # seasons run from late summer into the next year (Jan 31 closes)
    y = year if m >= season_start_month else year + 1
    return date(y, m, int(day)).isoformat()


def parse_half(lines: list[str], lo: int, hi: int | None, pos: dict, year: int) -> list[dict]:
    rows: list[dict] = []
    frags: list[tuple[int, str]] = []  # (line index, text) limitation text on lines without a row
    closed: list[str] = []
    pending_areas: list[str] = []  # area-only lines ending in "," printed above their row
    for li, raw in enumerate(lines):
        seg = raw[lo:hi] if hi else raw[lo:]
        if not seg.strip():
            continue
        sec = re.match(r"^(\s*)Section \d+\.", seg)
        if rows and sec and abs(lo + len(sec.group(1)) - pos["area"]) <= 6:
            break  # the season table ended; regulation text follows
        abs_off = lo
        # A row has a type ("1", "Gen") in the type column and dates or a quota after it. Its hunt area(s) may be
        # on the same line, and/or on area-only lines just above ("53,") and below ("57").
        cands = [t for t in re.finditer(r"(?<![\w.,])(Gen|\d{1,2})(?![\w.,])", seg[: max(1, pos["aOpen"] - abs_off - 1)])
                 if abs(abs_off + t.start() - pos["type"]) <= 4]
        tm = min(cands, key=lambda t: abs(abs_off + t.start() - pos["type"])) if cands else None
        is_row = bool(tm) and (bool(DATE.search(seg, tm.end())) or bool(re.match(r"^\s+(Unlimited|\d+)\b", seg[tm.end():])))
        am = re.match(r"^(\s*)((?:\d{1,3},\s{0,2})*\d{1,3},?)(?=\s)", seg)
        own = am if am and abs(abs_off + len(am.group(1)) - pos["area"]) <= 6 and (not tm or am.end() <= tm.start()) else None
        m = tm if is_row else None
        synthetic_type = None
        if not m and own and DATE.search(seg, own.end()):
            # type printed over several lines ("Gen-" / "Youth" / "only") or left out ("General license and ...")
            near = " ".join((l[lo:hi] if hi else l[lo:])[: max(1, pos["aOpen"] - abs_off - 1)] for l in lines[max(0, li - 3): li + 3])
            if "Youth" in near or "Gen-" in near:
                synthetic_type = "Gen-Youth"
            elif re.search(r"General license", " ".join(l[lo:hi] if hi else l[lo:] for l in lines[li: li + 2])):
                synthetic_type = "Gen"
            else:
                raise RegsError(f"row without a type at line {li}: {raw.strip()[:80]}")
        area_cont = re.match(r"^\s*((?:\d{1,3},\s*)*\d{1,3},?)\s*$", seg[: max(1, pos["aOpen"] - abs_off - 2)]) if not (m or synthetic_type) else None
        if m or synthetic_type:
            own_areas = [a for a in re.split(r",\s*", own.group(2).strip(",")) if a] if own else []
            areas = pending_areas + own_areas
            areas_open = own.group(2).strip().endswith(",") if own else bool(pending_areas)
            pending_areas = []
            typ = synthetic_type or m.group(1)
            rest_start = own.end() if synthetic_type else m.end()
            dates = {}
            for d in DATE.finditer(seg, rest_start):
                col = min(["aOpen", "aClose", "rOpen", "rClose"], key=lambda c: abs(abs_off + d.start() - pos[c]))
                if col in dates:
                    raise RegsError(f"two dates in {col}: {raw.strip()}")
                dates[col] = to_date(d.group(1), d.group(2), year)
            last_date = max([d.end() for d in DATE.finditer(seg, rest_start)], default=rest_start)
            tail = seg[last_date:]
            q = re.match(r"^\s*(Unlimited|\d+)\b", tail)
            quota = None
            if q and abs(abs_off + last_date + q.start(1) - pos["quota"]) <= 10:
                quota = "unlimited" if q.group(1) == "Unlimited" else int(q.group(1))
                tail = tail[q.end():]
            row = {"areas": areas, "areasOpen": areas_open or not areas, "type": typ, **dates,
                   "quota": quota, "lim": tail.strip(), "line": li}
            rows.append(row)
            continue
        if area_cont and re.search(r"\bClosed\b", seg):
            closed.extend(a for a in re.split(r",\s*", area_cont.group(1).strip(",")) if a)
            continue
        if area_cont and abs(abs_off + len(seg) - len(seg.lstrip()) - pos["area"]) <= 6:
            more = [a for a in re.split(r",\s*", area_cont.group(1).strip(",")) if a]
            if rows and rows[-1].get("areasOpen") and not pending_areas:
                rows[-1]["areas"] += more
                rows[-1]["areasOpen"] = area_cont.group(1).strip().endswith(",")
            elif area_cont.group(1).strip().endswith(","):
                pending_areas += more
            else:
                raise RegsError(f"orphan area line {li}: {raw.strip()[:80]}")
            text = seg[len(area_cont.group(0)):].strip() if len(seg) > len(area_cont.group(0)) else ""
            if text:
                frags.append((li, text))
            continue
        text = seg.strip()
        if re.match(r"^(\d+\.\s+[A-Z]|Section \d)", text):
            continue  # numbered sidebar notes beside the table (e.g. antelope field-judging tips)
        if text and not re.match(r"^(WGFD\.WYO\.GOV|\d{1,3}|ANTELOPE|DEER|ELK|Hunt|Area|Special Archery Dates.*)$", text):
            frags.append((li, text))
    for r in rows:
        if not r["areas"]:
            raise RegsError(f"row without a hunt area at line {r['line']}")
    # Limitation text: cut anything after a wide gap (sidebar notes printed beside the table), then group lines
    # into paragraphs (consecutive lines with text). A paragraph with one row belongs to it. With several rows,
    # a row with no text of its own takes the wrapped lines; hyphenated wraps stay with the line they continue.
    clip = lambda t: re.split(r"\s{4,}", t.strip())[0]
    for r in rows:
        r["lim"] = clip(r["lim"])
    text_at = {li: clip(t) for li, t in frags}
    row_at = {r["line"]: r for r in rows}
    lines_with_text = sorted(set(text_at) | {r["line"] for r in rows if r["lim"]} | set(row_at))
    runs, cur = [], []
    for li in lines_with_text:
        if cur and li - cur[-1] > 1:
            runs.append(cur); cur = []
        cur.append(li)
    if cur:
        runs.append(cur)
    for run in runs:
        rs = [row_at[li] for li in run if li in row_at]
        fr = [li for li in run if li not in row_at and li in text_at]
        if not fr:
            continue
        if not rs:
            # stray paragraph between rows: the nearest row within 2 lines, if any
            near = [r for r in rows if min(abs(r["line"] - run[0]), abs(r["line"] - run[-1])) <= 2]
            if not near:
                continue
            target = min(near, key=lambda r: min(abs(r["line"] - run[0]), abs(r["line"] - run[-1])))
            for li in fr:
                target.setdefault("frags", []).append((li, text_at[li]))
            continue
        empty = [r for r in rs if not r["lim"]]
        for li in fr:
            t = text_at[li]
            nxt = next((r for r in rs if r["line"] > li), None)
            prv = next((r for r in reversed(rs) if r["line"] < li), None)
            if len(rs) == 1:
                target = rs[0]
            elif UNFINISHED.search(t) and nxt and nxt["line"] - li <= 2 and not (prv and UNFINISHED.search(prv["lim"] or "") and li - prv["line"] == 1):
                target = nxt
            elif prv and (prv["lim"] or "").endswith("-") and not prv.get("frags"):
                target = prv
            elif empty:
                target = min(empty, key=lambda r: abs(r["line"] - li))
            else:
                target = min(rs, key=lambda r: (abs(r["line"] - li), r["line"] < li))
            target.setdefault("frags", []).append((li, t))
    for r in rows:
        parts = sorted(r.get("frags", []) + [(r["line"], r["lim"])])
        lim = " ".join(t for _, t in parts if t)
        lim = re.sub(r"\s*\b\d{4} (?:ANTELOPE|DEER|ELK) HUNTING\b|\s*WGFD\.WYO\.GOV", "", lim)
        r["lim"] = re.sub(r"(\w+)-\s+([a-z]\w*)", lambda m: f"{m[1]}-{m[2]}" if f"{m[1]}-{m[2]}".lower() in KEEP_HYPHEN else m[1] + m[2], lim).strip()
        r.pop("frags", None)
        r.pop("areasOpen", None)
    for a in closed:
        rows.append({"areas": [a], "type": "closed", "quota": None, "lim": "Closed", "line": -1})
    return rows


def parse(pdf: str, year: int) -> dict:
    n = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
    out: dict[str, list[dict]] = {"antelope": [], "deer": [], "elk": []}
    pages: dict[str, list[int]] = {k: [] for k in out}
    for p in range(1, n + 1):
        lines = page_text(pdf, p)
        joined = "\n".join(lines)
        if "Special Archery Dates" not in joined:
            continue
        sp = re.search(rf"{year} (ANTELOPE|DEER|ELK) HUNTING", joined)
        if not sp:
            raise RegsError(f"page {p}: season table without a species header")
        species = sp.group(1).lower()
        hi, halves = header_positions(lines)
        body = lines[hi + 1:]
        for k, pos in enumerate(halves):
            lo = max(0, pos["area"] - 3)
            # single-table pages print regulation text in the other column: stop just past the limitations column
            end = max(0, halves[k + 1]["area"] - 3) if k + 1 < len(halves) else (pos["lim"] + 46 if len(halves) == 1 else None)
            for r in parse_half(body, lo, end, pos, year):
                r["page"] = p
                r["col"] = k
                out[species].append(r)
        pages[species].append(p)
    return {"year": year, "pages": pages, "rows": out}


def licenses(rows: list[dict]) -> dict[str, dict]:
    """Group season rows into licenses per hunt area: "1-1" -> segments, quota, limitations.
    A row with a blank quota continues the license above it (same areas and type) with another segment."""
    lic: dict[str, dict] = {}
    last_key: dict[tuple, str] = {}
    for r in rows:
        if r["type"] == "closed":
            continue
        group = tuple(r["areas"])
        k = (group, r["type"])
        seg = {"archery": [r["aOpen"], r["aClose"]] if "aOpen" in r and "aClose" in r else None,
               "regular": [r["rOpen"], r["rClose"]] if "rOpen" in r and "rClose" in r else None,
               "limitations": r["lim"]}
        if ("aOpen" in r) != ("aClose" in r) or ("rOpen" in r) != ("rClose" in r):
            raise RegsError(f"unpaired dates on page {r['page']}: {r}")
        for a in r["areas"]:
            key = f"{int(a)}-{r['type'].lower()}" if r["type"] != "Gen" else f"{int(a)}-gen"
            e = lic.setdefault(key, {"area": str(int(a)).zfill(3), "type": r["type"], "quota": None, "sharedAreas": [str(int(x)).zfill(3) for x in group] if len(group) > 1 else None, "segments": []})
            if r["quota"] is not None:
                if e["quota"] is not None and e["quota"] != r["quota"]:
                    e.setdefault("extraQuotas", []).append(r["quota"])
                else:
                    e["quota"] = r["quota"]
            e["segments"].append(seg)
    return lic


def main(pdf: str, year: str, out: str) -> None:
    doc = parse(pdf, int(year))
    result = {"year": int(year), "source": pdf.split("/")[-1], "pages": doc["pages"], "species": {}}
    for s, rows in doc["rows"].items():
        result["species"][s] = {"rows": rows, "licenses": licenses(rows)}
        print(s, "rows", len(rows), "licenses", len(result["species"][s]["licenses"]))
    with open(out, "w") as f:
        json.dump(result, f, indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
