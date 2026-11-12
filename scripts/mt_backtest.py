#!/usr/bin/env python3
"""
Montana draw-odds forecast backtest. Offline and reproducible:  python3 -I scripts/mt_backtest.py

Scored as Colorado and Wyoming are (docs/state-adapter-guide.md §4): Brier = mean((p - drew)^2) over first-choice
applicants, weighted by applicants, each test draw predicted from earlier draws only. A forecast ships only if it
beats the naive baseline "next draw = last draw's odds", which is what the app shows today.

Two systems, scored separately:

1. Nonresident combination licences (data/mt/nr-combo.json), preference points 0..3.
   baseline  last draw's rate at your points (the app's MtComboPointsChart / mtComboOdds)
   mean      the mean of every earlier draw's rate at your points
   cohort    roll the last draw forward: unsuccessful holders come back one point higher at the measured return rate,
             zero-point applicants grow at the measured rate, the same number of licences as the last draw, then
             FWP's rule (75% from the top of the point order, 25% at random among zero-point applicants)

2. Bonus-point drawings (data/mt/draws.json), 2023-2026 only: before 2023 the points column means something else
   (draws.json pointsColumn). Every licence with a numeric quota both years, resident and nonresident pools.
   baseline  last draw's printed rate at your level, carried up and never falling (scripts/mt_build_hunts.py)
   model     FWP's weighted draw (level^2 + 1 chances, no-purchase row 1) solved for last draw's applicants and
             this draw's quota: p(L) = 1 - exp(-w(L) t), with t set so expected winners = the pool's licences
   cohort    as model, but the applicants rolled forward: unsuccessful at L return at L+1 at the measured rate,
             new applicants at level 1 as last draw

Quota: the regulations publish each licence's quota before the drawing, so the bonus "model" uses the drawn year's
quota and splits it between pools by the last draw's shares. The combination quota is not printed per year in what
we hold, so "cohort" uses the last draw's licences issued (the honest forward rule for 2027).
"""
import json, math, os, sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
combo = json.load(open(os.path.join(ROOT, "data/mt/nr-combo.json")))
draws = json.load(open(os.path.join(ROOT, "data/mt/draws.json")))


def brier(rows):
    """rows: (p, apps, drew)"""
    n = sum(a for _, a, _ in rows)
    if not n:
        return None
    return sum(d * (1 - p) ** 2 + (a - d) * p ** 2 for p, a, d in rows) / n


# ---------------------------------------------------------------- combination draw

def rep_levels(levels):
    """FWP prints bands ("2.2 – 3", "0.2 – 1.8"). Give each band the whole point balance most of it holds: a
    band's integers, minus any printed as their own level, largest first. Fractional-only bands (parties) drop."""
    exact = {int(l["min"]) for l in levels if l["min"] == l["max"] and float(l["min"]).is_integer()}
    out = defaultdict(lambda: [0, 0])
    for l in levels:
        ks = [k for k in range(4) if l["min"] <= k <= l["max"] and (l["min"] == l["max"] or k not in exact)]
        if not ks:
            continue
        k = max(ks)
        out[k][0] += l["apps"]
        out[k][1] += l["drawn"]
    return {k: tuple(v) for k, v in out.items()}


def allocate(n, Q):
    """FWP's rule on whole-point counts n[k]: 75% of Q down the point order, 25% at random to zero points."""
    pref, p = 0.75 * Q, {}
    for k in (3, 2, 1):
        a = n.get(k, 0)
        take = min(a, pref)
        p[k] = take / a if a else 1.0
        pref -= take
    z = n.get(0, 0)
    p[0] = min(1.0, (0.25 * Q + pref) / z) if z else 1.0
    return p


def combo_backtest(key):
    lic = next(l for l in combo["licenses"] if l["key"] == key)
    years = sorted(int(y) for y in lic["years"])
    R = {y: rep_levels(lic["years"][str(y)]["levels"]) for y in years}
    rate = lambda y, k: (R[y][k][1] / R[y][k][0]) if k in R[y] and R[y][k][0] else None
    res = []
    for i, y in enumerate(years):
        if i < 2:
            continue
        prev = years[i - 1]
        # return rates measured on earlier pairs only
        ret = defaultdict(list)
        for a, b in zip(years[: i - 1], years[1:i]):
            fail = {k: R[a][k][0] - R[a][k][1] for k in R[a]}
            if fail.get(0):
                ret[1].append(R[b].get(1, (0, 0))[0] / fail[0])
            if fail.get(1):
                ret[2].append(R[b].get(2, (0, 0))[0] / fail[1])
            top = fail.get(2, 0) + fail.get(3, 0)
            if top:
                ret[3].append(R[b].get(3, (0, 0))[0] / top)
            if R[a].get(0, (0,))[0]:
                ret[0].append(R[b].get(0, (0, 0))[0] / R[a][0][0])
        m = lambda k: sum(ret[k]) / len(ret[k]) if ret[k] else 1.0
        fail = {k: R[prev][k][0] - R[prev][k][1] for k in R[prev]}
        n = {0: R[prev].get(0, (0, 0))[0] * m(0), 1: fail.get(0, 0) * m(1), 2: fail.get(1, 0) * m(2),
             3: (fail.get(2, 0) + fail.get(3, 0)) * m(3)}
        Q = sum(v[1] for v in R[prev].values())
        cohort = allocate(n, Q)
        rows = {"baseline": [], "mean": [], "cohort": []}
        for k, (a, d) in R[y].items():
            last = rate(prev, k)
            if last is None:
                continue
            past = [rate(x, k) for x in years[:i] if rate(x, k) is not None]
            rows["baseline"].append((last, a, d))
            rows["mean"].append((sum(past) / len(past), a, d))
            rows["cohort"].append((cohort[k], a, d))
        res.append((y, {m_: brier(r) for m_, r in rows.items()}, sum(a for a, _ in R[y].values())))
    return res


# ---------------------------------------------------------------- bonus-point draws

Y = draws["years"]
BONUS_YEARS = [2023, 2024, 2025, 2026]


def lv(e, pool):
    """[(level, apps, succ, buying)] for a pool; no-purchase row is level 0, buying False."""
    out = []
    for p, a, s in e.get("levels", {}).get(pool, []):
        if p in ("", "0"):
            out.append((0, a, s, False))
        else:
            out.append((int(float(p)), a, s, True))
    return out


def baseline_fn(levels):
    buy = {L: (a, s) for L, a, s, b in levels if b}
    nb = [(a, s) for L, a, s, b in levels if not b]
    nbr = (sum(s for a, s in nb) / sum(a for a, s in nb)) if nb and sum(a for a, s in nb) else None
    if not buy:
        return None
    top, arr, cur, best = max(buy), {}, None, 0.0
    for L in range(1, top + 1):
        if L in buy and buy[L][0]:
            cur = buy[L][1] / buy[L][0]
        best = max(best, cur if cur is not None else 0.0)
        arr[L] = best
    first = arr[min(arr)]

    def f(L, buying):
        if not buying:
            return nbr if nbr is not None else first
        return arr.get(min(L, top), arr[top]) if L >= 1 else first
    return f


def weighted(counts, S):
    """counts: {(L, buying): n}. Successive-sampling approximation of a weighted draw without replacement."""
    w = lambda L, b: (L * L + 1) if b else 1
    total = sum(counts.values())
    if S <= 0:
        return lambda L, b: 0.0
    if S >= total:
        return lambda L, b: 1.0
    lo, hi = 0.0, 1.0
    while sum(n * (1 - math.exp(-w(L, b) * hi)) for (L, b), n in counts.items()) < S:
        hi *= 2
    for _ in range(80):
        t = (lo + hi) / 2
        if sum(n * (1 - math.exp(-w(L, b) * t)) for (L, b), n in counts.items()) < S:
            lo = t
        else:
            hi = t
    t = (lo + hi) / 2
    return lambda L, b: 1 - math.exp(-w(L, b) * t)


def bonus_backtest():
    # measured return rate (unsuccessful at L who come back at L+1), per licence type and pool, by year pair
    ret = defaultdict(dict)
    for a, b in zip(BONUS_YEARS, BONUS_YEARS[1:]):
        num, den = defaultdict(float), defaultdict(float)
        for k, e in Y[str(a)].items():
            e2 = Y[str(b)].get(k)
            if not e2:
                continue
            for pool in ("res", "nr"):
                A = {L: (n, s) for L, n, s, bb in lv(e, pool) if bb}
                B = {L: n for L, n, s, bb in lv(e2, pool) if bb}
                for L, (n, s) in A.items():
                    den[(e["license"], pool)] += n - s
                    num[(e["license"], pool)] += B.get(L + 1, 0)
        for key in den:
            ret[b][key] = num[key] / den[key] if den[key] else 1.0

    out = defaultdict(lambda: defaultdict(list))  # (licence, pool) -> method -> rows ; plus year
    by_year = defaultdict(lambda: defaultdict(list))
    for y in BONUS_YEARS[1:]:
        for k, e in Y[str(y)].items():
            prev = Y[str(y - 1)].get(k)
            if not prev or not isinstance(e["quota"], int) or not isinstance(prev["quota"], int) or not prev["quota"]:
                continue
            for pool in ("res", "nr"):
                cur, last = lv(e, pool), lv(prev, pool)
                f = baseline_fn(last)
                if f is None or not cur:
                    continue
                # licences this pool will hand to first choices: last draw's share of the quota, this draw's quota
                S = prev["pools"][pool]["succ"][0] * e["quota"] / prev["quota"]
                counts = defaultdict(float)
                for L, n, s, b in last:
                    counts[(L, b)] += n
                model = weighted(counts, S)
                # the same model without this draw's quota (what a forecast has before the regulations are out)
                same = weighted(counts, prev["pools"][pool]["succ"][0])
                # cohort: earlier pairs' return rates only
                pairs = [ret[z][(e["license"], pool)] for z in ret if z < y and (e["license"], pool) in ret[z]]
                r = sum(pairs) / len(pairs) if pairs else None
                if r is not None:
                    roll = defaultdict(float)
                    for L, n, s, b in last:
                        if b:
                            roll[(L + 1, True)] += r * (n - s)
                            if L == 1:
                                roll[(1, True)] += n
                        else:
                            roll[(0, False)] += n
                    cohort = weighted(roll, S)
                for L, n, s, b in cur:
                    rec = {"baseline": f(L, b), "model": model(L, b), "sameQuota": same(L, b)}
                    if r is not None:
                        rec["cohort"] = cohort(L, b)
                    for m_, p in rec.items():
                        out[(e["license"], pool)][m_].append((p, n, s))
                        by_year[y][m_].append((p, n, s))
                    # same-set comparison for cohort
                    if r is not None:
                        by_year[y]["baseline@cohort"].append((rec["baseline"], n, s))
                        by_year[y]["model@cohort"].append((rec["model"], n, s))
    return out, by_year


if __name__ == "__main__":
    fmt = lambda v: "-" if v is None else f"{v:.4f}"
    print("Nonresident combination draws (Brier; lower is better)")
    for key in ("biggame-elk", "deer"):
        rs = combo_backtest(key)
        for y, b, n in rs:
            print(f"  {key:12} {y}  baseline {fmt(b['baseline'])}  mean {fmt(b['mean'])}  cohort {fmt(b['cohort'])}  ({n} applicants)")
        for m_ in ("baseline", "mean", "cohort"):
            v = [b[m_] for _, b, _ in rs if b[m_] is not None]
            print(f"  {key:12} mean {m_:8} {fmt(sum(v) / len(v))}")
    out, by_year = bonus_backtest()
    print("\nBonus-point draws by test year (all licence types and pools)")
    for y in sorted(by_year):
        b = {m_: brier(r) for m_, r in by_year[y].items()}
        print(f"  {y}  baseline {fmt(b['baseline'])}  model {fmt(b['model'])}  model, last quota {fmt(b['sameQuota'])}"
              + (f"  | where cohort runs: baseline {fmt(b.get('baseline@cohort'))} model {fmt(b.get('model@cohort'))} cohort {fmt(b.get('cohort'))}" if 'cohort' in b else ""))
    print("\nBonus-point draws by licence type and pool, 2024-2026")
    for (lic, pool), m in sorted(out.items()):
        n = sum(a for _, a, _ in m["baseline"])
        print(f"  {lic:20} {pool:3}  baseline {fmt(brier(m['baseline']))}  model {fmt(brier(m['model']))}  last-quota {fmt(brier(m['sameQuota']))}  cohort {fmt(brier(m['cohort']) if m['cohort'] else None)}  ({n} applicant-draws)")
