# Western harvest and trophy audit — November 15, 2026

## Scope and comparison method

The owner-supplied `western_top_tier_units-v5.csv` was used only as a reference; its SHA-256 is `8a39464a3c56ad63efd62ffdeb7ea5e959fd968e67763d3035f6c92d6df25860`. It contains 2,433 records for 11 states, including states not supported by DrawOdds. It has the same record IDs as the v4 source already in the repository; added species/agency aliases and explicit `Unranked` labels do not by themselves establish new trophy evidence. The supplied numerical trophy scores are not the same calculation as DrawOdds' discrete trophy scores or its Quality index.

A read-only public export of the combined finder, separately requested for deer, elk and pronghorn on November 15, yielded 3,953 hunt rows with default settings and eligibility filters. It is not a complete inventory of restricted, youth, private-land-only or other omitted hunts. For each scored hunt and each unit, the audit used the existing species-scoped source resolver (including Utah's geographic crosswalk and Wyoming prefixes) to find the reference record. It compared the reference tier with the live **whole-hunt** trophy score; counts below are hunt-unit comparisons, not independent units or confirmed errors. Multi-unit floor rules, dates, legal animals, source uncertainty and unmatched boundaries can explain differences. Duplicate reference subspecies with conflicting labels were left ambiguous.

| State | Exported hunts | Comparable hunt-unit pairs | Live lower | Same | Live higher | Unmatched | Conflicting reference tiers |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Idaho | 594 | 802 | 153 | 643 | 6 | 14 | 0 |
| Colorado | 1,019 | 2,079 | 374 | 1,682 | 23 | 247 | 0 |
| Montana | 406 | 373 | 72 | 287 | 14 | 87 | 0 |
| Utah | 406 | 467 | 350 | 110 | 7 | 80 | 0 |
| Washington | 1,071 | 600 | 166 | 419 | 15 | 404 | 24 |
| Wyoming | 457 | 699 | 241 | 439 | 19 | 15 | 0 |

Examples requiring interpretation: the CSV marks Idaho Unit 27 deer Elite for late-rut/wilderness hunting; live hunt 1018 has a Good designation because its currently matched evidence and actual hunt rules do not establish the CSV's unit-wide label. The CSV marks Montana HD 705 deer Elite; the general hunt displays Good under the model's evidence and hunt-specific rules. Utah Zion general buck hunt DB1589 displays Standard, while the supplied unit reference has Elite; its explanation cites the model's low observed harvest/high draw-rate screen. These comparisons do not prove the CSV or the application is correct. Named-source claims lack individual source links and retrieval dates, and county data do not locate animals in a hunt unit. Review agency boundaries and season-specific original sources before changing a tier.

## Production scoring checks

A read-only production snapshot of all 1,303 Idaho summaries was compared with `scripts/recalculate-idaho-scores.ts` inputs, including private-land handling, season restrictions and the current `scoreHunts` model. All seven stored score columns matched for all 1,303 rows. This check did not write scores. Colorado recalculates through its Colorado adapter; Montana, Utah and Washington recalculate on read through `withStateTrophyScores`. Wyoming deer success and dependent scores are intentionally suppressed because its species hunter counts overlap by an unknown amount; Wyoming's other supported species use the state adapter. Live public exports verify the displayed scoring path for the exported rows; they do not independently validate every input, restricted hunt, stored non-Idaho score, or Colorado overlap context.

The legacy Idaho export used uncorrected stored fields for hunt 1044, including Unit 57 and geometry-derived land and density. The shared finder and details correctly use the verified Unit 55 only and suppress unsupported land/density/Quality. This change applies the correction and current trophy score to the legacy export and its affected filters.

## Harvest identity audit and correction

* Idaho controlled harvest is linked through historical draw lineage and area rather than the current number alone; individual area/boundary lineage remains dependent on its source data. No Idaho agency synchronization was performed.
* Colorado uses agency hunt-code or unit/season harvest depending on source; unit-level data are not necessarily hunt-code observations. The existing documentation records coverage limitations; this audit did not independently revalidate all seasons and boundaries.
* Montana combines agency district harvest with surveyed years and historical boundary checks; it does not use Washington's choice-number join. District-level estimates do not establish permit-specific results.
* Wyoming uses agency area/type reports; deer combined hunter overlap remains unknown and is suppressed as described above. Renumbered or changed areas still require boundary-specific investigation.
* Utah joins limited-entry harvest by hunt code. Among 2021–2025 source reports, 129 codes have different name strings; that is a review queue, not 129 proven errors. Examples include shortened names such as `South Slope, Diamond Mtn` / `Diamond Mtn` and `5S` / `5S Land and Livestock`. A complete season, boundary and code-reuse audit remains open.
* Washington has a confirmed general bug: its original historical harvest join used the present choice number and name even when choice numbers moved. The individually reviewed Desert 1079 and 1091 histories were corrected earlier. This audit confirms 2026 late-archery hunt 1080 corresponds to hunt 1081 in 2021–2025, rather than the early-archery hunt 1080. WDFW reports 12 harvests in 44 hunter-seasons, or 27.3% pooled; the prior 30.3% was the early hunt's 10/33. The annual pamphlets, tag, area, legal animal and season support this match. Quality and trophy must be recomputed using the corrected history. A broader candidate rebuild changes hundreds of Washington histories, including some removals; it has not been reviewed or applied. Further state-wide identity work remains necessary.

Source material: [WDFW annual game harvest reports](https://wdfw.wa.gov/hunting/management/game-harvest), the repository's Washington annual pamphlets and harvest report snapshots, Utah DWR reports and state onboarding documentation, and the current application score and state adapter implementations. Missing or ambiguous evidence remains unknown, not zero. Production state-data writes require a matching reviewed dry-run digest and counts, and verification that other states are unchanged.

## Follow-up: Washington identity audit

The earlier candidate was not applied at the time of the comparison above. The subsequent follow-up uses the stricter annual identity and season-date checks documented in `states/wa-onboarding.md`, archives the prior attributed histories, and keeps genuinely ambiguous years out of displayed rates. It examined 766 existing special-permit rows in a fresh production snapshot: the reviewed plan changes 687, including 299 gaining comparable history and 42 losing a previously attributed rate. The live-score model indicates 143 Quality changes and no trophy-tier changes relative to the current read-time scores. These are not claims that unlinked reports do not exist. Utah's separately reported youth duplicate rows are now selected deterministically; no Utah hunt data changed in the offline rebuild.

## Follow-up: Utah and Wyoming boundary evidence

DWR's public 2025 Utah boundary layer contained 152 polygons. Comparing each named BoundaryID with the retained 2026 geometry using Turf area intersection yielded 151 with at least 98% intersection-over-union; the remaining boundary 904 was 86.8%, and no current bundled hunt uses boundary 904. The three polygon errors from simplification were rechecked with geometry repair and had IoU above 99%. Of 617 bundled Utah hunts, 421 use only boundaries in the >=98% group and 419 of those have a 2025 harvest observation. This checks geographic overlap, not proof that every historic hunt code belonged to the same 2025 boundary. The DWR 2024 service returned `Token Required`; 2021–2024 hunt-to-boundary joins remain unverified. Source: DWR `Utah_Big_Game_Hunt_Boundaries_2025` ArcGIS FeatureServer, layer 0, retrieved for this audit.

WGFD documents the 2024 combination of elk areas 53/54 and movement of part of 54 into 65, and the 2025 boundary changes to 117, 123 and 126. The application now uses only post-change observations for those areas and for region aggregates containing them, retaining the original raw observations. These filters are applied to hunt details, finder, export, unit views and maps before dependent scoring. This is a conservative year-based rule, not a full historical Wyoming polygon audit.
