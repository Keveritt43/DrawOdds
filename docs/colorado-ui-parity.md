# Colorado UI parity and score validation — 2026-11-05

## Release scope

- Reuse Idaho's responsive Recharts frame, axes, grid, legends, hover values and 220px plot height. Colorado retains point creep (with forecast ranges) and point-level odds. Hunters/harvest uses Idaho's grouped blue bars. Two columns begin at the same 300px minimum as Idaho; narrow displays stack.
- Draw History and Odds At Every Point Level precede population.
- White hunt cards with the existing Idaho green stat panels (theme-aware).
- Three mutually exclusive OTC overlap choices: Any, Has OTC elk, No OTC elk. A shared unit and actual overlapping open date remain mandatory.
- Quality breakdown and personalized Opportunity on cards and hunt details, plus Quality/Opportunity sorting and comparison support. Easier-to-draw alternatives use the hunter's actual/projected point pool and at least 80% of baseline success, with matching method, sex, youth and private-only restrictions.
- Unit map adds controlled Quality, success, density, points and creep. Finder map adds Quality. Idaho-only elk-zone preferences cannot hide Colorado numbers. Public-land source language now names BLM/CPW in Colorado.

## Scoring evidence and limitations

`withCoScores` is read-time only: no production schema, historic summary or Idaho data writes. It calls the exact `scoreHunts` implementation used for Idaho. The unit-ownership fixture must cover every unit, have positive finite acreage, >=95% coverage, bounded shares and shares summing to 100%. Counts must be finite, nonnegative, harvest <= hunters, a 1–5 year window, and agree with stored pooled success within 0.001. The shared model requires >=30 hunter-seasons and known access/density. Private-only hunts receive zero public-access credit. Trophy remains absent and has no adjustment; sex ratios are not antler measurements.

Opportunity = Quality × sqrt(selected draw odds). It uses current points, residency/youth pool and actual/projected mode, rather than a Colorado aggregate random-draw ratio. The source projections remain conservative planning scenarios, not calibrated forecasts. Scores inherit CPW unit/season harvest aggregation, full-unit acreage limitations, and surface-ownership limitations. Input validation establishes calculation integrity, not prospective predictive accuracy.

On the saved post-repair production snapshot (2,038 Colorado summaries), 720/991 deer and 858/1,047 elk pass score gates; no out-of-range or unsupported trophy scores. The remaining rows stay unscored. This snapshot is a local validation source, not a claim that production data was reloaded.

## Verification

- New regression tests check equivalence to Idaho for identical inputs, invalid/missing/small samples, no mutation, no Idaho changes, private access and personalized Opportunity.
- 113 tests pass, 1 existing test skipped; typecheck passes. Optimized production build passes before deployment.
- No agency synchronization, database/schema operations or sync-service enablement is part of this release.

Post-deployment UAT evidence and the requested outstanding issues, improvements and growth ideas are recorded in `docs/colorado-uat-2026-11-05.md`.
