"""Build data/ut/general-elk-boundaries.json: general-season bull elk success and crowding for each hunt boundary
the general elk hunts use, from DWR's annual harvest reports (2021-2024, by elk unit and subunit).

Why: DWR reports general elk harvest by management unit / subunit ("16B Central Mtns, Manti"), while the hunts
are drawn on hunt boundaries ("Manti", "Cache, Wellsville"). The two don't line up by number, so each row is
given its DWR polygon by name (units.json has a polygon for every unit and most subunits), and each hunt boundary
takes, table by table and year by year, the smallest reported polygon that covers at least 80% of it (a boundary
split across units, like 2026's Oquirrh, 48% Oquirrh-Stansbury and 52% West Desert, gets no number: the old units
describe different ground).

Pooled per boundary: every general bull elk permit table (archery, any legal weapon any bull / spike, muzzleloader,
multiseason). Left out: youth tables (a separate youth draw), and extended archery (the same archery permit holders
again, so they'd be counted twice). Harvest is DWR's total harvest for the permit (archery can take cows in some
units), the same thing the statewide hunt cards show. 2025 has only DWR's statewide preliminary numbers, so it is
not used here.

Run: python3 -I scripts/ut_build_gen_elk.py   (needs shapely)
"""
import json
import re
from collections import defaultdict
from pathlib import Path

from shapely.geometry import shape
from shapely.ops import unary_union

D = Path(__file__).resolve().parent.parent / "data" / "ut"
YEARS = ["2021", "2022", "2023", "2024"]
GEN_ELK = ["EB1001", "EB1010", "EB1002", "EB1005", "EB1003", "EB1004", "EB1009"]
SKIP = re.compile(r"youth|extended archery", re.I)
COVER = 0.8


def norm(s: str) -> str:
    """Comparable name: lower case, no spaces or punctuation, '/' parts in order ("Vernal/Bonanza" = "Bonanza/Vernal")."""
    parts = [re.sub(r"[^a-z]", "", p.lower()) for p in s.split("/")]
    return "/".join(sorted(p for p in parts if p))


def clean(r: dict) -> tuple[str, str, str | None]:
    """(code, parent unit name, subunit name or None) from a parsed report row."""
    unit = r.get("unit") or ""
    name = r.get("name") or ""
    code, _, extra = unit.partition(" ")  # "17 Wasatch Mtns" + "A West"
    text = f"{extra} {name}" if extra else name
    text = re.sub(r"[—*]|\b\d+\b", " ", text)
    text = re.sub(r"\s+", " ", text).strip().rstrip(",")
    if "," in text:  # "Central Mtns, Manti"
        a, b = [x.strip() for x in text.split(",", 1)]
        return code, a, b
    m = re.match(r"^(.*?) ([A-D]{1,2}\d?) (.+)$", text)  # "Cache C Wellsville"
    if m:
        return code, m.group(1), m.group(3)
    return code, text, None


def main() -> None:
    units = json.load(open(D / "units.json"))
    harv = json.load(open(D / "source" / "harvest-2020-2025.json"))["generalElkByUnit"]
    U = {u["name"]: u for u in units["units"]}
    # polygons by name: hunt boundaries first (btype empty), biologist districts only as a fallback
    by_name: dict[str, list[dict]] = defaultdict(list)
    for u in sorted(units["units"], key=lambda u: (u.get("btype") not in (None, "<Null>"), u["acres"])):
        if u.get("btype") == "CWMU" or u.get("status") not in ("Active", "Pending"):
            continue
        by_name[norm(u["label"])].append(u)
    geom = {}

    def poly(b: str):
        if b not in geom:
            geom[b] = shape(U[b]["geometry"]).buffer(0)
        return geom[b]

    def resolve(parent: str, sub: str | None):
        keys = [f"{parent}, {sub}", sub] if sub else [parent]
        for k in keys:
            hit = by_name.get(norm(k))
            if hit:
                return hit[0]["name"]
        return None

    targets = sorted({str(b) for c in GEN_ELK for b in units["huntToBoundaries"].get(c, [])}, key=int)
    acc = {b: defaultdict(lambda: {"hunters": 0, "harvest": 0, "density": 0.0, "rows": []}) for b in targets}
    unresolved, checks = set(), []
    for y in YEARS:
        tables = defaultdict(list)
        for r in harv.get(y, []):
            if not SKIP.search(r["table"]):
                tables[r["table"]].append(r)
        for t, rows in tables.items():
            total = next((r for r in rows if re.match(r"statewide", (r.get("name") or "") + (r.get("unit") or ""), re.I)), None)
            placed = []
            for r in rows:
                if not r.get("unit") or not r.get("hunters") or r.get("harvest") is None:
                    continue
                code, parent, sub = clean(r)
                b = resolve(parent, sub)
                if b is None:
                    unresolved.add(f"{y} {code} {parent}{', ' + sub if sub else ''}")
                    continue
                placed.append((r, code, b))
            if total and total.get("hunters"):
                checks.append((y, t[:60], sum(r["hunters"] for r, _, _ in placed), total["hunters"]))
            for tb in targets:
                g = poly(tb)
                best = None
                for r, code, b in placed:
                    p = poly(b)
                    cov = g.intersection(p).area / g.area if g.area else 0
                    if cov >= COVER and (best is None or p.area < best[2].area):
                        best = (r, code, p, b)
                if best:
                    r, code, p, b = best
                    a = acc[tb][y]
                    a["hunters"] += r["hunters"]
                    a["harvest"] += r["harvest"]
                    a["density"] += r["hunters"] / (U[b]["acres"] / 640)
                    a["rows"].append(code)

    out = {}
    for b in targets:
        yrs = {y: v for y, v in acc[b].items() if v["hunters"]}
        if not yrs:
            continue
        hu = sum(v["hunters"] for v in yrs.values())
        hv = sum(v["harvest"] for v in yrs.values())
        out[b] = {"years": sorted(int(y) for y in yrs), "hunters": hu, "harvest": hv, "success": round(hv / hu, 4),
                  "huntersPerYear": round(hu / len(yrs)), "huntersSqMi": round(sum(v["density"] for v in yrs.values()) / len(yrs), 3),
                  "units": sorted({c for v in yrs.values() for c in v["rows"]})}
    (D / "general-elk-boundaries.json").write_text(json.dumps({
        "source": "DWR Utah Big Game Annual Reports 2021-2024, general-season elk harvest by management unit "
                  "(data/ut/source/harvest-2020-2025.json); youth and extended-archery tables left out",
        "method": f"each hunt boundary takes, per table and year, the smallest reported unit/subunit polygon covering at least {COVER:.0%} of it",
        "boundaries": out}, separators=(",", ":"), indent=None) + "\n")
    print(f"{len(out)} of {len(targets)} general elk boundaries matched")
    print("missing:", [f"{b} {U[b]['label']}" for b in targets if b not in out])
    print("unresolved rows:", sorted(unresolved))
    worst = sorted(checks, key=lambda c: abs(c[2] - c[3]) / c[3], reverse=True)[:8]
    print("placed hunters vs statewide row (worst):", worst)


if __name__ == "__main__":
    main()
