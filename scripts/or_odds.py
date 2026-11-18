"""Oregon controlled hunt odds (deer and elk, 100/200/600 series). Used by scripts/or_build_hunts.py and
scripts/or_backtest.py. Rules and the evidence for them: docs/states/or-onboarding.md section 2.

The draw, per hunt, first-choice applicants only (later choices only get tags left after every first choice):
  1. Preference phase: round(0.75 x tags in the draw) go to the most points, highest first. Applicants with 0
     points never draw here. Ties at the cutoff are broken by the application's random number. Nonresidents stop
     drawing once the hunt's nonresident maximum (5% of tags) is reached.
  2. Random phase: the remaining tags go in random-number order to everyone not yet drawn, using the SAME random
     number. So applicants who lost the tie at the cutoff hold worse-than-average numbers.

With u = an application's random number, uniform on (0, 1), a level whose preference-phase share was s drew the
applicants with u < s; the random phase then takes everyone left with u < t. So the chance of drawing at a level
is max(s, t): s = 1 above the cutoff, the drawn share at it, 0 below. t is solved per pool so the random phase
hands out exactly the tags ODFW reports for that pool.
"""
from __future__ import annotations

MAX_PTS = 30


def pool_rows(h: dict, pool: str):
    """[(points, applicants, drawn in the preference phase)] for 'res', 'nr' or 'all'."""
    out = []
    for p, n, ra, rd, na, nd in h['rows']:
        if pool == 'res':
            out.append((p, ra, rd))
        elif pool == 'nr':
            out.append((p, na, nd))
        else:
            out.append((p, n, rd + nd))
    return [(p, n, min(d, n)) for p, n, d in out if n > 0]


def solve_t(rows, won: float) -> float:
    """Random-phase threshold t: sum over levels of losers x P(u < t | u > s) = won."""
    def got(t):
        g = 0.0
        for _, n, d in rows:
            s = d / n
            if s < 1 and t > s:
                g += (n - d) * (t - s) / (1 - s)
        return g
    left = sum(n - d for _, n, d in rows)
    if won <= 0 or left == 0:
        return 0.0
    if won >= left - 1e-9:
        return 1.0
    lo, hi = 0.0, 1.0
    for _ in range(60):
        m = (lo + hi) / 2
        if got(m) < won:
            lo = m
        else:
            hi = m
    return (lo + hi) / 2


def odds_table(rows, t: float, any_pref: bool, max_pts: int = MAX_PTS):
    """Odds at 0..max_pts points from one pool's rows and its random threshold."""
    by = {p: (n, d) for p, n, d in rows}
    levels = sorted(by)
    drawn_levels = [p for p in levels if by[p][1] > 0]
    cutoff = min(drawn_levels) if drawn_levels else None
    out = []
    for p in range(max_pts + 1):
        if p in by:
            n, d = by[p]
            s = d / n
        elif p == 0:
            s = 0.0
        elif cutoff is not None and p > cutoff:
            s = 1.0
        elif cutoff is None and any_pref and levels and p > max(levels):
            s = 1.0
        else:
            s = 0.0
        out.append(max(s, t))
    # more points never lowers the odds (a blocked nonresident at a high level can read below a lower one)
    for i in range(1, len(out)):
        out[i] = max(out[i], out[i - 1])
    return out


def last_draw(h: dict):
    """{'res': [...], 'nr': [...]} odds by points for one hunt-year report; None when nothing can be said."""
    if not h.get('tags') or not h.get('apps'):
        return None
    out = {}
    for pool, total in (('res', h['resDrawn']), ('nr', h['nrDrawn'])):
        rows = pool_rows(h, pool)
        if not rows:
            continue
        pref = sum(d for _, _, d in rows)
        t = solve_t(rows, max(0, (total or 0) - pref))
        out[pool] = [round(x, 6) for x in odds_table(rows, t, pref > 0)]
    return out


# --- projection: next year's first-choice applicants, by points ------------------------------------------------
def roll_forward(h: dict, pool: str, odds: list[float], r: float, apps_next: float | None = None):
    """This year's applicants who don't draw come back with a point (share r), winners leave, and newcomers at 0
    points make up the next applicant count (this year's when not given)."""
    rows = pool_rows(h, pool)
    nxt = {}
    for p, n, _ in rows:
        o = odds[min(p, MAX_PTS)]
        k = min(p + 1, MAX_PTS)
        nxt[k] = nxt.get(k, 0.0) + n * (1 - o) * r
    total = apps_next if apps_next is not None else sum(n for _, n, _ in rows)
    nxt[0] = nxt.get(0, 0.0) + max(0.0, total - sum(nxt.values()))
    return nxt


def simulate(levels: dict, tags: float, pref_share: float = 0.75):
    """Odds by points for a projected applicant pool {points: applicants} and tags in the draw (one pool)."""
    apps = sum(levels.values())
    if tags >= apps - 1e-9:
        return [1.0] * (MAX_PTS + 1)
    pref = round(pref_share * tags)
    left = pref
    rows = []
    for p in sorted(levels, reverse=True):
        n = levels[p]
        if p == 0 or left <= 0:
            rows.append((p, n, 0.0))
            continue
        d = min(n, left)
        left -= d
        rows.append((p, n, d))
    drawn_pref = pref - left
    t = solve_t([(p, n, d) for p, n, d in rows if n > 0], tags - drawn_pref)
    return odds_table([(p, n, d) for p, n, d in rows if n > 0], t, drawn_pref > 0)
