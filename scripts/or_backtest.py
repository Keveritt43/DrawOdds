#!/usr/bin/env python3
"""Oregon: does the draw model reproduce ODFW's results, and does a projection beat last draw's odds?

Usage: python3 -I scripts/or_backtest.py data/or/source/draws-2021-2026.json data/or/backtest.json

1. Reproduce: for each hunt-year, the odds by points (scripts/or_odds.py last_draw) times the applicants at
   each level must give back ODFW's drawn totals per pool, and the model's random-phase winners' points must
   match ODFW's printed P2 point sum (the test the single-random-number rule passes and a fresh lottery fails).
2. Backtest, per series and residency: predict year Y from year Y-1 only (same hunt number, tags held at Y-1's).
   Truth at each level is the model fitted to year Y's own report. Brier = applicant-weighted mean of
   (p - q)^2 + q(1 - q). Methods: 'last' (Y-1's odds) and 'roll' (scripts/or_odds.py roll_forward with return
   share r; r chosen on 2022-2024 targets, then held out on 2025-2026).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from or_odds import MAX_PTS, last_draw, pool_rows, roll_forward, simulate, solve_t  # noqa: E402

SKIP = {('2021', 'buck', '158'), ('2022', 'buck', '158'), ('2023', 'buck', '158'), ('2024', 'buck', '158')}


def reproduce(draws):
    out = {}
    for key, rep in sorted(draws.items()):
        y, kind = key.split(':')
        tot = {'res': [0, 0.0], 'nr': [0, 0.0]}
        p2 = [0, 0.0]
        for code, h in rep['hunts'].items():
            if (y, kind, code) in SKIP or not h['tags']:
                continue
            od = last_draw(h)
            if not od:
                continue
            for pool, drawn in (('res', h['resDrawn']), ('nr', h['nrDrawn'])):
                if pool not in od:
                    continue
                rows = pool_rows(h, pool)
                tot[pool][0] += drawn or 0
                tot[pool][1] += sum(n * od[pool][min(p, MAX_PTS)] for p, n, _ in rows)
            # random-phase winners' points: model vs ODFW's printed P2 sum, pools combined
            pts = 0.0
            for pool in ('res', 'nr'):
                if pool not in od:
                    continue
                for p, n, d in pool_rows(h, pool):
                    s = d / n
                    pts += p * n * max(0.0, od[pool][min(p, MAX_PTS)] - s)
            if h['ptsP2'] is not None:
                p2[0] += h['ptsP2']
                p2[1] += pts
        out[key] = {'resDrawn': tot['res'][0], 'resModel': round(tot['res'][1], 1), 'nrDrawn': tot['nr'][0],
                    'nrModel': round(tot['nr'][1], 1), 'p2Printed': p2[0], 'p2Model': round(p2[1], 1)}
    return out


# fixed before 2025-2026 were looked at (a 0.1 step tried afterwards is not used: see or-onboarding.md §3)
SHIFTS = (0.25, 0.5, 0.75, 1.0)


def shift(odds, c):
    """Point creep: next year, p points buy what p - c bought last year (linear between levels)."""
    out = []
    for p in range(len(odds)):
        x = p - c
        if x <= 0:
            out.append(odds[0] * (1 - min(1, -x)) if x > -1 else odds[0])
            continue
        i = int(x)
        f = x - i
        hi = odds[min(i + 1, len(odds) - 1)]
        out.append(odds[i] * (1 - f) + hi * f)
    # 0 points: the random phase only, same as last year
    out[0] = odds[0]
    for i in range(1, len(out)):
        out[i] = max(out[i], out[i - 1])
    return out


def truth(h, pool):
    od = last_draw(h)
    if not od or pool not in od:
        return None
    return od[pool]


def brier(pred, q_table, rows):
    s = w = 0.0
    for p, n, _ in rows:
        pp = pred[min(p, MAX_PTS)]
        q = q_table[min(p, MAX_PTS)]
        s += n * ((pp - q) ** 2 + q * (1 - q))
        w += n
    return s, w


def backtest(draws, r_grid=(0.5, 0.6, 0.7, 0.8, 0.9, 1.0)):
    years = sorted({int(k.split(':')[0]) for k in draws})
    res = {}
    for kind in ('buck', 'antlerless', 'elk'):
        for pool in ('res', 'nr'):
            per = {}
            for y in years:
                a, b = draws.get(f'{y - 1}:{kind}'), draws.get(f'{y}:{kind}')
                if not a or not b:
                    continue
                acc = {'last': [0.0, 0.0], **{f'roll{r}': [0.0, 0.0] for r in r_grid}, **{f'shift{c}': [0.0, 0.0] for c in SHIFTS}}
                for code, hb in b['hunts'].items():
                    ha = a['hunts'].get(code)
                    if not ha or (str(y), kind, code) in SKIP or (str(y - 1), kind, code) in SKIP:
                        continue
                    q = truth(hb, pool)
                    last = truth(ha, pool)
                    rows = pool_rows(hb, pool)
                    if q is None or last is None or not rows:
                        continue
                    s, w = brier(last, q, rows)
                    acc['last'][0] += s
                    acc['last'][1] += w
                    tags = (ha['resDrawn'] if pool == 'res' else ha['nrDrawn']) or 0
                    apps_now = sum(n for _, n, _ in pool_rows(ha, pool))
                    for c in SHIFTS:
                        s, w = brier(shift(last, c), q, rows)
                        acc[f'shift{c}'][0] += s
                        acc[f'shift{c}'][1] += w
                    for r in r_grid:
                        nxt = roll_forward(ha, pool, last, r, apps_now)
                        pred = simulate(nxt, tags)
                        s, w = brier(pred, q, rows)
                        acc[f'roll{r}'][0] += s
                        acc[f'roll{r}'][1] += w
                per[y] = {m: (v[0] / v[1] if v[1] else None, v[1]) for m, v in acc.items()}
            res[f'{kind}:{pool}'] = per
    return res


def main(src, dest):
    d = json.loads(Path(src).read_text())['draws']
    rep = reproduce(d)
    bt = backtest(d)
    # method choice: on 2022-2024 targets only, per series and pool; then check 2025-2026
    pick = {}
    for k, per in bt.items():
        sel = [y for y in per if y <= 2024]
        hold = [y for y in per if y >= 2025]

        def score(m, ys):
            num = sum(per[y][m][0] * per[y][m][1] for y in ys if per[y][m][0] is not None)
            den = sum(per[y][m][1] for y in ys if per[y][m][0] is not None)
            return num / den if den else None
        methods = list(next(iter(per.values())).keys())
        best = min((m for m in methods if m != 'last'), key=lambda m: score(m, sel) or 9)
        ship = all(score(best, ys) is not None and score(best, ys) < score('last', ys) for ys in (sel, hold, sel + hold))
        pick[k] = {'best': best, 'sel': {m: score(m, sel) for m in ('last', best)}, 'hold': {m: score(m, hold) for m in ('last', best)},
                   'all': {m: score(m, sel + hold) for m in ('last', best)}, 'ship': ship}
    out = {'reproduce': rep, 'backtest': {k: {str(y): {m: v[0] for m, v in per.items()} for y, per in vv.items()} for k, vv in bt.items()}, 'pick': pick}
    Path(dest).write_text(json.dumps(out, indent=1))
    for k, v in rep.items():
        print(k, v)
    for k, v in pick.items():
        print(k, v['best'], 'ship' if v['ship'] else 'LAST', {kk: {m: round(x, 5) for m, x in vv.items()} for kk, vv in v.items() if isinstance(vv, dict)})


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
