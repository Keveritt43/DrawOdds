"""Reproduce check: with u and the bonus-pass share fitted to AZGFD's per-hunt first-choice totals, and a per-hunt
second-choice share q fitted to the published second-choice draws, predict permits issued at each point level
(bonus + 1-2 pass, both choices) and compare with the Bonus Point Report, pooled by point band."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from az_model import fit, COL
D = json.load(open(sys.argv[1]))['draws']
for sp in ('DEER', 'ELK'):
    y = max(D[sp])
    for res in ('res', 'nr'):
        band = {}
        for hn, h in D[sp][y].items():
            if int(hn) >= (1800 if sp == 'DEER' else 3800): continue
            m = fit(h, res)
            if m is None: continue
            pp = h['pass12'][res]; d2 = pp[6] if pp and pp[6] is not None else None
            if d2 is None: continue
            # 2nd-choice applicants left after the bonus pass, competing at the same u
            f2r = {L: max(m['f2'][L] - max(m['bon'][L] - m['f1'][L] * m['pb'][L], 0), 0) for L in m['f1']}
            pr = {L: 1 - (1 - m['u']) ** (L + 1) for L in m['f1']}
            base = sum(f2r[L] * pr[L] for L in f2r)
            q = min(1.0, d2 / base) if base > 0 else 0
            for L in m['f1']:
                pred = m['bon'][L] + m['f1'][L] * (1 - m['pb'][L]) * pr[L] + q * f2r[L] * pr[L]
                b = '0' if L == 0 else '1-2' if L <= 2 else '3-5' if L <= 5 else '6-10' if L <= 10 else '11-15' if L <= 15 else '16+'
                a = band.setdefault(b, [0, 0, 0]); a[0] += pred; a[1] += m['b12'][L]; a[2] += m['f1'][L] + m['f2'][L]
        print(sp, y, res, '  '.join(f"{b}: pred {v[0]:.0f} actual {v[1]} of {v[2]}" for b, v in sorted(band.items(), key=lambda kv: int(kv[0].split('-')[0].rstrip('+')))))
