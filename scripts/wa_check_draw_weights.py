"""Which entry weighting does WDFW's special-permit drawing use?

Usage: python3 -I scripts/wa_check_draw_weights.py data/wa/source

A hunter's chance under "P entries, each a random number, best one counts" is
1 - (1 - u)^w(P), where u is the hunt's cutoff. For each hunt we solve for the u
that reproduces the published number of selected applications, then score each
candidate w(P) by binomial log-likelihood of the selected count at every point
level. P is WDFW's printed "Point Total" (lowest printed level is 1).

The multi-season elk drawing (2019) is the clean test: one hunt, no hunt choices.
The 2017-2018 special-permit tables are noisier (up to four choices per
application share one category-wide queue), so they rank candidates but can't
separate close ones.
"""
import csv, math, sys, collections, os

CANDIDATES = {
    'P^2': lambda p: p * p,
    'P^2+1': lambda p: p * p + 1,
    '(P+1)^2': lambda p: (p + 1) ** 2,
    'P': lambda p: p,
    'flat': lambda p: 1,
}

def cutoff(rows, w):
    target = sum(s for _, n, s in rows)
    lo, hi = 0.0, 1.0
    for _ in range(80):
        u = (lo + hi) / 2
        e = sum(n * (1 - (1 - u) ** w(p)) for p, n, _ in rows)
        lo, hi = (u, hi) if e < target else (lo, u)
    return u

def score(hunts):
    out = {}
    for name, w in CANDIDATES.items():
        ll = chi = 0.0
        for rows in hunts:
            u = cutoff(rows, w)
            for p, n, s in rows:
                pr = min(max(1 - (1 - u) ** w(p), 1e-12), 1 - 1e-12)
                ll += s * math.log(pr) + (n - s) * math.log(1 - pr)
                if n * pr * (1 - pr) >= 1:  # skip cells too small for chi-square
                    chi += (s - n * pr) ** 2 / (n * pr * (1 - pr))
        out[name] = (ll, chi)
    return out

def main(src):
    ms = [[(int(r['point_total']), int(r['applications']), int(r['selected_applications']))
           for r in csv.DictReader(open(os.path.join(src, 'multiseason-elk-2019.csv')))]]
    by = collections.defaultdict(list)
    for r in csv.DictReader(open(os.path.join(src, 'drawing-points-2017-2018.csv'))):
        if not r['applications']:
            continue
        by[(r['year'], r['species'], r['category'], r['hunt'])].append(
            (int(r['point_total']), int(r['applications']), int(r['selected_applications'] or 0)))
    sp = [rows for rows in by.values()
          if 0 < sum(s for *_, s in rows) < sum(n for _, n, _ in rows) and sum(n for _, n, _ in rows) >= 30]
    for label, hunts in (('multi-season elk 2019 (1 hunt)', ms), (f'special permits 2017-18 ({len(sp)} hunts)', sp)):
        print(label)
        for name, (ll, chi) in sorted(score(hunts).items(), key=lambda x: -x[1][0]):
            print(f'  {name:8s} log-lik {ll:11.1f}  chi2 {chi:9.1f}')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'data/wa/source')
