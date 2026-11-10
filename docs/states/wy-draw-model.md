# Wyoming draw data and odds model (deer, elk, antelope)

Status, Nov 2026: parser, data and odds library done and tested. Not wired into the app yet (registry, cards, details, filters, map). Not in production.

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

## Projection backtest: none ships yet

**Target:** next draw's printed preference odds at each exact point level, applicant-weighted mean absolute error. Also the error in points needed for ≥50%.

| Model (2023→24 … 2025→26) | Antelope | Deer | Elk |
|---|---|---|---|
| Last draw's printed odds (baseline) | 0.213 / 1.41 | 0.120 / 0.89 | 0.206 / 1.01 |
| Mean of last 2 / 3 draws | worse on ≥1 metric | worse | mixed |
| Roll unsuccessful applicants forward +1 point | worse or mixed | worse | mixed |
| Same demand, next year's quota known in advance (oracle) | barely better | worse | barely better |
| Cutoff + full median creep (fit 2021–23) | mixed | worse | worse |
| Cutoff + half median creep | better | better | worse odds error |

- No model beats the baseline for all three species.
- The half-creep variant was chosen after seeing the test years, so its win is not evidence.
- **Decision:** show last draw's odds, labeled with the draw year, plus how far cutoffs typically move: p10/p50/p90 of the yearly change, in `meta.cutoffMove` (antelope −1.5 / +0.64 / +2.09 points).
- **Re-test the half-creep variant against the 2027 draw** before showing any projection.

## Before the app can use this

1. Register Wyoming in `src/lib/states.ts`. Map hunt area + type to boundaries (WGFD hunt area polygons). Season dates and regulation quotas from media/33850.
2. Harvest, density and land data: separate source work.
3. Cards, details, filters and map, matching Idaho, with a points chart like Colorado's.
4. Labels: "Preference odds: published (2026 draw)" and "Random odds: estimated". Never show a projection until one passes a backtest.
