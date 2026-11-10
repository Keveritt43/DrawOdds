# Combined Find Hunts

The header selects the default state. Find Hunts has an independent, explicit `states=CO,ID` URL selection. Changing the header on Find Hunts starts a single-state search for the new state. Existing `/hunts` and state-specific links retain their current pages, with the new search-state picker added. Explicit selections use the shared finder, including single-state explicit selections.

## Shared behavior

- Available states come from the enabled state registry. Unknown codes are ignored; an empty valid selection falls back to the header state. The last selected state cannot be unchecked.
- Species, weapon, antler class, youth eligibility, season dates, success, public land, density, Quality and Opportunity share one filter contract.
- Every eligible regulation season must satisfy its weapon, sex, youth and date restrictions together. The combined finder opts into strict season matching; the legacy pages retain their existing semantics.
- State-specific restrictions remain visible when their state is selected and narrow only that state's rows. Notes name the applicable state and explain that other selected states are unchanged. Idaho mule/whitetail mix and trophy-share filters use Idaho data only. Colorado numbered seasons, points, chance, choice and overlap filters affect Colorado only. Local filters can be combined independently; public land, harvest success and other shared filters still constrain every selected state.
- Each selected state with its own filters gets its own collapsible group titled with that state ("Wyoming Filters"). Groups are generated from the selected states in `FilterRail` (`stateFilters`); never place one state's filters under another state's heading.
- Private-land-only hunts (license valid only on private land; landowner permission needed) are one shared filter, "Private-Land-Only Hunts", hidden by default in every selected state; `priv=1` shows them (`wyPriv=1` remains an alias for old links). `src/lib/privateLand.ts` holds the rule. Colorado and Wyoming set `HuntSummary.privateOnly` at import; Idaho is flagged at read time from IDFG's 2026 "Private land only" notes without rewriting production rows. Every state must declare `StateConfig.privateLandOnly`; Wyoming counts a license only when every season segment is limited to private land.
- Unit keys in combined search are `STATE:UNIT`. A bare unit-number text search searches that number in every selected state. Existing unit-detail URLs and favorites retain their established identifiers.
- The map merges independently fetched public boundary layers and fits the union of selected-state bounds. Changing ordinary filters does not refetch boundaries or reset the user's pan/zoom. Selecting a unit narrows to that state and unit. Aggregate shading covers all matches, independent of the visible result page.
- The table shows each eligible summary option, retaining Idaho's existing zone-tag visibility rules. General seasons can have more than one summary option for a unit; the hunt-card view groups Idaho general seasons by species, unit and weapon as before. By-unit view groups options by state and unit; a multi-unit hunt appears under each unit it covers.
- Results are sorted once, with a stable hunt-ID tie-breaker, before 40-item page slicing. By-unit view pages groups. CSV exports all matching options in the same search order, rather than only the visible page or repeated by-unit groups.
- Combined query URLs and per-state session history support detail-page back links. Combined search does not overwrite legacy saved-filter preferences.

## Personalization and evidence

Idaho residency is resolved explicitly, independently of the header state. Colorado uses its own residency, species points and youth pool. The inline Colorado settings control works even with Idaho selected in the header. Visitors can preview at the existing zero-point/nonresident defaults; the UI marks unset settings. Signed-in settings use the existing profile storage.

Opportunity uses the existing `Quality * sqrt(odds)` formula and is derived on copies of public facts. Idaho uses historical pooled controlled-draw odds and latest general-tag odds. Colorado uses the existing point-level projected or historical model. Public facts and cached scores are never modified by personal settings. Unsupported odds and scores remain null, appear after ranked hunts by default and cannot pass a positive minimum filter. Capped Idaho resident tags have unknown acquisition availability rather than a guaranteed 100% chance. Colorado general hunts require the applicant's residency to be eligible; OTC eligibility does not guarantee inventory.

Report years and odds basis remain visible. The release does not create a new projection model, harmonize agency reporting granularity, or recalculate Idaho scores. The source data's current season years can differ; calendar-date filtering uses the existing season-day convention rather than inventing future dates. Related Colorado seasons still require the same state, a shared unit and an actual overlapping open date; unknown dates do not establish absence of overlap.

Side-by-side comparisons use the same per-state personal metrics, including Colorado pronghorn points. Hunt and unit detail pages resolve residency from their own state rather than the header; their search links qualify the state and unit. Idaho unit-detail maps have a local Idaho context without changing the separate Unit Map page. Personalized unit-hunt responses are uncached so eligibility changes do not leave stale rows behind. States, personal controls and ranking explanations live in a collapsed setup section that scrolls away. Only counts, sorting and view/export/reset controls stay pinned. Per-card odds explanations are expandable; the primary metrics remain visible. Species points use evenly sized, labeled badges.

## Current performance design and next scale boundary

`searchData.ts` maintains a process-local public index, one entry per requested enabled state, rebuilt at most once per five minutes. Concurrent requests share the rebuild promise. Failed rebuilds are evicted for retry. Rebuilds only read the database; they never fetch agencies or write summaries. Public CO land/pressure/Quality work happens during rebuild instead of on every filter change. Personal settings, odds and Opportunity are not cached across users.

The current ID/CO implementation filters and sorts that cached index in memory. It is **not** database cursor pagination. Only a result page, map aggregates, and the necessary controls are rendered; raw index rows are not sent to the browser. The public geometry endpoint selects name and geometry only, with an hour-long public browser cache. Personalized exports remain private and uncached.

Before substantial state expansion, measure cold rebuild time, warm search latency, memory and full-request p95 at representative concurrency. The intended next step, if these exceed agreed budgets, is an additive searchable read model: normalized eligible season intervals, queryable point/pool/year odds, precomputed public Quality, measured composite/membership indexes, and SQL filtering/ranking with a compound continuation cursor. Do not add more per-state page forks. New draw systems need an explicit tested odds adapter; do not treat every new state as Colorado.

## Data protection and rollout

No Prisma schema change, migration, score rewrite, agency import or sync restoration is part of this release. Web startup remains Next.js only; automatic sync remains disabled. Existing historical summaries and raw reports are preserved.

Checks: existing unit tests, dedicated combined-search cases (residency/points isolation, season conjunction, unit collisions, state restrictions, missing values, overlap, stable ordering and CSV parity), typecheck and production build. After deployment check health, both legacy state pages, combined cards/table/by-unit views, selected-state map framing, state reset, unit click scope and filtered export. New-state onboarding must additionally verify source coverage, stable identity, eligibility, score evidence, dates and per-state query isolation.
