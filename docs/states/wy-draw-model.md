# Wyoming draw data and odds model (deer, elk, antelope)

Status, Nov 10 2026: everything below is built and CI-green on branch codex/wy-draw-sources (PR #46). Not in production yet. Production needs the one-off import (`scripts/wy-import.ts`, dry run first, then `--apply`), then merge and UAT.

Built data:
- `draws.json`: draw demand reports 2021–2026.
- `regs-2026.json`: season tables.
- `harvest.json`: harvest reports 2021–2025, from `wy_parse_harvest.py`. Every row reconciles. A few deer rows where mule + white-tailed harvest exceeds the larger hunter count are listed in `problems` and skipped.
- `areas.json` + `units.json`: 333 species hunt areas, from `wy_build_areas.py`. Land is BLM SMA on a 100 m equal-area raster. Statewide: 45.3% federal, 6.8% state. Walk-In + HMA acres match WGFD's acreage fields.
- `hunts.json`: 520 hunts, from `wy_build_hunts.py`:
  - 367 limited-quota and region licenses;
  - 153 general seasons. Residents buy over the counter; nonresidents use their region's draw odds.
  - Region licenses take harvest and land from their areas' general seasons, labeled as such.

Known data notes:
- WGFD's `SqMiles` attribute is stale for some redrawn areas (2026 deer 138/143/155/156, elk 117/123/126). Areas are computed from the geometry.
- Deer harvest has separate mule and white-tailed tables. A hunter can be in both, so deer success is an upper bound.

## Sources

- 90 WGFD "Demand Report" PDFs, 2021–2026 × {antelope, deer, elk} × {NR regular preference, NR regular random, NR special preference, NR special random, resident random}. Media IDs: `data/wy/draw-sources.csv`. Page: https://wgfd.wyo.gov/licenses-applications/draw-results-odds
- Rules: Chapter 44 (media/34010), 2026 antelope/deer/elk regulation (media/33850).
- Not used yet: landowner (listed 2024+ only), doe/fawn, cow/calf, leftover-draw reports.
- The workspace network cannot reach wgfd.wyo.gov. Download with `scripts/wy-download-draw-pdfs.ps1` on a machine that can, then build:

```
python3 -I scripts/wy_build_draws.py <pdf_dir> data/wy/draws.json
```

Needs `pdftotext` (poppler). The build re-parses every PDF and stops on any failed check.

## What the reports contain

- **Preference report:** per hunt, rows by point level, top down: remaining quota, issued, points, first-choice applicants, printed odds.
  - `N` = exactly N points.
  - `< N` mid-report = party averaging between N−1 and N.
  - The closing row (blank issued, zero quota) is "fewer than N" (`< N`) or "N or fewer" (`<= N`) and was unsuccessful. This is always the last row (3,237 of 3,237 hunts).
- **Printed odds** = remaining quota ÷ applicants at that level, capped at 100%. They are not issued ÷ applicants. A party that draws the last license gets licenses for every member, so issued can exceed remaining (2021 antelope 001-1: 36 left, 37 issued, printed 63.16%).
- **Random and resident reports:** per hunt, quota and 1st/2nd/3rd-choice applicants. No issued count.
- **Codes:** hunt area + type (`001-1`). Nonresident region general deer/elk use a letter (`G`). Elk regions appear in these reports only from 2024. Resident general deer is `GEN` with quota 9999 = unlimited (stored as `null`).
- **Descriptions:** truncated by WGFD to 20 characters.

## Verified against the data (all 2021–2026)

| Check | Result |
|---|---|
| Every row's running quota and printed odds | 10,703 hunt rows, all reconcile |
| Hunt lines parsed vs hunt lines in the text | equal for all 90 files |
| Random 1st-choice applicants = unsuccessful preference applicants | **4,322 / 4,322** pools |
| Preference quota = ceil(75% × (pref + random)) | 4,274 / 4,279 pools with a quota; exceptions = Region J special deer every year |
| Preference licenses left unused move to the random draw | **No.** Random quota excludes them (e.g. 2021 deer 011-3: 147 left over, random quota 53) |
| Special = 40% of nonresident licenses, per hunt | **Does not hold** hunt by hunt (landowner licenses come out first). Not modeled; each pool's published quota is used directly |

Deer/antelope rule (Chapter 44 §4(b)): 80% of licenses are *offered to residents*. That's a floor for residents, not a 20% cap for nonresidents. In 2026 antelope 001-1 nonresidents had 241 of 400.

## Odds model (`src/lib/wyOdds.ts`)

- **Nonresident:** `pref + (1 − pref) × random`.
  - `pref` = WGFD's printed odds at your exact points (published, last draw). Above everyone who applied = 100%; in the closing bucket = its printed odds (0%).
  - `random` = random quota ÷ random first-choice applicants, capped at 100%. **Estimated:** WGFD doesn't publish random issued counts. It assumes first choices are filled before second choices.
- **Resident:** random quota ÷ first-choice applicants, capped (estimated). Unlimited licenses → no odds shown, labeled "unlimited".
- **Solo applicants only.** Party odds depend on averaged points and party size.
- **Cutoff:** "effective points" as in `coOdds.ts`. Drawn out at L points with fraction f drawn → L + (1 − f). Party rows use the midpoint. Points-to-guarantee = floor(cutoff) + 1. Point creep = the measured change in cutoffs, not a forecast.

## Projection backtest

Scored as Colorado is scored (docs/states/co.md): Brier score of each applicant's draw outcome at exact point levels.
Each test year is predicted from earlier draws only. "Last draw" = last draw's printed odds at your points.
"Colorado method" = last draw's effective cutoff plus each decile of the measured year-to-year cutoff moves
(species × cutoff band, floored at the last draw), with odds averaged over those outcomes.

| Test draw | Antelope: last / Colorado method | Deer | Elk |
|---|---|---|---|
| 2024 | 0.212 / 0.245 | 0.166 / 0.164 | 0.228 / 0.224 |
| 2025 | 0.221 / **0.139** | 0.112 / **0.085** | 0.251 / **0.206** |
| 2026 | 0.207 / **0.153** | 0.106 / **0.080** | 0.136 / 0.205 |
| Mean | 0.213 / **0.179** | 0.128 / **0.110** | **0.205** / 0.212 |

- **Antelope and deer** default to the projected next draw (Colorado method).
- **Elk** shows the last draw: its projection lost on average, badly in 2026. The basis says so on every card and page.
- Random-phase odds are not projected: they use the last draw's random quota ÷ first-choice applicants.
- Rejected earlier: applicant roll-forward, 2–3 year averages, and fixed creep shifts. A half-creep shift helped antelope and deer, but it was chosen after seeing the test years, so it doesn't count.
- An earlier version of this doc said no projection ships. That conclusion came from point-estimate error, not Brier. The Brier re-test above replaces it.

## Before the app can use this

1. Register Wyoming in `src/lib/states.ts`. Map hunt area + type to boundaries (WGFD hunt area polygons). Season dates and regulation quotas from media/33850.
2. Harvest, density and land data: separate source work.
3. Cards, details, filters and map, matching Idaho, with a points chart like Colorado's.
4. Labels: "Preference odds: published (2026 draw)" and "Random odds: estimated". Never show a projection until one passes a backtest.
