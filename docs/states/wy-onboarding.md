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
