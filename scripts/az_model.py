"""Arizona draw model (AZGFD 'Draw Process' page, checked against the reports in docs/states/az-onboarding.md).

For a first-choice applicant with P group bonus points (bonus + loyalty + hunter education points):
  bonus pass   pb(P): applications with points, highest first, take up to 20% of the permits (1st then 2nd choice).
               Above the lowest point level that drew, every first choice drew; at that level a share s did.
  1st/2nd pass pr(P) = 1 - (1 - u)^(P + 1): applications are read in order of their lowest random number, and an
               application with P points holds P + 1 numbers. u is the number at which the hunt's permits ran out,
               solved so that the expected first-choice draws match AZGFD's published count for the pass.
  odds(P) = pb + (1 - pb) * pr.
Residents and nonresidents are solved separately (the 10% nonresident cap gives nonresidents their own u when it binds).
Rows: [pts, f1Res, f1Nr, f2Res, f2Nr, bonusRes, bonusNr, b12Res, b12Nr] (permits issued in the bonus pass, and in the
bonus + 1-2 passes together, to both choices)."""
from __future__ import annotations
COL = {'res': (1, 3, 5, 7), 'nr': (2, 4, 6, 8)}
Q2 = 0.5  # share of 2nd-choice applicants still unplaced when they reach the hunt; used only where AZGFD's pass report is missing

def _solve_u(f1r, target):
    tot = sum(f1r.values())
    if target <= 0 or tot <= 0: return 0.0
    if target >= tot - 1e-9: return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(80):
        m = (lo + hi) / 2
        v = sum(n * (1 - (1 - m) ** (L + 1)) for L, n in f1r.items())
        lo, hi = (m, hi) if v < target else (lo, m)
    return (lo + hi) / 2

def fit(h: dict, res: str):
    """Fit one hunt and residency. Returns dict(pb={L: p}, u, s, cut, f1, f2) or None when nobody applied."""
    i1, i2, ib, i12 = COL[res]
    rows = h['rows']
    f1 = {r[0]: r[i1] for r in rows}; f2 = {r[0]: r[i2] for r in rows}
    bon = {r[0]: r[ib] for r in rows}; b12 = {r[0]: r[i12] for r in rows}
    if sum(f1.values()) == 0: return None
    bp = (h.get('bonus') or {}).get(res); pp = (h.get('pass12') or {}).get(res)
    lv = sorted(f1)
    drew = [L for L in lv if L >= 1 and bon[L] > 0]
    pb = {L: 0.0 for L in lv}; cut = None; s = 0.0
    if drew:
        cut = min(drew)
        for L in lv:
            if L > cut: pb[L] = 1.0 if f1[L] <= bon[L] or f1[L] == 0 else bon[L] / f1[L]
        above = sum(f1[L] * pb[L] for L in lv if L > cut)
        d1b = bp[5] if bp and bp[5] is not None else None
        if d1b is not None and f1[cut] > 0:
            s = min(1.0, max(0.0, (d1b - above) / f1[cut]))
        elif f1[cut] + f2[cut] > 0:
            s = min(1.0, bon[cut] / (f1[cut] + Q2 * f2[cut]))
        pb[cut] = s
    f1r = {L: f1[L] * (1 - pb[L]) for L in lv}
    if pp and pp[5] is not None:
        d1 = pp[5]
    else:  # no pass report (2021-2022 elk): split the pass's draws by applicants left at each level
        d1 = 0.0
        for L in lv:
            iss = max(b12[L] - bon[L], 0)
            f2r = max(f2[L] - max(bon[L] - f1[L] * pb[L], 0), 0)
            den = f1r[L] + Q2 * f2r
            d1 += iss * (f1r[L] / den) if den > 0 else 0
    u = _solve_u(f1r, min(d1, sum(f1r.values())))
    return {'pb': pb, 'u': u, 's': s, 'cut': cut, 'f1': f1, 'f2': f2, 'bon': bon, 'b12': b12}

def odds_at(m: dict, P: int) -> float:
    if m is None: return None
    if m['cut'] is None: pb = 0.0
    elif P > m['cut']: pb = max([m['pb'][L] for L in m['pb'] if L > m['cut'] and L <= P] or [1.0])
    elif P == m['cut']: pb = m['s']
    else: pb = 0.0
    if P > max(m['pb']) and m['cut'] is not None: pb = 1.0
    pr = 1 - (1 - m['u']) ** (P + 1)
    return pb + (1 - pb) * pr

def table(m: dict, top: int = 30):
    return [None if m is None else round(odds_at(m, P), 6) for P in range(top + 1)]
