"""Which entry weight fits AZGFD's 1st/2nd-choice pass? Per hunt, residency and year, fit a cut u and a 2nd-choice
share q by maximum likelihood to permits issued in the pass at each point level (BP report: bonus+1-2 minus bonus),
then compare total log-likelihood across weight functions."""
import json, math, sys
d = json.load(open(sys.argv[1]))['draws']
W = {'P+1': lambda L: L + 1, 'flat': lambda L: 1, 'P^2+1': lambda L: L * L + 1, '(P+1)^2': lambda L: (L + 1) ** 2, '2^P': lambda L: 2 ** L}
def ll_hunt(lv, w):
    best = -1e18
    for qi in range(0, 11):
        q = qi / 10
        lo, hi = 1e-9, 1 - 1e-9
        # golden-ish grid on log u
        for k in range(60):
            pass
        bestu = -1e18
        for e in [x / 20 for x in range(-160, 1)]:
            u = 10 ** e
            ll = 0
            for L, n1, n2, k_ in lv:
                n = n1 + q * n2
                if n <= 0: continue
                p = 1 - (1 - u) ** w(L) if u < 1 else 1.0
                p = min(max(p, 1e-9), 1 - 1e-9)
                k2 = min(k_, n)
                ll += k2 * math.log(p) + (n - k2) * math.log(1 - p)
            bestu = max(bestu, ll)
        best = max(best, bestu)
    return best
tot = {k: 0.0 for k in W}; nt = 0
for sp in d:
    for y, hs in d[sp].items():
        for hn, h in hs.items():
            for i, j in ((5, 7), (6, 8)):
                lv = []
                for r in h['rows']:
                    L, f1, f2 = r[0], r[1 + (i == 6)], r[3 + (i == 6)]
                    bon, b12 = r[i], r[j]
                    # applicants left after the bonus pass, at this level, approximated by subtracting its winners
                    rem1 = max(f1 + f2 - bon, 0)
                    lv.append((L, max(f1 - bon, 0) if f1 >= bon else 0, f2 - max(bon - f1, 0), b12 - bon))
                ks = sum(x[3] for x in lv); ns = sum(x[1] + x[2] for x in lv)
                if ks == 0 or ks >= ns or len([x for x in lv if x[1] + x[2] > 0]) < 3: continue
                nt += 1
                for k, w in W.items(): tot[k] += ll_hunt(lv, w)
print('pools', nt)
for k, v in sorted(tot.items(), key=lambda kv: -kv[1]): print(f'{k:8s} {v:12.1f}')
