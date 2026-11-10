# Colorado (CO)

**Status:** live and listed in the state picker (the beta label was removed in #31). Species: deer, elk and pronghorn (preference points), plus moose, bighorn sheep and mountain goat (special-species points). For the detail, see [colorado-rollout.md](../colorado-rollout.md) (sources, loading, harvest corrections), [colorado-pronghorn.md](../colorado-pronghorn.md), [colorado-special-species.md](../colorado-special-species.md), [colorado-elk-pressure.md](../colorado-elk-pressure.md) and [colorado-ui-parity.md](../colorado-ui-parity.md). This page is the short reference for a new-state builder.

## Data map

| Source | Parser | Stored as | Gotchas |
|---|---|---|---|
| CPW Draw Recap (primary and secondary), drawn-out-at, 2021–2026 | `src/sync/co/recap.ts` | `DrawRecap`, then `HuntSummary.pointOdds` / `oddsByPts` | Reads text positions. A hunt ends at its Grand Total row. Cells wrap. Two-digit numbers can split ("1 8"). `DP99999P` is the point-only code. |
| CPW harvest estimates, 2019–2025 | `src/sync/co/harvest.ts` | `StateReport` kind harvest | 2025 is by hunt code; earlier years are by unit and season (`basis` says which). Elk tables shift columns. Ambiguous rows are listed, not counted. |
| Chapter W-2 regulations | `src/sync/co/regs.ts` | `StateReport` kind regs | Unit lists per code, including "portion of" text. Road numbers in the boundary text are not units. Archery dates sit on the next line. |
| Post-hunt population by herd (DAU), 2019–2025 | `src/sync/co/population.ts` | `StateReport` kind population | The 2022 PDFs had broken fonts and were transcribed by hand into `data/co-population-2022.json`. |
| GMU boundaries and herds | CPWAdminData FeatureServer/6 | `Unit` (state CO) | 186 GMUs. |
| Land ownership | `scripts/build-co-land.py` (BLM CO SMA × GMU, EPSG:5070) | `Unit.publicPct` | Offline build. Public land is not the same as legal access. |
| Report catalog | `data/co-reports.json` | | All 74 public source links. |

**Fetching:** CPW's newer PDFs are on `cpw.widencollective.com`. The share page loads the PDF through an anonymous API call, and `resolvePdf` in `src/sync/co/index.ts` repeats that call.

## Odds model

See [state-adapter-guide.md §4](../state-adapter-guide.md#preference-points-colorado-oregons-75-phase-wyoming-nonresident-preference-phase). The code is `src/lib/coOdds.ts`, and the hunt-level glue is `src/lib/coHunt.ts`.

- **Draw rules (current, through the 2027 draw):**
  - First choice goes by preference points; 2nd–4th choices use no points.
  - Nonresidents are capped at 25% (some elk codes 20%; 35% before 2024). Landowner (LPP) licenses come off the top.
  - A hybrid draw gives up to 20% of licenses at random to applicants with 5+ points.
- **From the 2028 draw (`RULE_CHANGE_YEAR`):**
  - 50/50 preference/bonus split; the hybrid draw ends.
  - Nonresidents a flat 25%.
  - Not modeled yet. Needs CPW's published bonus weighting first.
- **Open issue:** the returning-cohort floor has not been backtested. Rerun the Brier backtest (2024–2026, each year predicted from earlier years only) and update the numbers in the `projectedOdds` comment, or remove them.
