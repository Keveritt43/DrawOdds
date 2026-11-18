#!/usr/bin/env python3
"""Backtest NM first-choice draw odds predictions, per pool (Brier, applicant-weighted).

Usage: python3 -I scripts/nm_backtest.py data/nm/draws.json data/nm/backtest.json

Methods compared for year Y, using only years before Y with the same hunt code:
  last   - last draw's first-choice odds (the baseline)
  pool2  - pooled last 2 draws: sum drawn / sum applicants
  pool3  - pooled last 3 draws
  shrink - last draw shrunk toward the pooled 3-year rate by applicant count
Hunt codes were renumbered for 2023, so 2023 has no history and isn't scored.
"""
import json, sys

def rate(h, p):
    a = h['applicants'][p][0]; d = h['drawn'][p][0]
    return (min(d, a), a) if a > 0 else None

def predict(hist, p, method):
    obs = [rate(h, p) for h in hist]
    obs = [o for o in obs if o]
    if not obs: return None
    if method == 'last': d, a = obs[-1]; return d / a
    if method in ('pool2', 'pool3'):
        k = int(method[-1]); sel = obs[-k:]
        return sum(d for d, _ in sel) / sum(a for _, a in sel)
    if method == 'shrink':
        d, a = obs[-1]; sel = obs[-3:]
        prior = sum(x for x, _ in sel) / sum(y for _, y in sel)
        w = a / (a + 20.0)
        return w * d / a + (1 - w) * prior

def main(src, dst):
    years = json.load(open(src))['years']
    ys = sorted(years)
    methods = ['last', 'pool2', 'pool3', 'shrink']
    res = {}
    for p in ('res', 'nr', 'out'):
        for y in ys:
            if y in ('2019', '2023'): continue
            prior = [yy for yy in ys if yy < y and (yy >= '2023') == (y >= '2023')]
            tot = {m: [0.0, 0] for m in methods}
            for code, h in years[y].items():
                r = rate(h, p)
                if not r: continue
                hist = [years[yy][code] for yy in prior if code in years[yy]]
                preds = {m: predict(hist, p, m) for m in methods}
                if any(v is None for v in preds.values()): continue
                d, a = r
                for m, q in preds.items():
                    tot[m][0] += d * (1 - q) ** 2 + (a - d) * q ** 2
                    tot[m][1] += a
            res.setdefault(p, {})[y] = {m: round(s / n, 5) if n else None for m, (s, n) in tot.items()} | {'applicants': tot['last'][1]}
    json.dump(res, open(dst, 'w'), indent=1)
    for p, by in res.items():
        print(p)
        for y, v in by.items(): print(' ', y, v)

if __name__ == '__main__':
    main(*sys.argv[1:3])
