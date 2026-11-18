# Wyoming onboarding: research starting point

Use this worksheet with the reusable [state-onboarding checklist](../state-onboarding-checklist.md). It is a preliminary source inventory, not a completed integration or approval to import data. Record report-specific years, coverage, formats, source dates, restrictions and validation evidence before implementation. Recheck current agency rules for each species and application year.

## Agency sources

- [Draw results and odds](https://wgfd.wyo.gov/licenses-applications/draw-results-odds): WGFD lists species-specific historical PDFs with separate resident, nonresident, special, preference, random and other categories where applicable. Inventory each actual pool and year; do not assume every category applies to every species.
- [Harvest reports and surveys](https://wgfd.wyo.gov/hunting-trapping/harvest-reports-surveys): species reports and agency survey context. WGFD describes estimates based on survey responses; record methodology, samples, uncertainty, geography and the available years in each report.
- [Preference points](https://wgfd.wyo.gov/hunting-trapping/preference-points): verify species, residency, license type, choice and current-year rules. WGFD distinguishes nonresident full-price elk/deer/antelope points from moose and full-price bighorn sheep points for residents and nonresidents; separate preference and random phases must be modeled when applicable.
- [Regulations](https://wgfd.wyo.gov/regulations) and [licenses and applications](https://wgfd.wyo.gov/licenses-applications): research current season dates, hunt area/type restrictions, fees, prerequisites and eligibility. Verify fee year and completeness before presenting totals.
- Research official Hunt Planner and boundary/land datasets, permissions, attribution and update frequency. Confirm the exact mapping between hunt areas, license types, seasons and source geometries before using them.

## Wyoming-specific work to verify

- [ ] Inventory available deer, elk, pronghorn, moose, bighorn sheep and mountain goat reports and identify actual gaps; do not imply full species coverage from the source listing alone.
- [x] Build and test an odds adapter using applicable resident/nonresident, regular/special, preference/random and choice-specific rules and reports. Preserve observed pool results separately from estimates and projections; validate against representative published examples. Do not generalize a 75/25 split to every license or species without verification. Done for deer/elk/antelope full-price draws 2021–2026: see [wy-draw-model.md](wy-draw-model.md) (75/25 verified per pool with listed exceptions; 40/60 does not hold per hunt; no projection passed the backtest).
- [ ] Validate harvest numerator, denominator, report year and geographic scope. Preserve agency estimates and disclose survey limitations; do not treat a hunt-area aggregate as an exact count in every constituent unit.
- [ ] Determine which metrics and score inputs are supportable, including comparable public land, access and density. Keep unsupported values unknown and document any state-specific score adjustments.
- [ ] Complete the shared checklist for database identities, personalized settings, shared versus Wyoming-only filters, maps, cards, detail pages, both UAT personas and protected rollout. Record all checks and unresolved gaps before enabling Wyoming in production.

## Land: centre-sampled raster (Nov 18, 2026)

`scripts/wy_build_areas.py` used PIL's `ImageDraw.polygon`, which fills every 100 m cell a polygon's outline touches. That adds about a cell of border to every parcel, so small parcels came out 20–60% too large and, drawn after the large ones, overwrote their neighbours. It now uses Montana's centre-sampled fill (`scripts/mt_build_land.py` `Grid.fill`, even-odd), like every other state's land build. Same inputs (the owner's `Downloads\wgfd\gis`, unchanged since Nov 10; the old build reproduces the committed `areas.json` exactly).

**Effect, smaller than first claimed.** On my priority list of Nov 18 I called Wyoming's public-land shares "off". Measured, the bias was real per parcel but small per hunt area: across 333 areas the public share moves by −0.4 points on average (median −0.3), 12 areas by 2 or more points, none by 5. Wyoming's scattered state sections had been inflated: state land averages 6.5% per area (was 6.9%). Statewide: federal 45.3% (unchanged), state 6.4% (was 6.8%), ownership coverage 100.0%. Area-size check tightened to 1% (2% under 200 mi²), from 2% / 3.5%.

| Area | Public % before | after | change |
|---|---|---|---|
| deer 67 | 23.6 | 18.9 | -4.7 |
| antelope 3 | 18.8 | 16.4 | -2.4 |
| deer 3 | 18.8 | 16.4 | -2.4 |
| antelope 31 | 37.0 | 34.7 | -2.3 |
| deer 123 | 69.3 | 67.0 | -2.3 |
| deer 32 | 38.6 | 36.4 | -2.2 |
| antelope 1 | 22.9 | 20.9 | -2.0 |
| antelope 103 | 25.0 | 23.0 | -2.0 |

**Import scope: land only.** `data/wy/hunts.json` takes only the land fields from the rebuild (acres, publicPct, privatePct, huntersSqMi, accessYes*, pointOdds.land); every other field already matched. The three nonresident region elk licenses (ER-E, ER-S, ER-W) keep their stored rows: #184 corrected their member areas in `wy_build_hunts.py` (Chapter 7 §6) and applies the correction on read (`src/lib/wyElkRegions.ts`, which also blanks their land), but never regenerated `hunts.json`; regenerating it changes their harvest history, which `withWyElkBoundaryHistory` and its test were written around. That is #184's change to finish, not this one. So `wy_build_hunts.py` run from scratch still differs from the committed file on those three rows (known).

`scripts/wy-import.ts` gained `--keep-live-trophy` (live rows keep their trophy score and Quality is recomputed with it, so this import doesn't also carry the unreviewed trophy-v2 change, as in WA #220), a plan digest to gate the apply on, a per-field change count, and a guard on every other state (it checked only Idaho and Colorado).
