"""Roll-forward check on the owner's 2017-2018 workbook tables: roll each 2017 hunt one year, score on 2018.
Usage: python3 -I scripts/wa_backtest_2017.py [r]   (r = share of unselected applications that return; default 1.0)"""
import csv, collections, sys
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wa_backtest import cutoff, roll, brier
R = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
rows = list(csv.DictReader(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'wa', 'source', 'drawing-points-2017-2018.csv'))))
h = collections.defaultdict(lambda: collections.defaultdict(lambda: [0, 0])); meta = {}
for r in rows:
    if r['applications'] == '' : continue
    k = (int(r['year']), r['species'], r['hunt_name'], int(r['hunt']))
    p = int(r['point_total']); a = h[k][p]; a[0] += int(r['applications']); a[1] += int(r['selected_applications'])
    meta[k] = int(r['permits_awarded'] or 0)
# pair 2017 -> 2018 by species+name, only when the name is unique in both years
def groups(y):
    c = collections.defaultdict(list)
    for k in h:
        if k[0] == y: c[(k[1], k[2])].append(k)
    return c
g17, g18 = groups(2017), groups(2018)
i17, i18 = {}, {}
for nm, ks in g18.items():
    for b in ks:
        tb = sum(v[0] for v in h[b].values())
        c = [a for a in g17.get(nm, []) if meta[a] == meta[b]]
        if not c: continue
        a = min(c, key=lambda a: abs(sum(v[0] for v in h[a].values()) / tb - 1))
        if abs(sum(v[0] for v in h[a].values()) / tb - 1) < 0.3:
            i17[(nm, b[3])] = a; i18[(nm, b[3])] = b
res = collections.defaultdict(lambda: [0.0, 0.0]); n = 0
focus = []
for name, k18 in i18.items():
    k17 = i17.get(name)
    if not k17 or not meta[k18]: continue
    prev = {p: tuple(v) for p, v in h[k17].items()}; truth = {p: tuple(v) for p, v in h[k18].items()}
    if sum(s for _, s in prev.values()) == 0: continue
    n += 1
    rates = {p: s / a for p, (a, s) in prev.items() if a}
    last = lambda p: rates.get(p, rates[min(rates, key=lambda q: abs(q - p))])
    b, w = brier(last, truth); res['last'][0] += b; res['last'][1] += w
    tot_prev = sum(a for a, _ in prev.values()); tot_now = sum(a for a, _ in truth.values())
    for key, tot in (('roll', tot_prev), ('roll-now', tot_now)):
        u = cutoff(roll(prev, R, tot), meta[k18]); f = lambda p, u=u: 1 - (1 - u) ** (p * p)
        b, w = brier(f, truth); res[key][0] += b; res[key][1] += w
    if tot_now > 1500: focus.append((name, k17, k18, prev, truth))
print('hunt pairs 2017->2018:', n)
for m, (b, w) in res.items(): print(f'  {m:9s} Brier {b / w:.5f}')
for name, k17, k18, prev, truth in sorted(focus, key=lambda x: -sum(a for a, _ in x[4].values())):
    rp = roll(prev, 1.0, sum(a for a, _ in truth.values()))
    top17 = max(prev); top18 = max(truth)
    hi = lambda d, t: sum((v[0] if isinstance(v, tuple) else v) for p, v in d.items() if p >= t)
    print(f'\n{name[0][1]} ({name[0][0]}) {k17[3]}->{k18[3]} permits {meta[k18]} apps {sum(a for a,_ in prev.values())}->{sum(a for a,_ in truth.values())}')
    for t in (10, 15, 20):
        print(f'   apps with >= {t} pts: 2017 {hi(prev,t):5.0f}  rolled {hi(rp,t):6.0f}  actual 2018 {hi(truth,t):5.0f}')
