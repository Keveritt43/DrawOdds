# Colorado deer and elk rollout

The owner authorized fetching CPW deer/elk reports and deployment after checks pass on 2026-11-05. Idaho agency synchronization remains prohibited and automatic synchronization remains disabled.

## Included

- CPW primary and secondary draw recaps and drawn-out-at reports, 2021–2026; harvest and population reports, 2019–2025; OTC sales, 2019–2023. `data/co-reports.json` records all 74 public source links from the two official statistics pages.
- Unit-specific deer and elk report tabs, preserving separate primary/secondary pools, plus species-correct herd/population labels. A secondary draw is not treated as a point-based primary draw. OTC sales remain labeled statewide when their code spans statewide units.
- General/OTC elk licenses from W-2, including resident/nonresident archery eligibility, cross-page unit lists and the published 2027 rifle dates. Unit lists preserve partial-area restrictions in the hunt details; actual eligibility is tied to the published regulations year, not a guarantee of future availability.
- Cards use the Idaho three-stat layout: personalized draw odds, pooled success and annual hunters per square mile, with a points-needed row above them. Missing public-access data stays unknown, so Colorado Quality remains unavailable until those inputs exist. Hunt-code trophy-size data is not invented from male/female harvest counts.
- Minimum and maximum points-needed sliders support ranges and exact values, per residency. The filter uses the latest actual draw threshold; the odds display separately offers actual versus projected.
- Returning-cohort 2027 scenario: failed first-choice applicants return with +1 point, successful applicants leave, pool supply stays fixed. Hybrid winners are removed from preference supply. Cutoffs never fall below the last draw or returning-cohort scenario; displayed forecast creep is nonnegative. Historical observations remain unchanged. Switching hunts, new entrants and quota changes are uncertainties, and the old calibrated-accuracy claim was removed. This conservative assumption should be retained when point-based states are added.
- Bottom-of-page related elk seasons for specific deer/elk limited hunts in both Idaho and Colorado: same state, same unit, at least one actual overlapping date. Gaps within general seasons are respected.

Historical shared drawing pools retain every constituent hunt code and the original pooled applicants/cutoffs. Issued counts per code are distinguished from the shared quota; pooled quota is never presented as an individual-code quota. Versioned parser markers ensure older primary and secondary recaps are refreshed. The 2021 elk report now retains all 1,028 codes rather than 887 pool headers.

## Harvest corrections and historical provenance

Colorado hunters5 and harvest5 now store pooled totals rather than annual averages; harvestYears is the size of that same available five-season window. Density divides pooled hunters by years and acreage. This fixes the prior mismatch between field names and their values.

Older elk harvest reports use spelled-out rifle-season ordinals and pre-2021 unit columns farther to the right. Tables can change mid-page. The parser handles these cases and records conflicting unit rows in an `ambiguous` list rather than double-counting them; a year containing an ambiguous target unit is excluded from that hunt's aggregation. CPW's 2019 elk page 32 has a Second/Third header inconsistency: the report contents and following continuation pages identify the table as Third. The source remains linked and ambiguity is retained. Before-2025 unit/season aggregates remain explicitly distinguished from exact hunt-code data.

The two 2022 population PDFs have corrupt Unicode mappings. Their originals were rendered and visually transcribed into `data/co-population-2022.json`: 54 deer herds and 42 elk herds. Deer sums exactly to CPW's 391,921. Elk rows sum to 303,185 while CPW prints 303,190; both original values are preserved, including the 5-animal discrepancy. No interpolation fills missing years.

## One-time loading and release

1. Backups of pre-rollout Colorado reports/summaries and exact Idaho inputs/scores were saved locally under ignored `out/`. Idaho was already approved and deployed through PR #1; 1,161 scores changed and all other Idaho summary columns were verified unchanged.
2. Run tests, typecheck, build and CI on the Colorado feature branch. No schema changes are required. Production web startup must run Next.js directly and never push schemas.
3. Use a temporary Railway worker with `railway.co-maintenance.json`, DATABASE_URL referenced from the existing Postgres service, and restart policy NEVER. Its sole entry point is `scripts/co-maintenance.ts`; no cron and no generic all-state sync runner.
4. The worker adds missing primary recaps via upsert, loads reports, and refreshes older harvest parsers while archiving their previous parsed versions as `harvest-unit-archive` StateReport rows. It retains historical Hunt rows. Only current Colorado summary rows are rebuilt transactionally; raw Idaho tables are never written.
5. The worker requires all 74 catalog reports before rebuilding Colorado summaries, checks the full Idaho summary digest stayed identical, and prints CO_MAINTENANCE_SUCCESS with species/type counts. A failed load keeps existing Colorado summaries and can be retried without reloading valid completed reports.
6. Merge/deploy the checked Colorado PR, verify deer/elk finder, unit report tabs, hunt histories, points sliders and overlapping seasons, then remove the temporary worker and maintenance service. Keep the permanent sync service disabled. Preserve local backup artifacts for rollback.

## Post-load harvest validation

The 2023 deer fourth-rifle PDF contains faint spreadsheet row numbers outside its real Unit column. The parser now locates Unit by its header, retains the correct GMU, and excludes impossible source count pairs from aggregation. A real two-page fixture covers GMUs 3, 201 and 301. Harvest parser v3 archives the previous parsed report before refreshing it. Summary generation validates every success rate before any transaction replaces current Colorado summaries; a post-load audit checks all reports, bounds and projected cutoff floors.
