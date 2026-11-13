"""Backtest Utah next-draw projections against "last draw" (docs/state-adapter-guide.md §4, docs/states/ut-onboarding.md §5.2).

For each target year T (2023-2026) and every bonus-point hunt (limited-entry deer, elk, pronghorn; bison) and
general buck deer unit (preference points), predict the odds at each point level using only draws before T, then
score against what DWR actually drew at T (first choice, youth rows left out): Brier = mean over applicants of
(outcome - predicted)^2, weighted by applicants at each level.

Methods
  last    the site's current "last draw": the reproducing model run on T-1's applicants and permits.
  cohort  roll T-1's applicants forward: everyone who didn't draw comes back one point higher, scaled by a
          return rate; new applicants enter at 0 points, scaled by a growth rate. Both rates are pooled per species
          and pool from year pairs strictly before T (none before 2022, so T starts at 2023). Permits as in T-1.
          Bonus hunts: the same reproducing model on the projected applicants. General deer: the strict queue.

Run: python3 -I scripts/ut_backtest.py   (writes data/ut/backtest.json)
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from ut_build_hunts import bonus_odds, MAX_PTS  # noqa: E402

D = ROOT.parent / "data" / "ut"
SPECIES = {"DB": "DEER", "EB": "ELK", "PB": "PRONGHORN", "BI": "BISON"}  # other codes: moose, sheep, goat (not scored)


def load():
    """years[Y][kind][code][pool] = {"lv": {p: [apps, drew]}, "M": max-point permits, "R": random permits}"""
    hist = json.load(open(D / "source" / "odds-2021-2025.json"))
    years: dict = defaultdict(lambda: {"bonus": {}, "pref": {}})
    for kind, key in (("bonus", "bonusPoint"), ("pref", "generalBuckDeer")):
        for y, hs in hist[key].items():
            for h in hs:
                for pool in ("res", "nr"):
                    L = (h.get(pool) or {}).get("levels") or []
                    if not L:
                        continue
                    lv = {l[0]: [l[1], l[4]] for l in L if l[1]}
                    years[int(y)][kind].setdefault(h["code"], {})[pool] = {
                        "lv": lv, "M": sum(l[2] for l in L), "R": sum(l[3] for l in L)}
    o26 = json.load(open(D / "source" / "odds-2026.json"))
    F = o26["oddsFields"]
    for sid, kind in (("8", "bonus"), ("9", "bonus"), ("10", "bonus"), ("12", "bonus"), ("5", "pref")):
        for h in o26["data"][sid]:
            rows = [dict(zip(F, r)) for r in h["odds"]]
            for pool, rt in (("res", 1), ("nr", 2)):
                lv, M, R = {}, 0, 0
                for r in rows:
                    if r["ResidencyTypeID"] != rt or r["IsYouth"]:
                        continue
                    a = lv.setdefault(r["Point"], [0, 0])
                    a[0] += r["ParticipantCount"]
                    a[1] += r["SuccessfulCount"]
                    M += r["SuccessfulByMaxPointRoundCount"]
                    R += r["SuccessfulByRegularRoundCount"]
                lv = {p: v for p, v in lv.items() if v[0]}
                if lv:
                    years[2026][kind].setdefault(h["HuntCode"], {})[pool] = {"lv": lv, "M": M, "R": R}
    return years


def queue_odds(lv, permits):
    """Strict preference queue: permits go to the most points first."""
    out, left = {}, permits
    for p in sorted(lv, reverse=True):
        n = lv[p]
        take = min(left, n)
        out[p] = take / n if n else 0.0
        left -= take
    arr, top = [], max(lv) if lv else 0
    for N in range(MAX_PTS + 1):
        if N in out:
            v = out[N]
        elif N > top:
            v = 1.0 if permits > 0 else 0.0
        else:  # nobody at N: drawn only if everyone above-or-at N drew
            v = 1.0 if all(out[p] >= 1 for p in out if p >= N) and permits > 0 else 0.0
        arr.append(v)
    for i in range(1, len(arr)):
        arr[i] = max(arr[i], arr[i - 1])
    return arr


def predict(kind, lv, M, R):
    apps = {p: v[0] for p, v in lv.items() if v[0] > 0.5}
    if not apps:
        return [0.0] * (MAX_PTS + 1)
    if kind == "bonus":
        return bonus_odds(apps, M, R)
    return queue_odds(apps, M + R)


def variants(kind, lv, M, R, ret, grow):
    """Every method's odds[0..MAX_PTS] for the next draw, from one draw's {points: [applicants, drew]} and permits.
    The site's projection (scripts/ut_build_hunts.py) calls this, so what ships is what was backtested."""
    rolled = {0: [lv.get(0, [0, 0])[0] * grow, 0]}
    for p, (a, d) in lv.items():
        rolled[p + 1] = [(a - d) * ret, 0]
    # shape: the rolled point mix, scaled back to last draw's total applicants (demand flat)
    tot_prev = sum(a for a, _ in lv.values())
    tot_roll = sum(a for a, _ in rolled.values()) or 1
    shaped = {p: [a * tot_prev / tot_roll, 0] for p, (a, _) in rolled.items()}
    last = predict(kind, lv, M, R)
    coh = predict(kind, rolled, M, R)
    return {"last": last, "cohort": coh, "shape": predict(kind, shaped, M, R), "blend": [(x + y) / 2 for x, y in zip(last, coh)]}


METHODS = ("cohort", "shape", "blend")
PICK_YEARS, HELD_OUT = ("2023", "2024", "2025"), "2026"


def choose(result):
    """The rule, fixed before looking at 2026: per species and residency pool, take the method with the lowest mean
    Brier over 2023-2025; ship it only if it also beats "last" on 2026 (held out) and over all four years.
    Returns {"SPECIES:pool": method or None}."""
    out = {}
    for k in result["bySpecies"]:
        if ":" not in k or k.startswith("OTHER"):
            continue
        yrs = [result["years"][y][k] for y in PICK_YEARS if k in result["years"][y]]
        if not yrs or k not in result["years"].get(HELD_OUT, {}):
            out[k] = None
            continue
        m = min(METHODS, key=lambda m: sum(y[m] for y in yrs) / len(yrs))
        held, allb = result["years"][HELD_OUT][k], result["bySpecies"][k]
        out[k] = m if held[m] < held["last"] and allb[m] < allb["last"] else None
    return out


def chosen():
    """The shipped choice, read from data/ut/backtest.json (scripts/ut_build_hunts.py uses this)."""
    return json.load(open(D / "backtest.json"))["chosen"]


def species_of(kind, code):
    return "GEN_DEER" if kind == "pref" else SPECIES.get(code[:2], "OTHER")


def rates(years, kind, T):
    """Return and growth rates per (species, pool), pooled over year pairs (y-1, y) with y < T."""
    num = defaultdict(lambda: [0.0, 0.0, 0.0, 0.0])  # returning seen, returning expected, new seen, new prior
    for y in range(2022, T):
        for code, pools in years[y][kind].items():
            prev = years[y - 1][kind].get(code)
            if not prev:
                continue
            for pool, cur in pools.items():
                pv = prev.get(pool)
                if not pv:
                    continue
                k = (species_of(kind, code), pool)
                num[k][0] += sum(a for p, (a, _) in cur["lv"].items() if p >= 1)
                num[k][1] += sum(a - d for a, d in pv["lv"].values())
                num[k][2] += cur["lv"].get(0, [0, 0])[0]
                num[k][3] += pv["lv"].get(0, [0, 0])[0]
    return {k: (v[0] / v[1] if v[1] else 1.0, v[2] / v[3] if v[3] else 1.0) for k, v in num.items()}


def main() -> None:
    years = load()
    out = {"method": __doc__.split("Methods")[1].split("Run:")[0].strip(), "years": {}, "bySpecies": {}}
    tot = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0]))  # [species][method] = [brier sum, apps, |err| sum]
    for T in (2023, 2024, 2025, 2026):
        yr = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0, 0.0]))
        for kind in ("bonus", "pref"):
            rr = rates(years, kind, T)
            for code, pools in years[T][kind].items():
                prev = years[T - 1][kind].get(code)
                if not prev:
                    continue
                sp = species_of(kind, code)
                for pool, cur in pools.items():
                    pv = prev.get(pool)
                    if not pv:
                        continue
                    preds = variants(kind, pv["lv"], pv["M"], pv["R"], *rr.get((sp, pool), (1.0, 1.0)))
                    for p, (a, d) in cur["lv"].items():
                        rate = d / a
                        for m, arr in preds.items():
                            q = arr[min(p, MAX_PTS)]
                            b = a * (rate * (1 - q) ** 2 + (1 - rate) * q ** 2)
                            for bucket in (yr[sp][m], yr["ALL"][m], yr[f"{sp}:{pool}"][m], tot[sp][m], tot["ALL"][m], tot[f"{sp}:{pool}"][m]):
                                bucket[0] += b
                                bucket[1] += a
                                bucket[2] += abs(d - a * q)
        out["years"][T] = {sp: {m: round(v[0] / v[1], 5) for m, v in ms.items()} | {"applicants": int(ms["last"][1])} for sp, ms in yr.items()}
    out["bySpecies"] = {sp: {m: round(v[0] / v[1], 5) for m, v in ms.items()} | {
        "applicants": int(ms["last"][1]),
        **{f"permitError_{m}": round(v[2]) for m, v in ms.items()}} for sp, ms in tot.items()}
    out["years"] = {str(k): v for k, v in out["years"].items()}
    out["rule"] = choose.__doc__.strip()
    out["chosen"] = choose(out)
    (D / "backtest.json").write_text(json.dumps(out, indent=1) + "\n")
    print("chosen", out["chosen"])
    for T, v in out["years"].items():
        print(T, {sp: {m: x[m] for m in ("last", "cohort", "shape", "blend")} for sp, x in v.items() if not sp.startswith("OTHER") and ":" not in sp})
    print("all years", json.dumps(out["bySpecies"], indent=1))


if __name__ == "__main__":
    main()
