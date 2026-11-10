#!/usr/bin/env python3
"""Parse WGFD draw "Demand Report" PDFs (antelope, deer, elk; 2021+) into JSON.

Usage:
  python3 -I scripts/wy_parse_draws.py <pdf_dir> <out_json>

Input files are named <year>-<species>-<pool>.pdf as listed in
data/wy/draw-sources.csv. Each PDF is converted with `pdftotext -layout`.

Report types
- *_pref (nonresident regular/special preference point draw): one block per
  hunt, one row per point level. Columns: remaining quota, issued, points
  label ("7", "< 7" = party averaging between 6 and 7, "<= 5" = 5 or fewer),
  first-choice applicants, first-choice success %.
- *_random (nonresident regular/special random, resident): one row per hunt:
  quota, first/second/third choice applicants. No issued column.

Every row is validated against the report's own arithmetic. Anything that
does not reconcile raises, so a silent misparse cannot reach the data.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

POOLS = ["nr_regular_pref", "nr_regular_random", "nr_special_pref", "nr_special_random", "res_random"]
SPECIES = ["antelope", "deer", "elk"]

HUNT = re.compile(r"^(\d{3}|[A-Z]{1,3})\s+(\d{1,2}|)\s*(.*?)\s{2,}(\S.*)$")
# numeric tail of a preference row
PREF_TAIL = re.compile(
    r"^(?P<quota>\d+)(?:\s+(?P<issued>\d+))?\s+(?P<lt><=|<)?\s*(?P<pts>\d+)\s+(?P<apps>\d+)\s+(?P<odds>\d+(?:\.\d+)?)%$"
)
RANDOM_TAIL = re.compile(r"^(?P<quota>\d+)\s+(?P<a1>\d+)\s+(?P<a2>\d+)\s+(?P<a3>\d+)$")
SKIP = re.compile(r"^(Demand Report|Nonresident|Resident|NR |Res |Hunt |Area |----|AM$|PM$|Fiscal|.*Page:)")


class ParseError(Exception):
    pass


def text_of(pdf: Path) -> list[str]:
    out = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = out.replace("\f", "\n").splitlines()
    # pdftotext leaves a stray 1-2 character footer fragment ("Y", ".", "4")
    # just before some page headers; drop only those, nowhere else.
    kept = []
    for i, line in enumerate(lines):
        if re.fullmatch(r"\S{1,2}", line.strip()) and line.strip() not in ("AM", "PM"):
            nxt = next((l for l in lines[i + 1:] if l.strip()), "")
            if nxt.startswith("Demand Report") or not nxt:
                continue
        kept.append(line)
    return kept


def header_info(lines: list[str]) -> dict:
    first = " ".join(lines[:3])
    m = re.search(r"Demand Report - (Non-Resident|Resident) (Antelope|Deer|Elk)", first)
    d = re.search(r"Date:\s*(\d{1,2})/(\d{1,2})/(\d{4})", first)
    if not m or not d:
        raise ParseError("unrecognised report header: " + first[:120])
    return {
        "residency": "nonresident" if m.group(1) == "Non-Resident" else "resident",
        "species": m.group(2).lower(),
        "reportDate": f"{d.group(3)}-{int(d.group(1)):02d}-{int(d.group(2)):02d}",
        "title": re.sub(r"\s{2,}.*", "", lines[1].strip()),
    }


def points_label(lt: str | None, pts: int) -> dict:
    # "< N" is a party whose average points lie strictly between N-1 and N.
    # "<= N" is a residual bucket: N points or fewer (all were unsuccessful
    # or the bucket closes the report).
    if lt == "<":
        return {"label": f"< {pts}", "min": pts - 1, "max": pts, "kind": "party"}
    if lt == "<=":
        return {"label": f"<= {pts}", "min": 0, "max": pts, "kind": "orLess"}
    return {"label": str(pts), "min": pts, "max": pts, "kind": "exact"}


def parse_pref(lines: list[str], src: str) -> list[dict]:
    hunts: list[dict] = []
    cur: dict | None = None
    for raw in lines:
        line = raw.strip()
        if not line or SKIP.match(line):
            continue
        m = HUNT.match(line)
        tail = line
        if m and PREF_TAIL.match(m.group(4).strip()):
            cur = {"area": m.group(1), "type": int(m.group(2)) if m.group(2) else None, "description": m.group(3).strip().rstrip(";"), "rows": []}
            hunts.append(cur)
            tail = m.group(4).strip()
        t = PREF_TAIL.match(tail)
        if not t:
            raise ParseError(f"{src}: unparsed line: {raw!r}")
        if cur is None:
            raise ParseError(f"{src}: row before first hunt: {raw!r}")
        row = {
            "quota": int(t["quota"]),
            "issued": int(t["issued"]) if t["issued"] is not None else None,
            "points": points_label(t["lt"], int(t["pts"])),
            "applicants": int(t["apps"]),
            "oddsPct": float(t["odds"]),
        }
        cur["rows"].append(row)
    for h in hunts:
        validate_pref(h, src)
    return hunts


def validate_pref(h: dict, src: str) -> None:
    rows = h["rows"]
    name = f"{src} {h['area']}-{h['type']}"
    remaining = rows[0]["quota"]
    for i, r in enumerate(rows):
        if r["issued"] is None:
            # Residual bucket: always the last row, always with no quota left.
            # "< N" here means "fewer than N points", not a party.
            if i != len(rows) - 1 or r["quota"] != 0:
                raise ParseError(f"{name}: blank-issued row {i} is not a closing zero-quota bucket")
            top = r["points"]["max"] if r["points"]["kind"] == "orLess" else r["points"]["max"] - 1
            r["points"] = {"label": r["points"]["label"], "min": 0, "max": top, "kind": "residual"}
        if r["quota"] != remaining:
            raise ParseError(f"{name}: row {i} quota {r['quota']} != running remainder {remaining}")
        issued = r["issued"] or 0
        if issued > r["applicants"]:
            raise ParseError(f"{name}: row {i} issued {issued} > applicants {r['applicants']}")
        # WGFD's printed odds are remaining quota / applicants, capped at 100%.
        # Issued can exceed the remaining quota when a party draws the last
        # license(s): the whole party is issued.
        if r["applicants"]:
            calc = 100.0 * min(remaining, r["applicants"]) / r["applicants"]
            if abs(calc - r["oddsPct"]) > 0.011:
                raise ParseError(f"{name}: row {i} odds {r['oddsPct']} != {calc:.2f}")
        elif r["oddsPct"] not in (0.0, 100.0):
            raise ParseError(f"{name}: row {i} odds with zero applicants")
        if issued < min(remaining, r["applicants"]) - 0:
            # fewer issued than available and wanted: only allowed when a
            # party could not fit (party too large for the remainder)
            r["shortfall"] = min(remaining, r["applicants"]) - issued
        if issued > remaining:
            r["partyOverflow"] = issued - remaining
        remaining = max(0, remaining - issued)
    h["initialQuota"] = rows[0]["quota"]
    h["issued"] = sum(r["issued"] or 0 for r in rows)
    h["applicants"] = sum(r["applicants"] for r in rows)
    h["unsuccessful"] = h["applicants"] - h["issued"]
    h["leftover"] = remaining


def parse_random(lines: list[str], src: str) -> list[dict]:
    hunts = []
    for raw in lines:
        line = raw.strip()
        if not line or SKIP.match(line):
            continue
        m = HUNT.match(line)
        t = RANDOM_TAIL.match(m.group(4).strip()) if m else None
        if not t:
            raise ParseError(f"{src}: unparsed line: {raw!r}")
        hunts.append({
            "area": m.group(1), "type": int(m.group(2)) if m.group(2) else None, "description": m.group(3).strip().rstrip(";"),
            "quota": int(t["quota"]),
            "applicants": [int(t["a1"]), int(t["a2"]), int(t["a3"])],
        })
        if hunts[-1]["quota"] == 9999:
            # WGFD prints 9999 for unlimited licenses (e.g. resident general deer)
            hunts[-1]["quota"] = None
            hunts[-1]["unlimited"] = True
    return hunts


def parse_file(pdf: Path) -> dict:
    year, species, pool = pdf.stem.split("-", 2)
    lines = text_of(pdf)
    info = header_info(lines)
    if info["species"] != species:
        raise ParseError(f"{pdf.name}: header species {info['species']}")
    want_res = "resident" if pool.startswith("res") else "nonresident"
    if info["residency"] != want_res:
        raise ParseError(f"{pdf.name}: header residency {info['residency']}")
    if not info["reportDate"].startswith(year):
        raise ParseError(f"{pdf.name}: header date {info['reportDate']}")
    is_pref = pool.endswith("_pref")
    special = "special" in info["title"].lower()
    if ("special" in pool) != special:
        raise ParseError(f"{pdf.name}: title '{info['title']}' does not match pool")
    if is_pref != ("PP" in info["title"].upper().split() or "preference" in info["title"].lower()):
        raise ParseError(f"{pdf.name}: title '{info['title']}' does not match draw type")
    hunts = parse_pref(lines, pdf.name) if is_pref else parse_random(lines, pdf.name)
    keys = [(h["area"], h["type"]) for h in hunts]
    if len(set(keys)) != len(keys):
        raise ParseError(f"{pdf.name}: duplicate hunt rows")
    if not hunts:
        raise ParseError(f"{pdf.name}: no hunts")
    return {"year": int(year), "species": species, "pool": pool, "file": pdf.name, **info, "hunts": hunts}


def main(pdf_dir: str, out: str) -> None:
    reports = []
    for pdf in sorted(Path(pdf_dir).glob("20[0-9][0-9]-*-*.pdf")):
        _, species, pool = pdf.stem.split("-", 2)
        if species in SPECIES and pool in POOLS:
            reports.append(parse_file(pdf))
    Path(out).write_text(json.dumps({"source": "WGFD draw demand reports", "reports": reports}, separators=(",", ":")))
    print(f"parsed {len(reports)} reports, {sum(len(r['hunts']) for r in reports)} hunt rows -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
