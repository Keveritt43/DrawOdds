"""
Nevada draw-rule check and projection backtest -> data/nv/backtest.json.   python3 -I scripts/nv_backtest.py

1. Rule: for every 2022-2025 deer/elk hunt table with a partial first-choice draw, fit one cut per hunt under each
   candidate entries function and compare total log-likelihood. NDOW's FAQ says points² + 1; the data agree.
2. Projection: predict each draw from the one (or two) before only, scored with Brier over first-choice applicants, per
   residency, against the naive "last draw's odds at your points". The projection rolls the last draw forward:
   unsuccessful applicants return with a point, winners return at zero, total applicants and first-choice tags held.
"""
import collections, gzip, json, math, re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
b = json.load(gzip.open(ROOT / "data/nv/source/ndow-bundle-2026-11-17.json.gz"))
H = []
for f in b["BP"]:
    yr = int(re.findall(r"20\d\d", f["file"].split("/")[-1])[-1])
    for h in f["hunts"]:
        t = h["title"].replace(" Application", "")
        H.append({"year": yr, "key": (t, h["weapon"].strip(), re.sub(r"\s+", "", h["units"]), h["season"][:6]),
                  "lv": [(r[0], r[6], r[1]) for r in h["rows"] if r[6] > 0], "nr": t.startswith("NR ")})
def ll_fit(lv, w):
    S = sum(d for _, _, d in lv); A = sum(a for _, a, _ in lv)
    if S == 0 or S == A: return None
    def ll(c):
        L = 0
        for p, a, d in lv:
            q = min(max(1 - (1 - c) ** w(p), 1e-12), 1 - 1e-12); L += d * math.log(q) + (a - d) * math.log(1 - q)
        return L
    lo, hi = 1e-12, 1 - 1e-12
    for _ in range(100):
        m1, m2 = lo + (hi - lo) / 3, hi - (hi - lo) / 3
        if ll(m1) < ll(m2): lo = m1
        else: hi = m2
    return ll((lo + hi) / 2)
FNS = {"P^2+1 (NDOW FAQ)": lambda p: p * p + 1, "(P+1)^2": lambda p: (p + 1) ** 2, "P+1": lambda p: p + 1, "P^3+1": lambda p: p ** 3 + 1, "flat": lambda p: 1}
rule, n = collections.Counter(), 0
for h in H:
    r = {k: ll_fit(h["lv"], f) for k, f in FNS.items()}
    if any(v is None for v in r.values()): continue
    n += 1
    for k, v in r.items(): rule[k] += v
expo = {}
for a in (1.8, 1.9, 2.0, 2.1, 2.2):
    expo[str(a)] = round(sum(ll_fit(h["lv"], lambda p: p ** a + 1) or 0 for h in H), 1)

w = lambda p: p * p + 1
odds = lambda c, p: 1 - (1 - c) ** w(p)
def solve(d, S):
    tot = sum(d.values())
    if S <= 0: return 0.0
    if S >= tot: return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(100):
        m = (lo + hi) / 2
        if sum(a * odds(m, p) for p, a in d.items()) < S: lo = m
        else: hi = m
    return (lo + hi) / 2
def roll(d, c):
    new = collections.Counter(); tot = sum(d.values())
    for p, a in d.items():
        win = a * odds(c, p); new[p + 1] += a - win; new[0] += win
    return new
by = collections.defaultdict(dict)
for h in H: by[h["key"][:3]][h["year"]] = h
def score(Y, step, nr):
    agg = {"naive": [0.0, 0], "roll": [0.0, 0]}
    for k, ys in by.items():
        if Y not in ys or Y - step not in ys or ys[Y]["nr"] != nr: continue
        t0, t1 = ys[Y - step]["lv"], ys[Y]["lv"]
        if not t0 or not t1: continue
        d0 = {p: a for p, a, _ in t0}; S0 = sum(x for _, _, x in t0); c0 = solve(d0, S0)
        d, c = d0, c0
        for _ in range(step): d = roll(d, c); c = solve(d, S0)
        for m, cc in (("naive", c0), ("roll", c)):
            for p, a, s in t1:
                q = odds(cc, p); agg[m][0] += s * (1 - q) ** 2 + (a - s) * q * q; agg[m][1] += a
    return {m: round(v[0] / v[1], 5) for m, v in agg.items()} | {"applicants": agg["naive"][1]}
bt = {pool: {f"{Y}": score(Y, 1, pool == "nr") for Y in (2023, 2024, 2025)} | {f"{Y} from {Y-2}": score(Y, 2, pool == "nr") for Y in (2024, 2025)} for pool in ("res", "nr")}
out = {"rule": {"hunts": n, "logLik": {k: round(v, 1) for k, v in rule.most_common()}, "exponentScan": expo}, "backtest": bt,
       "decision": "ship the 2025 draw (last draw) only: the roll-forward beat it in some years and pools and lost in others (res 2024, nr 2025, res two-step), so no projection passes the rule in docs/state-adapter-guide.md §4"}
(ROOT / "data/nv/backtest.json").write_text(json.dumps(out, indent=1) + "\n")
print(json.dumps(out, indent=1))
