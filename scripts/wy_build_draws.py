#!/usr/bin/env python3
"""Build data/wy/draws.json from WGFD draw demand report PDFs.

Usage:
  python3 -I scripts/wy_build_draws.py <pdf_dir> data/wy/draws.json

Runs the parser (scripts/wy_parse_draws.py), then cross-checks the pools
against each other and writes a compact, app-ready file. Any failed check
stops the build.

Cross-checks (all must hold):
- Every nonresident preference hunt has a matching random hunt and vice versa.
- Random first-choice applicants == applicants who failed the preference draw
  (WGFD enters every unsuccessful preference applicant in the random draw).
Recorded, not enforced:
- Preference quota == ceil(75% x (preference + random quota)) (Chapter 44
  §4(b)(ii)(A)). Exceptions are listed in meta.splitExceptions.
- The 40/60 special/regular split does not hold hunt by hunt (landowner
  licenses come out first), so it is not checked.

Compact row format for preference hunts: [quota, issued|null, kind, points,
applicants, oddsPct] where kind is "e" exact points, "p" party (average
points between points-1 and points) or "r" residual ("points" or fewer, all
unsuccessful).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wy_parse_draws as P  # noqa: E402

KIND = {"exact": "e", "party": "p", "residual": "r"}


def key(h: dict) -> str:
    return h["area"] if h["type"] is None else f"{h['area']}-{h['type']}"


def effective(rows: list[dict]) -> float | None:
    """Cutoff on one scale, as in coOdds: level L drawn at fraction f -> L + (1 - f).
    Everyone with more than L points drew. None when nobody had to be turned away."""
    for r in rows:
        k = r["points"]["kind"]
        if k == "residual":
            return r["points"]["max"] + 1.0
        if r["applicants"] and r["oddsPct"] < 100:
            # parties sit between max-1 and max; use their midpoint
            level = r["points"]["max"] - (0.5 if k == "party" else 0)
            return level + (1 - r["oddsPct"] / 100)
    return None


def main(pdf_dir: str, out: str) -> None:
    reports = [P.parse_file(p) for p in sorted(Path(pdf_dir).glob("20[0-9][0-9]-*-*.pdf"))
               if p.stem.split("-", 2)[1] in P.SPECIES and p.stem.split("-", 2)[2] in P.POOLS]
    R = {(r["year"], r["species"], r["pool"]): r for r in reports}
    years = sorted({r["year"] for r in reports})
    missing = [(y, s, p) for y in years for s in P.SPECIES for p in P.POOLS if (y, s, p) not in R]
    if missing:
        raise SystemExit(f"missing reports: {missing}")

    hunts: dict[str, dict] = {s: {} for s in P.SPECIES}
    split_exceptions = []
    checked = 0
    moves: dict[str, list[float]] = {s: [] for s in P.SPECIES}

    for (y, s, pool), rep in R.items():
        for h in rep["hunts"]:
            entry = hunts[s].setdefault(key(h), {"area": h["area"], "type": h["type"], "description": h["description"], "years": {}})
            entry["description"] = h["description"]
            yr = entry["years"].setdefault(str(y), {})
            if pool == "res_random":
                yr["res"] = {"quota": h["quota"], "apps": h["applicants"]}
                continue
            kind = "regular" if "regular" in pool else "special"
            slot = yr.setdefault(kind, {})
            if pool.endswith("_pref"):
                slot["pref"] = {
                    "quota": h["initialQuota"],
                    "rows": [[r["quota"], r["issued"], KIND[r["points"]["kind"]], r["points"]["max"], r["applicants"], r["oddsPct"]] for r in h["rows"]],
                }
            else:
                slot["random"] = {"quota": h["quota"], "apps": h["applicants"]}

    for s in P.SPECIES:
        for k, e in hunts[s].items():
            for y, yr in e["years"].items():
                for kind in ("regular", "special"):
                    slot = yr.get(kind)
                    if not slot:
                        continue
                    if "pref" not in slot or "random" not in slot:
                        raise SystemExit(f"{y} {s} {k} {kind}: preference and random reports disagree on hunt list")
                    pref, rnd = slot["pref"], slot["random"]
                    applicants = sum(r[4] for r in pref["rows"])
                    issued = sum(r[1] or 0 for r in pref["rows"])
                    if rnd["apps"][0] != applicants - issued:
                        raise SystemExit(f"{y} {s} {k} {kind}: random 1st-choice applicants {rnd['apps'][0]} != unsuccessful preference applicants {applicants - issued}")
                    checked += 1
                    total = pref["quota"] + rnd["quota"]
                    if total and pref["quota"] != math.ceil(0.75 * total - 1e-9):
                        split_exceptions.append({"year": int(y), "species": s, "hunt": k, "pool": kind, "pref": pref["quota"], "random": rnd["quota"]})
            # year-over-year movement of the nonresident cutoff, for the uncertainty band
            ys = sorted(e["years"])
            for a, b in zip(ys, ys[1:]):
                if int(b) != int(a) + 1:
                    continue
                for kind in ("regular", "special"):
                    pa = e["years"][a].get(kind, {}).get("pref")
                    pb = e["years"][b].get(kind, {}).get("pref")
                    if not pa or not pb:
                        continue
                    ea = effective([P_row(r) for r in pa["rows"]])
                    eb = effective([P_row(r) for r in pb["rows"]])
                    if ea is not None and eb is not None:
                        moves[s].append(round(eb - ea, 4))

    def quantiles(xs: list[float]) -> dict:
        xs = sorted(xs)
        q = lambda f: xs[min(len(xs) - 1, max(0, round(f * (len(xs) - 1))))]
        return {"n": len(xs), "p10": q(0.1), "p50": q(0.5), "p90": q(0.9)}

    out_doc = {
        "source": "Wyoming Game and Fish Department draw demand reports (wgfd.wyo.gov/licenses-applications/draw-results-odds)",
        "manifest": "data/wy/draw-sources.csv",
        "years": years,
        "reportDates": {f"{r['year']}-{r['species']}-{r['pool']}": r["reportDate"] for r in reports},
        "meta": {
            "checkedPools": checked,
            "splitExceptions": split_exceptions,
            "cutoffMove": {s: quantiles(m) for s, m in moves.items()},
            "rowFormat": "[remainingQuota, issued|null, kind e|p|r, points, firstChoiceApplicants, printedOddsPct]",
        },
        "hunts": hunts,
    }
    Path(out).write_text(json.dumps(out_doc, separators=(",", ":"), sort_keys=True) + "\n")
    print(f"{len(reports)} reports, {sum(len(v) for v in hunts.values())} hunts, {checked} pools cross-checked, "
          f"{len(split_exceptions)} 75/25 exceptions -> {out}")
    for s, m in moves.items():
        print(s, "cutoff move", quantiles(m))


def P_row(r: list) -> dict:
    kind = {"e": "exact", "p": "party", "r": "residual"}[r[2]]
    return {"points": {"kind": kind, "max": r[3]}, "applicants": r[4], "oddsPct": r[5]}


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
