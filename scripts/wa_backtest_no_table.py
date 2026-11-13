"""65+ has no point tables. Test candidate seeds on categories that do (Disabled, Master Hunter, Youth):
   flat   = permits / applications for everyone (no point effect)
   proxy  = the species' pooled Antlerless point mix from the year before, scaled to the hunt's applications
   pooledOwnCat = the category's own pooled mix (what the builder does for hunts with no table) -- not available for 65+
Scored on the hunt's true table, Brier per application."""
import sys, collections
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wa_backtest import load, cutoff, brier
h, meta = load(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'wa', 'source', 'drawing-points-2018-2020.csv'))
def pool(year, sp, cats):
    d = collections.Counter()
    for k, t in h.items():
        if k[0] == year and k[1] == sp and meta[k][0] in cats:
            for p, (n, s) in t.items(): d[p] += n
    return d
ANTL = {'Antlerless Deer', 'Antlerless', 'Antlerless Elk'}
TEST = {'Deer Disabled', 'Elk Disabled', 'Deer Master Hunter', 'Elk Master Hunter', 'Master Hunter', 'Deer Youth', 'Elk Youth', 'Youth'}
res = collections.defaultdict(lambda: [0.0, 0.0])
for k, t in h.items():
    y, sp, _ = k; cat, permits, _ = meta[k]
    if cat not in TEST or y == 2018: continue
    apps = sum(n for n, _ in t.values())
    if not apps or not permits: continue
    truth = {p: v for p, v in t.items()}
    flat = min(1.0, permits / apps)
    b, w = brier(lambda p: flat, truth); res['flat'][0] += b; res['flat'][1] += w
    for name, cats in (('proxy antlerless', ANTL), ('own category pool', {cat})):
        src = pool(y - 1, sp, cats)
        if not src: continue
        tot = sum(src.values()); d = {p: n * apps / tot for p, n in src.items()}
        u = cutoff(d, permits); f = lambda p, u=u: 1 - (1 - u) ** (p * p)
        b, w = brier(f, truth); res[name][0] += b; res[name][1] += w
for m, (b, w) in res.items(): print(f'{m:20s} {b / w:.5f}  ({w:.0f} applications)')
