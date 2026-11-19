"""Backtest Arizona odds: 'last draw' vs a roll-forward projection, per species and residency.
Truth for year Y is the model fitted to year Y's published draw (it reproduces AZGFD's first-choice draw counts by
construction), so the score is the expected Brier: mean over first-choice applicants of p^2 - 2 p q + q, where p is the
prediction and q the fitted year-Y odds at the applicant's points. Hunts are followed across AZGFD's yearly renumbering
with data/az/crosswalk.json.
Roll-forward: first-choice applicants who didn't draw come back with a point; winners leave; the hunt's applicant
total is held and new applicants fill the zero-point level; the bonus pass keeps last year's first-choice bonus
permits and the random pass last year's first-choice draws.
Usage: python3 -I scripts/az_backtest.py data/az/draws.json data/az/crosswalk.json data/az/backtest.json"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from az_model import fit, odds_at, _solve_u

def roll(m):
    lv = sorted(m['f1'])
    p = {L: odds_at(m, L) for L in lv}
    nxt = {}
    for L in lv:
        stay = m['f1'][L] * (1 - p[L])
        nxt[L + 1] = nxt.get(L + 1, 0) + stay
    tot = sum(m['f1'].values())
    nxt[0] = max(tot - sum(nxt.values()), 0)
    # bonus pass: last year's first-choice bonus permits go to the top of the rolled pool
    b1 = sum(m['f1'][L] * m['pb'][L] for L in lv)
    pb = {L: 0.0 for L in nxt}; left = b1
    for L in sorted(nxt, reverse=True):
        if L == 0 or left <= 0: break
        take = min(left, nxt[L]); pb[L] = take / nxt[L] if nxt[L] else 0; left -= take
    d1 = sum(m['f1'][L] * (1 - m['pb'][L]) * (1 - (1 - m['u']) ** (L + 1)) for L in lv)
    f1r = {L: nxt[L] * (1 - pb[L]) for L in nxt}
    u = _solve_u(f1r, min(d1, sum(f1r.values())))
    def f(P):
        b = pb.get(P, 1.0 if P > max(nxt) and b1 > 0 else 0.0)
        return b + (1 - b) * (1 - (1 - u) ** (P + 1))
    return f

def main(dpath, cpath, out):
    D = json.load(open(dpath))['draws']; C = json.load(open(cpath))
    res = {}
    for sp in ('DEER', 'ELK'):
        years = sorted(D[sp])
        for res_ in ('res', 'nr'):
            for y0, y1 in zip(years, years[1:]):
                sc = {'last': 0.0, 'roll': 0.0, 'n': 0}
                for h26, ys in C[sp]['years'].items():
                    a, b = ys.get(y0), ys.get(y1)
                    if a is None or b is None: continue
                    ha, hb = D[sp][y0].get(str(a)), D[sp][y1].get(str(b))
                    if not ha or not hb: continue
                    ma, mb = fit(ha, res_), fit(hb, res_)
                    if ma is None or mb is None: continue
                    rf = roll(ma)
                    for L, n in mb['f1'].items():
                        if n <= 0: continue
                        q = odds_at(mb, L)
                        for k, p in (('last', odds_at(ma, L)), ('roll', rf(L))):
                            sc[k] += n * (p * p - 2 * p * q + q)
                        sc['n'] += n
                if sc['n']:
                    res.setdefault(sp, {}).setdefault(res_, {})[y1] = {'last': round(sc['last'] / sc['n'], 5), 'roll': round(sc['roll'] / sc['n'], 5), 'applicants': sc['n']}
    json.dump(res, open(out, 'w'), indent=1)
    for sp, r in res.items():
        for k, v in r.items():
            print(sp, k, ' '.join(f"{y}: last {x['last']} roll {x['roll']} (n={x['applicants']})" for y, x in sorted(v.items())))

if __name__ == '__main__':
    main(*sys.argv[1:4])
