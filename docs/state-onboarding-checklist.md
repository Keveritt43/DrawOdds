# State onboarding checklist

Use one copy of this checklist per state and release scope. Record evidence, links, dates, owners and outstanding gaps; mark an item not applicable with a reason rather than implying it passed. The goal is to extend the existing Idaho and Colorado experience and database to a unified search across all integrated states. See [AGENTS.md](../AGENTS.md), [multi-state search](multi-state-search.md) and [western state research](western-state-research.md). The checklist does not authorize production data operations.

State-specific starting worksheets: [Wyoming](states/wy-onboarding.md).

## Scope and sources

- [ ] Define state, species, hunt types, years, eligible users and intended release; identify unsupported or partial features. Inspect current Idaho/Colorado integrations, state registry, schema, shared finder and UI before choosing reusable extensions.
- [ ] Inventory official regulations, draw reports, harvest surveys, season dates, boundaries, land and access data, population data and fees where available. Record URLs, access terms, attribution, publication date, season year, format, update cadence, coverage, source granularity and missing or revised years.
- [ ] Record hunt codes, unit/area identifiers and stable state-qualified keys. Investigate boundary changes, split/merged units, multi-unit hunts and changes in reporting geography before joining or aggregating across years.
- [ ] Assess source reliability and agency estimation methods. For Montana, verify the owner's reported harvest-data limitations and cadence against current FWP reports; investigate validated supplemental metrics and leave unsupported scores unknown. Do not duplicate biennial observations or assume missing years are zero.

## Draw rules and data pipeline

- [ ] Document and verify each draw's current official rules: resident/nonresident eligibility, species, license and permit prerequisites, points and point type, application choices, phases, quotas, party rules and any separate pools. Record sources and effective years.
- [ ] Implement a state-specific odds adapter using the verified algorithm and available pool data. Distinguish observed results, estimates and projections; document assumptions and uncertainty. Do not treat another state's formula, point threshold, or OTC eligibility as a guarantee.
- [ ] Establish a reproducible, state-scoped import plan and retain source provenance and prior historical evidence. Preserve raw observations separately from derived values; identify how revised reports are handled. Never silently replace or delete historical data.
- [ ] Create representative fixtures and expected results from agency reports, including continuation pages, old formats, boundary changes, rare pools and ambiguous records. Validate identifiers, counts, units, dates, sample sizes and rates against sources; keep missing, suppressed or invalid data unknown.
- [ ] Reconcile imported records and calculated metrics by species, year, geography and draw pool. Report discrepancies and coverage; distinguish an agency estimate from a raw survey count, a tag holder from a hunter afield, and a broad-area aggregate from a unit-specific observation.

## Product integration

- [ ] Add the state to the shared registry and existing search/data architecture with appropriate species and capabilities. Review database keys and model assumptions; plan any necessary schema changes separately under the safeguards in `AGENTS.md`.
- [ ] Integrate per-state residency, eligibility and species/point settings without sharing personal data between users or overwriting other states' settings. Test account settings, saved units, editable saved filters and multi-state presets.
- [ ] Implement comparable shared filters and labeled state-specific filters; the latter restrict only their applicable state. Test season restrictions together, missing values, state-qualified unit collisions, combined-state selection and navigation back from hunt details.
- [ ] Follow the Idaho unit and hunt templates and the points-based Colorado example linked in `AGENTS.md`. Provide consistent hunt cards, details, graphs, maps and relevant state-specific data; label sources, years, historical versus projected odds and unsupported fields.
- [ ] Validate boundaries, unit labels, map framing, accessible legends and no-data shading. Check metric units, direction and aggregation; map results must represent all matches, not only the current results page. Do not imply public ownership guarantees legal access.
- [ ] Validate Quality components and species-specific benchmarks against appropriate evidence; document any state-specific adjustments and limitations. Keep Quality, personalized Opportunity, odds and metrics consistent across cards, details, filters, comparisons, maps and CSV; do not invent scores when inputs are inadequate.
- [ ] Measure cold and warm search latency, memory and representative concurrency as coverage grows; follow the scale guidance in [multi-state-search.md](multi-state-search.md).

## Verification and rollout

- [ ] Run appropriate parser, calculation and integration tests, typecheck, build and required CI. Cover official examples, residency/point isolation, no-data cases, multi-unit and overlapping seasons, state-specific filters, stable ordering, and agreement between map, list and export.
- [ ] Run the beginner and skeptical experienced-hunter UAT journeys defined in `AGENTS.md` on relevant desktop and mobile layouts. Record evidence, what works, bugs and severity, missing information and limitations; fix authorized issues and retest.
- [ ] Before any production data action, follow the historical-data protections and specific approval requirements in `AGENTS.md`. Prepare a fresh backup or read-only snapshot, reviewed state-scoped plan, validation and rollback procedure; verify existing states and non-target records remain unchanged. A checklist is not permission to sync agencies, run destructive schema operations, or re-enable automatic sync.
- [ ] On the `codex/` branch, prepare a PR and document sources, scope, checks, known gaps, data plan and rollback. Follow the standing deployment approval and its exceptions. After approved data actions and deployment, verify production health and the changed user journeys; keep automatic sync disabled unless its separate approval is obtained.
- [ ] Record the final support status, source coverage and unresolved gaps. Do not claim full support for a state or species when required capabilities remain incomplete.
