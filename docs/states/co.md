# Colorado (CO)

Status: deer loaded and live behind a link (`/api/state?code=co&next=/hunts`); not listed in the state picker yet
(`enabled: false` in `src/lib/states.ts`). Elk is next.

## Data

| Source | Years | Where | Notes |
|---|---|---|---|
| CPW Draw Recap (primary), deer | 2021-2026 | `co-draw` -> `DrawRecap` | 5,832 hunt-years; every one passes the row-total check. Links in `src/sync/co/manifest.ts` (new link each May). |
| CPW GMU boundaries | current | `co-gmu` -> `Unit` (state CO) | 186 units, with deer/elk herd (DAU) per unit. |
| Draw Recap, elk | 2021-2026 | not yet | Same parser; hybrid draw common (38 elk codes in 2026). |
| Harvest, population, secondary draw, brochure dates, hunt-code -> GMU lists | | not yet | Hunts are named for their code's unit only; some codes cover neighbors. No season dates yet. |

Parser: `src/sync/co/recap.ts` reads text positions (cells wrap, tables continue on the next page; a hunt ends at
its Grand Total row). The point-only code `DP99999P` is parsed but not shown.

## Odds model (`src/lib/coOdds.ts`)

- Effective points: points at the cutoff + share not drawn there (6 points, 60% drew = 6.4).
- Last draw: exact applicants / drawn per point level per pool.
- Next draw: last draw's cutoff + the year-to-year moves measured across every hunt code, by residency and level
  band (deciles). Odds are averaged over those outcomes and scaled by the share above the cutoff who draw
  (res 96.5%, nonres 93.5%).
- Backtest (each of 2024-2026 predicted from earlier draws only): Brier 0.080-0.085 vs 0.098-0.107 for last year's
  odds (nonresidents), 0.051-0.055 vs 0.058-0.066 (residents). Tried and rejected: a re-draw simulation (worse than
  last year) and a 5-year trend (no better year ahead; conditioning the spread on trend didn't help either).
- Point creep (5-year slope) is shown and drives "years to draw", which stops meaning much at the 2028 rule change.

## 2028 rules (not modeled yet)

From the 2028 draw: each hunt code splits 50/50 preference / bonus draw, hybrid draw ends, nonresidents a flat 25%
(at most half of it through the preference half). Build the bonus model once CPW publishes how bonus points weigh.
