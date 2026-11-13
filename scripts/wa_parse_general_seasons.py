"""Washington general deer and elk seasons, from the 2026 pamphlet's season tables.

Usage: python3 -I scripts/wa_parse_general_seasons.py
Reads  data/wa/source/regs-2026.json (pdf.js text items: [x, y, width, size, text] per page)
       data/wa/units.json (to expand "101 through 124" to the GMUs that exist)
Writes data/wa/general-seasons-2026.json

Each table row is a season: dates, the GMUs it covers, and the legal animal. Rows start at a line with a date
in the dates column; GMU and legal text that wraps continues on the following lines. Column positions differ by
page, so they're read from each page's own header ("2026 DATES", "GAME MANAGEMENT UNITS", "LEGAL"). Text under
6.5 pt is footnote markers (a, d, h) and is ignored. Rows for Master Hunters only, high-buck wilderness hunts and
youth seasons are kept but flagged, since an adult general-tag hunter can't use them.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "wa" / "source"
PAGES = {  # page index -> (species, weapon)
    21: ("DEER", "ANY"), 22: ("DEER", "ARCHERY"), 23: ("DEER", "MUZZLELOADER"),
    41: ("ELK", "ANY"), 42: ("ELK", "ARCHERY"), 43: ("ELK", "MUZZLELOADER"),
}
MON = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DATE_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)\.?\s+\d")


def parse_dates(text: str, year: int = 2026) -> list[tuple[str, str]]:
    """'Oct. 17-Nov. 1' / 'Aug. 1, 2026-Jan. 20, 2027' / 'Aug. 1-31, 2026 and Jan. 1-31, 2027' -> ISO ranges."""
    out = []
    t = text.replace("–", "-").replace(" - ", "-")
    for part in re.split(r"\s+and\s+", t):
        m = re.match(r"\s*([A-Za-z]+)\.?\s+(\d+)(?:,\s*(\d{4}))?\s*-\s*(?:([A-Za-z]+)\.?\s+)?(\d+)(?:,\s*(\d{4}))?", part)
        if not m:
            continue
        m1, d1, y1, m2, d2, y2 = m.groups()
        mo1 = MON[m1[:3].lower()]
        mo2 = MON[m2[:3].lower()] if m2 else mo1
        if y1:
            ya = int(y1)
        elif y2:                                  # "Jan. 1-31, 2027": the one year printed covers both ends
            ya = int(y2) if mo1 <= mo2 else int(y2) - 1
        else:
            ya = year
        yb = int(y2) if y2 else (ya + 1 if mo2 < mo1 else ya)
        out.append((f"{ya}-{mo1:02d}-{int(d1):02d}", f"{yb}-{mo2:02d}-{int(d2):02d}"))
    return out


def expand_gmus(text: str, gmus: list[int]) -> tuple[list[str], list[str]]:
    """GMUs and Deer/Elk Areas named in a cell. Parenthesised exceptions are dropped (they carve out an area,
    not a GMU); 'N through M' expands to the GMUs that exist between them."""
    t = re.sub(r"\([^)]*\)", " ", text)
    t = t.replace("*", " ").replace(" though ", " through ")
    areas = re.findall(r"(?:Deer|Elk) Areas? (\d{4})(?: and (\d{4}))?", t)
    area_list = [a for pair in areas for a in pair if a]
    t = re.sub(r"(?:Deer|Elk) Areas? \d{4}(?: and \d{4})?", " ", t)
    out: list[str] = []
    for a, b in re.findall(r"\b(\d{3})\s+through\s+(\d{3})\b", t):
        out += [str(g) for g in gmus if int(a) <= g <= int(b)]
    t = re.sub(r"\b\d{3}\s+through\s+\d{3}\b", " ", t)
    out += re.findall(r"\b(\d{3})\b", t)
    return sorted(set(out), key=int), area_list


def sex_of(species: str, legal: str, deer_type: str, youth: bool) -> str:
    """The legal animal in tagSeasons' vocabulary (see src/lib/tagSeasons.ts seasonsClass / seasonRules)."""
    l = legal.lower().replace("pt.", "pt").strip()
    q = "youth " if youth else ""
    wt = "white-tailed " if deer_type == "White-tailed" else ""
    if species == "DEER":
        if "any deer" in l:
            return f"{q}any deer"
        if "or antlerless" in l:
            return f"{q}either sex ({wt}3 pt. min. buck or antlerless)"
        if "antlerless" in l:
            return f"{q}antlerless"
        if "3 pt" in l:
            return f"{q}antlered ({wt}3 pt. min.)"
        return f"{q}antlered ({wt}any buck)"
    if "antlerless only" in l:
        return f"{q}antlerless only"
    if "any elk" in l:
        return f"{q}any elk"
    if "spike bull or" in l:
        return f"{q}spike or antlerless"
    if "or antlerless" in l:
        return f"{q}either sex (3 pt. min. bull or antlerless)"
    if "true spike" in l:
        return f"{q}antlered (true spike only)"
    if "spike" in l:
        return f"{q}antlered (spike only)"
    if "3 pt" in l:
        return f"{q}antlered (3 pt. min.)"
    return f"{q}antlered (any bull)"


def main() -> None:
    pages = json.load(open(SRC / "regs-2026.json"))["pamphlet"]
    pages = pages if isinstance(pages, list) else pages["pages"]
    gmus = sorted(int(u["name"]) for u in json.load(open(ROOT / "data" / "wa" / "units.json"))["units"] if u["kind"] == "gmu")
    rows: list[dict] = []
    for pi, (species, weapon) in PAGES.items():
        items = [it for it in pages[pi]["items"] if it[3] >= 6.5]
        hdr = {}
        for it in items:
            t = it[4]
            if "dates" not in hdr and re.search(r"2026 DATES|^2026$", t):
                hdr["dates"] = it[0]
            if "gmu" not in hdr and t.startswith("GAME MANAGEMENT UNITS"):
                hdr["gmu"] = it[0]
            if "legal" not in hdr and t.startswith("LEGAL"):
                hdr["legal"] = it[0]
        # Headers are centred, so cells start left of them: the dates column starts at the leftmost date cell, and the
        # GMU cells start a column-width to its right.
        lx = hdr["legal"] - 10
        dx = min(it[0] for it in items if 60 < it[0] < lx and DATE_RE.match(it[4]))
        gx = min(it[0] for it in items if dx + 20 < it[0] < lx and re.match(r"(\d{3}\b|Master Hunters|Elk Area|Deer Area)", it[4]))
        lines: dict[float, list] = {}
        for it in sorted((it for it in items if it[0] < 370), key=lambda it: -it[1]):   # x >= 370 is the side panel
            # a row's label can sit a point below its first line ("Western" at 325 beside a row at 326)
            key = next((k for k in lines if abs(k - it[1]) <= 1.6), it[1])
            lines.setdefault(key, []).append(it)
        section, side, deer_type, cur = "", "", "", None
        for y in sorted(lines, reverse=True):
            line = sorted(lines[y])
            name = " ".join(it[4] for it in line if it[0] < dx - 3).strip()
            date = " ".join(it[4] for it in line if dx - 3 <= it[0] < gx - 3).strip()
            gmu = " ".join(it[4] for it in line if gx - 3 <= it[0] < lx).strip()
            legal = " ".join(it[4] for it in line if lx <= it[0] < 370).strip()
            first = line[0][4].strip()
            if line[0][0] < 45 and (first in ("a", "d", "h", "*", "**", "Master Hunters:") or first.startswith("See Big Game")):
                break                                   # footnotes: end of table
            if re.match(r"^(HUNT SEASON|ELK TAG AREA)", name):
                continue
            if name.isupper() and ("SEASON" in name or "WASHINGTON" in name):
                if "WASHINGTON" in name:
                    side = "EAST" if name.startswith("EASTERN") else "WEST"
                else:
                    section = name
                cur = None
                continue
            if name in ("Black-tailed Deer", "White-tailed Deer", "Mule Deer"):
                deer_type = name.split()[0]
            elif name.startswith("Eastern") or name.startswith("Western"):
                side = "EAST" if name.startswith("Eastern") else "WEST"
            elif name.startswith("High Buck"):
                section = "HIGH BUCK"
            if DATE_RE.search(date) and not (cur and cur["dates_raw"].rstrip().endswith(("-", "and"))):
                cur = {"species": species, "weapon": weapon, "section": section, "side": side if species == "ELK" else None,
                       "deer_type": deer_type if species == "DEER" else None, "dates_raw": date, "gmu_raw": gmu, "legal": legal, "page": pi}
                rows.append(cur)
            elif cur is not None:
                if date:
                    cur["dates_raw"] += " " + date
                if gmu:
                    cur["gmu_raw"] += " " + gmu
                if legal:
                    cur["legal"] += " " + legal
    out = []
    for r in rows:
        r["dates_raw"] = re.sub(r"\s*-\s*", "-", r["dates_raw"]).strip()
        r["dates"] = parse_dates(r["dates_raw"])
        r["gmus"], r["areas"] = expand_gmus(r["gmu_raw"], gmus)
        r["master_only"] = r["gmu_raw"].lstrip().startswith("Master Hunters Only")
        r["high_buck"] = r["section"] == "HIGH BUCK"
        r["youth"] = "YOUTH" in r["section"]
        r["adult"] = not (r["master_only"] or r["high_buck"] or r["youth"])
        r["sex"] = sex_of(r["species"], r["legal"], r["deer_type"] or "", r["youth"])
        out.append(r)
    problems = [f"p{r['page']} {r['dates_raw']!r} -> {r['dates']}" for r in out if not r["dates"]]
    problems += [f"p{r['page']} {r['gmu_raw'][:60]!r}: no GMU or area" for r in out if not r["gmus"] and not r["areas"] and not r["high_buck"]]
    (ROOT / "data" / "wa" / "general-seasons-2026.json").write_text(json.dumps(
        {"source": "WDFW 2026 Big Game Hunting Pamphlet, general season tables (pages 23-25, 44-46)", "year": 2026,
         "problems": problems, "rows": out}, indent=1) + "\n")
    print(len(out), "rows;", sum(r["adult"] for r in out), "adult;", "problems:", problems)


if __name__ == "__main__":
    main()
