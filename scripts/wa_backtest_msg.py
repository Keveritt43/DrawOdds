"""Backtest Washington moose / sheep / goat odds against WDFW's 2018-2020 per-point drawing tables.

Usage: python3 -I scripts/wa_backtest_msg.py

Each year Y (2019, 2020) is predicted from Y-1's table for the same hunt (same category and name in WDFW's
Regulation service; WDFW renumbers hunts) plus Y's permits: "last" = Y-1's odds at the same points; "roll r" =
scripts/wa_backtest.py's roll forward with retention r and Y-1's application count; "roll-now" uses Y's count
(what the app has for 2021-2025). Brier score per application, x1000, by group (* = once-in-a-lifetime category).
"""
import collections, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wa_backtest import cutoff, roll, brier  # noqa: E402
import wa_build_msg as m  # noqa: E402

hunts, pts, sel, _ = m.load()
g = {}
for k, d in pts.items():
    h = hunts.get(k)
    if h:
        g[k] = ({p: (n, sel[k][p]) for p, n in d.items()}, h)
res = collections.defaultdict(lambda: [0.0, 0.0]); n = collections.Counter()
for (y, num), (truth, h) in g.items():
    prev = [v for (yy, _), v in g.items() if yy == y - 1 and v[1]["category"] == h["category"] and m.norm(v[1]["name"]) == m.norm(h["name"])]
    same = [1 for (yy, _), v in g.items() if yy == y and v[1]["category"] == h["category"] and m.norm(v[1]["name"]) == m.norm(h["name"])]
    if len(prev) != 1 or len(same) != 1:
        continue
    prev = prev[0][0]; s = sum(x for _, x in truth.values())
    if not s:
        continue
    grp = h["species"] + ("*" if h["category"] in m.ONCE else "")
    n[(grp, y)] += 1
    rates = {p: b / a for p, (a, b) in prev.items() if a}
    last = lambda p: rates.get(p, rates[min(rates, key=lambda q: abs(q - p))])
    def add(meth, f):
        b, w = brier(f, truth)
        for gg in (grp, "ALL"):
            res[(meth, gg, y)][0] += b; res[(meth, gg, y)][1] += w
    add("last", last)
    tp, tn = sum(a for a, _ in prev.values()), sum(a for a, _ in truth.values())
    for r in (0.7, 0.85, 1.0):
        for key, tot in (("roll", tp), ("roll-now", tn)):
            u = cutoff(roll(prev, r, tot), s)
            add(f"{key} r={r}", lambda p, u=u: 1 - (1 - u) ** (p * p))
print("hunts compared", dict(sorted(n.items())))
for G in sorted({gg for _, gg, _ in res}):
    print(G)
    for meth in sorted({mm for mm, gg, _ in res if gg == G}, key=lambda x: (x != "last", x)):
        print("  ", meth.ljust(15), *[f"{res[(meth, G, y)][0] / res[(meth, G, y)][1] * 1e3:8.4f}" if res[(meth, G, y)][1] else "       -" for y in (2019, 2020)])
