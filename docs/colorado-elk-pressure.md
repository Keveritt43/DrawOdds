# Colorado deer scoring: overlapping general elk pressure

Owner requested visible “Male” wording become “Antlered,” significant Quality reductions when a general elk hunt overlaps a deer tag, and inclusion of elk OTC pressure in Elbow room.

## Calculation

For Colorado deer only, general elk must share a unit and an actual open calendar day. Draw type, residency eligibility and hunt-code duplication do not turn unrelated dates or units into an overlap. Private-only general seasons still count when their published units/dates overlap, per the requested “any general elk” rule.

1. Derive deer hunter-seasons/year from the same pooled up-to-five-year harvest window used previously.
2. Collect shared unit/elk-season keys across the confirmed overlapping general hunts. Deduplicate license codes, units, and unit/season/year observations.
3. Read the current CPW elk unit-season total reports, using at most the latest five survey years. Never sum total and split tables. Conflicting, ambiguous or impossible counts are excluded. Average available valid years per unit/season, then add those averages across the affected unit/seasons.
4. Combined participation density = (deer hunter-seasons/year + overlapping elk hunter-seasons/year) / the deer hunt's full-unit square miles. Feed that density into the existing Elbow room curve and shared Quality formula.
5. Apply an additional fixed 25% Quality reduction: floor(base Quality after combined pressure × 0.75). The adjustment is a transparent product policy, not an empirically calibrated biological effect. Personalized Opportunity derives from the adjusted Quality.

CPW unit-season totals include all elk licenses. They are a conservative hunting-pressure proxy when OTC/general elk overlaps, not an exact OTC-only count or unique-person count. A hunter can participate in multiple species/seasons. The UI and evidence table state this explicitly. Partial boundaries and within-unit crowd concentration remain limitations.

If an affected unit/season has no valid observation in the report window, combined density, Elbow room and overall Quality remain unknown. Missing counts never become zero. Unknown dates do not establish overlap and are explicitly labeled; deer-only density is retained until dates are verified. No-overlap deer and Colorado elk retain the original scoring formula. Idaho scoring/data are unchanged.

## Consistency

A request-cached, read-only scoring context supplies general elk seasons and existing CPW reports to the finder, hunt cards/details, comparison, CSV export and unit-map metrics. Hunt detail shows component averages, survey years and source links. Repeated scoring rebases on original deer counts, so neither pressure nor the 25% adjustment compounds.

Visible Male labels are Antlered throughout the UI. Agency parser field names and stored sex-based source data are preserved for historical compatibility.

## Saved-data audit

The saved post-repair snapshot contains 991 deer rows: 249 with complete confirmed-overlap pressure, 14 with missing pressure, 318 with unknown overlap dates, and 410 without a confirmed general elk overlap. These are snapshot counts, not a new agency synchronization.

- DM025O2R: Quality 39 → 27; Elbow room 40 → 20; density 1.40 → 2.84/mi². Adds 677.2 average annual elk hunter-seasons across units 25/26.
- DM070O3R: Quality 96 → 68; Elbow room 86 → 57; density 0.24 → 0.83/mi². Adds 900.2 annual elk hunter-seasons in unit 70.
- DM006O3R: Quality 63 → 41; Elbow room 97 → 43; density 0.06 → 1.28/mi².

Zero audited complete-overlap rows exceeded 75% of their original Quality. Existing success values and historical inputs remain unchanged.

## Validation

120 tests pass; one existing database test is skipped locally. New cases cover actual date/unit/state/type overlap, code/report deduplication, multi-unit coverage, invalid/conflicting/ambiguous/missing counts, five-year windows, unchanged deer success, idempotence and unchanged Idaho scores. Typecheck and optimized build are required before release. No production schema commands, score writes or agency sync are needed.
