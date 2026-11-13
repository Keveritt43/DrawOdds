"""Backtest Washington special-permit odds against WDFW's published draws.

Usage: python3 -I scripts/wa_backtest.py <wa-drawing-points-2018-2020.csv>

Truth: WDFW's per-hunt tables of applications and selected applications at
every point level (2018, 2019, 2020). Each method predicts year Y's odds at
every point level for each hunt using only year Y-1 data plus things known
before Y's drawing (the hunt's permit quota, and for the "nowcast" variant
Y's total applications, which WDFW publishes afterwards and which is what the
app has for 2021-2025).

Methods
  last      year Y-1's selected/applications at the same point level
            (nearest observed level when Y-1 had none)
  roll      roll Y-1's point mix forward (unselected applications gain a
            point and stay with probability r, selected ones leave, new
            applications enter at P=1 to make up the total), then solve the
            P^2 cutoff so expected selections = Y's permits
  roll-now  as roll, but the total is Y's actual application count
Brier score per application (lower is better).
"""
import csv, sys, collections

MAIN = {'Quality Deer', 'Buck Deer', 'Antlerless Deer', 'Antlerless', 'Second Deer', 'Quality Elk', 'Bull Elk',
        'Antlerless Elk', 'Multiseason Deer', 'Multiseason Elk', 'Quality'}

def load(path):
    h = collections.defaultdict(dict)
    meta = {}
    for r in csv.DictReader(open(path)):
        k = (int(r['year']), r['species'], int(r['hunt']))
        p = int(r['point_total'])
        n, s = int(r['applications']), int(r['selected_applications'])
        a = h[k].get(p, (0, 0))
        h[k][p] = (a[0] + n, a[1] + s)
        meta[k] = (r['category'], int(r['permits_awarded']), r['hunt_name'])
    return h, meta

def cutoff(dist, target):
    if target <= 0:
        return 0.0
    if target >= sum(dist.values()):
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(70):
        u = (lo + hi) / 2
        e = sum(n * (1 - (1 - u) ** (p * p)) for p, n in dist.items())
        lo, hi = (u, hi) if e < target else (lo, u)
    return (lo + hi) / 2

def roll(prev, r, total):
    nxt = collections.Counter()
    for p, (n, s) in prev.items():
        nxt[p + 1] += r * (n - s)
    kept = sum(nxt.values())
    if total > kept:
        nxt[1] += total - kept
    else:
        f = total / kept if kept else 0
        nxt = collections.Counter({p: v * f for p, v in nxt.items()})
    return nxt

def brier(pred, truth):
    b = w = 0.0
    for p, (n, s) in truth.items():
        q = pred(p)
        b += s * (1 - q) ** 2 + (n - s) * q * q
        w += n
    return b, w

def run(path, r_values=(0.7, 0.8, 0.9, 1.0)):
    h, meta = load(path)
    res = collections.defaultdict(lambda: [0.0, 0.0])
    for (y, sp, hunt), truth in h.items():
        prevk = (y - 1, sp, hunt)
        if prevk not in h:
            continue
        cat, permits, name = meta[(y, sp, hunt)]
        if cat not in MAIN or meta[prevk][2] != name:
            continue
        prev = h[prevk]
        tot_prev = sum(n for n, _ in prev.values())
        tot_now = sum(n for n, _ in truth.values())
        rates = {p: s / n for p, (n, s) in prev.items() if n}
        def last(p):
            if p in rates:
                return rates[p]
            k = min(rates, key=lambda q: abs(q - p))
            return rates[k]
        for key, f in (('last', last),):
            b, w = brier(f, truth)
            res[(key, y)][0] += b; res[(key, y)][1] += w
        for r in r_values:
            for key, tot in (('roll', tot_prev), ('roll-now', tot_now)):
                dist = roll(prev, r, tot)
                u = cutoff(dist, permits)
                f = lambda p, u=u: 1 - (1 - u) ** (p * p)
                b, w = brier(f, truth)
                res[(f'{key} r={r}', y)][0] += b; res[(f'{key} r={r}', y)][1] += w
    years = sorted({y for _, y in res})
    print('method'.ljust(18), *[str(y).rjust(9) for y in years])
    for m in sorted({m for m, _ in res}, key=lambda m: (m != 'last', m)):
        print(m.ljust(18), *[f'{res[(m, y)][0] / res[(m, y)][1]:9.5f}' if res[(m, y)][1] else '        -' for y in years])



def drift(path, permits_json, r=1.0):
    """Roll each 2020 hunt forward to 2021-2025 with no point tables, using each
    year's published applications and permits (pamphlets), and compare the
    model's average points of the drawn applications with the average winner
    points WDFW prints a year later. Rows join on hunt number and name."""
    import json, statistics
    h, meta = load(path)
    rows = json.load(open(permits_json))['rows']
    quota = {(x['year'], x['choice'], x['name'].lower()): x['permits'] for x in rows}
    # the pamphlet for year Y+1 prints year Y's applications and average winner points for the
    # hunt under its Y+1 number and name; key them by Y with the Y+1 name
    pub = {(x['prior_year'], x['choice'], x['name'].lower()): (x['prior_apps'], x['prior_avg_points'])
           for x in rows if x['prior_apps'] is not None and x['prior_avg_points'] is not None}
    errs = collections.defaultdict(list)
    for (y, sp, hunt), truth in h.items():
        if y != 2020 or meta[(y, sp, hunt)][0] not in MAIN:
            continue
        prev = dict(truth)
        # year-0 reference: model average with the exact 2020 point mix
        tot0 = sum(n for n, _ in truth.values()); sel0 = sum(s for _, s in truth.values())
        if sel0:
            u0 = cutoff({p: n for p, (n, s) in truth.items()}, sel0)
            m0 = {p: n * (1 - (1 - u0) ** (p * p)) for p, (n, s) in truth.items()}
            errs[2020].append(sum(p * v for p, v in m0.items()) / sum(m0.values())
                              - sum(p * s for p, (n, s) in truth.items()) / sel0)
        # WDFW links 2020 to 2021 by hunt number (2021 pamphlet); later years must keep the 2021 name
        name = next((x['name'].lower() for x in rows if x['year'] == 2021 and x['choice'] == hunt
                     and x['species'] == sp), None)
        if name is None:
            continue
        for yr in range(2021, 2026):
            k = (yr, hunt, name)
            if k not in pub or k not in quota or not quota[k]:
                break
            apps, avg_pub = pub[k]
            dist = roll(prev, r, apps)
            u = cutoff(dist, quota[k])
            sel = {p: n * (1 - (1 - u) ** (p * p)) for p, n in dist.items()}
            tot = sum(sel.values())
            if tot <= 0:
                break
            avg = sum(p * v for p, v in sel.items()) / tot
            errs[yr].append(avg - avg_pub)
            prev = {p: (dist[p], sel[p]) for p in dist}
    for yr in sorted(errs):
        e = errs[yr]
        print(yr, 'hunts', len(e), 'mean error', round(statistics.mean(e), 2), 'mean |error|',
              round(statistics.mean(abs(x) for x in e), 2), 'within 1 pt', f'{sum(abs(x) <= 1 for x in e) / len(e):.0%}')


def anchored(prev, total, permits, avg_target):
    """Roll forward, choosing the retention r in [0, 1] so the drawn
    applications' average points match the published average (bisection on
    r; a higher r keeps more high-point applicants, raising the average)."""
    def model(r):
        dist = roll(prev, r, total)
        u = cutoff(dist, permits)
        sel = {p: n * (1 - (1 - u) ** (p * p)) for p, n in dist.items()}
        t = sum(sel.values())
        return dist, u, (sum(p * v for p, v in sel.items()) / t if t else 0)
    lo, hi = 0.0, 1.0
    dlo, dhi = model(lo), model(hi)
    if avg_target <= dlo[2]:
        return dlo
    if avg_target >= dhi[2]:
        return dhi
    for _ in range(30):
        mid = (lo + hi) / 2
        dm = model(mid)
        if dm[2] < avg_target:
            lo = mid
        else:
            hi = mid
    return model((lo + hi) / 2)


def run_anchored(path):
    h, meta = load(path)
    res = collections.defaultdict(lambda: [0.0, 0.0])
    for (y, sp, hunt), truth in h.items():
        prevk = (y - 1, sp, hunt)
        if prevk not in h:
            continue
        cat, permits, name = meta[(y, sp, hunt)]
        if cat not in MAIN or meta[prevk][2] != name:
            continue
        sel = sum(s for _, s in truth.values())
        if not sel:
            continue
        avg = round(sum(p * s for p, (n, s) in truth.items()) / sel)  # WDFW prints whole points
        tot = sum(n for n, _ in truth.values())
        dist, u, _ = anchored(h[prevk], tot, permits, avg)
        b, w = brier(lambda p: 1 - (1 - u) ** (p * p), truth)
        res[y][0] += b; res[y][1] += w
    for y in sorted(res):
        print('anchored', y, f'{res[y][0] / res[y][1]:.5f}')


if __name__ == '__main__':
    run(sys.argv[1])
    run_anchored(sys.argv[1])
    if len(sys.argv) > 2:
        drift(sys.argv[1], sys.argv[2])
