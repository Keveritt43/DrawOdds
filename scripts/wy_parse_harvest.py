#!/usr/bin/env python3
"""Parse WGFD antelope/deer/elk harvest reports (hunter survey estimates) by hunt area and license type.

Usage: python3 -I scripts/wy_parse_harvest.py <dir with YYYY-<species>-harvest.pdf> data/wy/harvest.json

Only the "by hunt area" table is read (2021-2023: TABLE I-A "... HUNTER SUCCESS BY HUNT AREA";
2024+: "Table 3: Harvest Statistics by Hunt Area"). Weapon and herd-unit tables are skipped.

Rows: an area line ("11 Rawhide Butte"), then one row per license type ("Limited 1", "Full Type 3", "D/F 6",
"Reduced 6", "1", "GEN", "General"), optionally prefixed by a cross-area note "(6)" / "(also valid from 9)".
Column order differs by year, so each row's numbers are read under both layouts and kept only when they
reconcile: success % = total / active hunters and days per harvest = days / total.
Pooled Total / Resident / Nonresident rows are kept per area (they count hunters, not licenses).
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

TITLE = re.compile(r"(HUNTER SUCCESS|Harvest Statistics by Hunt Area)", re.I)
NOT_AREA_TABLE = re.compile(r"HERD|REGION|METHOD|WEAPON|STATEWIDE|Survey Effort", re.I)
OTHER_TABLE = re.compile(r"^\s*(TABLE\s+[IVX]+(-[A-Z])?\b|Table\s+\d+:)", re.I)
AREA = re.compile(r"^\s*(\d{1,3})\s+([A-Z][A-Za-z.'&/ -]*[A-Za-z.)])\s*$")
TYPE_ROW = re.compile(
    r"^\s*(?:\((?P<cross>[^)]*)\)\s+)?"
    r"(?:(?:Limited|Full|Reduced|D/F)\s+(?:Type\s+)?(?P<t1>\d{1,2})|(?P<gen>GEN|General|Gen)|(?P<t2>\d{1,2}))"
    r"\s+(?P<nums>[\d,.%\s-]+)$")
POOLED = re.compile(r"^\s*(?:Pooled\s+)?(?P<who>Total|Resident|Nonresident)\s+(?P<nums>[\d,.%\s-]+)$")


def nums(s: str) -> list[float]:
    out = []
    for t in s.split():
        t = t.replace(",", "").replace("%", "")
        out.append(0.0 if t in ("-", "") else float(t))
    return out


def interpret(v: list[float], has_type: bool) -> dict | None:
    """Return active/total/days/success under whichever layout reconciles, else None."""
    cands = []
    for sold in ([True, False] if has_type else [False]):
        w = v[:-1] if sold else v
        if len(w) < 6:
            continue
        for layout in ("new", "old"):
            if layout == "new":  # active, harvest..., total, days, success, days/harvest
                active, total, days, succ, dph = w[0], w[-4], w[-3], w[-2], w[-1]
            else:  # active, harvest..., total, success, days/harvest, days
                active, total, succ, dph, days = w[0], w[-4], w[-3], w[-2], w[-1]
            parts = w[1:-4]
            ok_s = abs((100 * total / active if active else 0) - succ) <= 0.25
            ok_d = (total == 0 and dph in (0.0,)) or (total > 0 and abs(days / total - dph) <= 0.15)
            ok_p = abs(sum(parts) - total) <= 1 if parts else False
            if ok_s and ok_d and ok_p and total <= active:
                cands.append({"active": int(active), "harvest": int(total), "days": int(days), "successPct": succ,
                              "parts": [int(x) for x in parts], "sold": int(v[-1]) if sold else None, "layout": layout})
    uniq = {json.dumps(c, sort_keys=True) for c in cands}
    return json.loads(next(iter(uniq))) if len(uniq) == 1 else (cands[0] if cands and all(c["harvest"] == cands[0]["harvest"] and c["active"] == cands[0]["active"] for c in cands) else None)


def parse(pdf: Path) -> dict:
    year, species, _ = pdf.stem.split("-", 2)
    text = subprocess.run(["pdftotext", "-layout", str(pdf), "-"], check=True, capture_output=True, text=True).stdout
    lines = text.replace("\f", "\n").splitlines()
    rows, pooled, problems = [], [], []
    inside = False
    area = None
    kind = "all"
    for i, raw in enumerate(lines):
        if TITLE.search(raw):
            ctx = " ".join(lines[i: i + 3])
            if NOT_AREA_TABLE.search(ctx) or not re.search(r"HUNT AREA|Hunt Area|\bAREA\b", ctx):
                inside = False
                continue
            inside = True
            near = " ".join(lines[max(0, i - 4): i + 1])
            kind = "wt" if re.search(r"WHITE-TAILED|White-Tailed", near) else "md" if re.search(r"MULE DEER|Mule Deer", near) else "all"
            continue
        if OTHER_TABLE.match(raw) and not re.search(r"Continued|BY HUNT AREA|by Hunt Area", raw, re.I):
            if inside and re.search(r"Table\s+\d+:|TABLE\s+[IVX]+", raw):
                inside = False
            continue
        if not inside:
            continue
        m = AREA.match(raw)
        if m and not re.match(r"^\s*\d{1,3}\s+(Total|Resident|Nonresident)", raw):
            area = str(int(m.group(1)))
            continue
        t = TYPE_ROW.match(raw)
        if t and area is not None:
            typ = "gen" if t["gen"] else (t["t1"] or t["t2"])
            v = nums(t["nums"])
            got = interpret(v, True)
            if got is None:
                problems.append(f"{area}-{typ}: {raw.strip()[:100]}")
                continue
            rows.append({"area": area, "type": typ, "cross": t["cross"], "kind": kind, **got})
            continue
        p = POOLED.match(raw)
        if p and area is not None:
            got = interpret(nums(p["nums"]), False)
            if got:
                pooled.append({"area": area, "who": p["who"].lower(), **got})
    return {"year": int(year), "species": species, "file": pdf.name, "rows": rows, "pooled": pooled, "problems": problems}


def main(src: str, out: str) -> None:
    reports = [parse(p) for p in sorted(Path(src).glob("20[0-9][0-9]-*-harvest.pdf"))]
    by: dict[str, dict[str, list]] = {}
    for r in reports:
        sp = by.setdefault(r["species"], {})
        merged: dict[str, dict] = {}
        for row in r["rows"]:
            k = f"{row['area']}-{row['type']}"
            m = merged.setdefault(k, {"kinds": {}, "cross": row["cross"], "sold": row["sold"]})
            if row["kind"] in m["kinds"]:
                r["problems"].append(f"duplicate {k} ({row['kind']})")
                continue
            m["kinds"][row["kind"]] = row
        for k, m in merged.items():
            ks = m["kinds"]
            if "all" in ks:
                x = ks["all"]
                rec = {"hunters": x["active"], "harvest": x["harvest"], "days": x["days"]}
            else:
                # deer: mule deer and white-tailed tables count a hunter in each table they hunted. Harvest adds up;
                # hunters = the larger table (a hunter in both counts once at most there): success is an upper bound.
                md, wt = ks.get("md"), ks.get("wt")
                rec = {"hunters": max((md or {}).get("active", 0), (wt or {}).get("active", 0)),
                       "harvest": (md or {}).get("harvest", 0) + (wt or {}).get("harvest", 0), "days": None,
                       "whitetail": (wt or {}).get("harvest", 0), "mule": (md or {}).get("harvest", 0),
                       "huntersMule": (md or {}).get("active"), "huntersWhitetail": (wt or {}).get("active"), "basis": "mule+whitetail"}
                if rec["harvest"] > rec["hunters"]:
                    r["problems"].append(f"{k}: combined deer harvest exceeds the larger hunter count")
                    continue
            sp.setdefault(k, []).append({"year": r["year"], **rec, "sold": m["sold"], "cross": m["cross"]})
        print(f"{r['file']}: {len(r['rows'])} license rows, {len(r['pooled'])} pooled rows, {len(r['problems'])} unreconciled")
    doc = {"source": "WGFD harvest reports (Harvest Reports & Surveys page)", "note": "Survey estimates; hunters = active license holders",
           "species": by, "problems": {r["file"]: r["problems"] for r in reports if r["problems"]},
           "pooled": {f"{r['year']}-{r['species']}": r["pooled"] for r in reports}}
    Path(out).write_text(json.dumps(doc, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
