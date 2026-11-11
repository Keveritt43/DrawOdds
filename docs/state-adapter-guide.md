# State adapter guide: making a new state look and work like Idaho

How to take a new state from agency reports to the same pages, cards, filters and maps Idaho has. Use it with the rules in [AGENTS.md](../AGENTS.md) and the evidence log in [state-onboarding-checklist.md](state-onboarding-checklist.md). Metric definitions are in [data-dictionary.md](data-dictionary.md), combined-search behavior in [multi-state-search.md](multi-state-search.md), and source leads in [western-state-research.md](western-state-research.md). This guide covers **how the pieces fit**. When it disagrees with the code, the code is right and this file needs fixing.

## 1. The shape every state must fit

Each state is an entry in `src/lib/states.ts` (`StateConfig`: agency, `points` system, drawings, species, map bounds, `features` flags) plus one row per hunt option in `HuntSummary`. Pages, cards, the map, filters and CSV read `HuntSummary` (through `src/lib/searchData.ts` → `multiStateSearch.ts`), never the raw reports. So onboarding a state means four things:

1. **Raw tables:** agency data parsed as it was published, with its source and year (`StateReport`, `DrawRecap`, `Hunt`, `Unit` keyed by `state`).
2. **Summary build:** raw data → `HuntSummary` columns, with the same meanings as Idaho's (table below).
3. **Odds adapter:** a pure, client-safe module (`src/lib/<st>Odds.ts`, like `coOdds.ts`) that turns the hunter's residency, points and pool into odds.
4. **UI wiring:** state-specific filters registered as restrictions (`src/lib/searchStates.ts`, like `CO_RESTRICTIONS`), feature flags, and detail-page sections where the state has data Idaho does not.

Identity rules: unit keys are `unitKey(state, name)` (`54` for Idaho, `co-70` elsewhere) and `STATE:UNIT` inside combined search. Hunt slugs are prefixed by state (`co-dm040o2r`). The same number in two states must never collide.

## 2. Matching data elements to Idaho

For each row, find the state's source, record its years and granularity, and fill the same column. If the state has nothing comparable, leave it **null** and label it in the UI. Never copy an Idaho value or put 0 in for a missing one.

| Idaho element (what the hunter sees) | `HuntSummary` field(s) | Colorado source | What to find in a new state | If missing |
|---|---|---|---|---|
| Hunt identity, units, weapon, antler class | `name`, `tagCode`, `units`, `weapon`, `antlerClass`, `youthOnly` | Hunt code decoded (`decodeCode`), W-2 unit lists | Hunt code scheme, unit/area list per code, partial-unit text | Not optional |
| Season dates | `openDate`, `closeDate`, `seasonDays`, `months` | W-2 regulations | Regulations per year; dates for the year the odds are for | Null dates; date filter excludes nothing |
| Tags / quota | `tags`, `permitsLast` | Draw recap, W-2 licenses | Quota per code and pool | Null |
| Draw odds, last draw | `resOddsLast`, `nrOddsLast` (+ point-level JSON) | Draw recap by points | Applicants and successes by pool (and by points if points exist) | Unknown odds, not 0% |
| Draw odds, multi-year | `resOdds5`, `nrOdds5`, `oddsYears` | Recap 2021–2026 | 3–5 years of the same report | Show what exists, with its years |
| Points needed / creep | `ptsRes`, `ptsNr`, `creep*`, `pointOdds`, `oddsByPts` | Drawn-out-at levels | Only for point systems; the cutoff per pool | Hide the row (Idaho has none) |
| Harvest success (5 seasons pooled) | `success5`, `hunters5`, `harvest5`, `harvestYears` | CPW harvest estimates | Harvest and **hunters afield** for the same unit, season and weapon | Null; Quality unknown |
| Hunter density / elbow room | derived: `(hunters5 / harvestYears) / (acres / 640)` | Unit hunters ÷ unit acres | Same hunter count, plus area | Null |
| Public land / access | `publicPct`, `huntablePct` | BLM SMA overlay (`scripts/build-co-land.py`) | Ownership layer clipped to the unit geometry | Null; never "0% public" |
| Trophy share | `bigPct5` | none (CPW has no antler-point data per code) | Only if the agency reports it | No trophy modifier |
| Effort | `daysPerHunter5`, `daysPerHarvest5` | CPW days | Days afield | Null |
| Population / objectives | `StateReport` kind `population`; Idaho `elkObjectives` flag | CPW post-hunt estimates by DAU | Herd estimates and the units each herd covers | Section hidden |
| Unit boundaries | `Unit.geometry`, `acres` | CPW GMU layer | Agency GIS layer, the version for the report years | Map off for that state |
| Quality, Opportunity | computed at read time (`score.ts`, state adapter) | `coScores.ts` | Nothing new; it needs success, access and density | Unknown if any input is missing |

State-specific facts with no Idaho column (hybrid draw, second-choice drawing, private-land-only, OTC eligibility, party rules) go in JSON on the summary (`pointOdds`) or in `StateReport`. Add a real column only when the value is filtered, sorted or mapped across states, and plan the schema change under the safeguards in AGENTS.md.

## 3. Parsing agency reports (lessons that cost time on Colorado)

- **Read text with its position.** PDFs wrap cells and continue tables onto the next page. Parse with x/y positions, end a hunt at its own total row, and check that each row's total matches its parts. Report failures; don't skip them silently.
- **Expect broken PDFs.** Two-digit numbers split across items ("1 8"); road numbers in boundary text read as units ("US 50"; keep only known units); faint spreadsheet row numbers outside the real column; a header that names the wrong season; fonts with broken Unicode (CO population 2022 had to be read off rendered pages). Fix each one, and keep a real page from the source as a test fixture.
- **Check totals against the agency's own totals.** Herd sums match the statewide figure. Applicant sums match the report's grand total. When the source disagrees with itself, keep both numbers and say so.
- **Keep the source's granularity.** Unit-season harvest is not hunt-code harvest. Label it (`basis: 'code' | 'units' | 'units-all'`) and never assign a multi-unit total to each unit as if it were local.
- **Version the parsers.** A parser change refreshes older reports and archives the previous parsed version; it doesn't overwrite history.
- **Find every report yourself.** Before you call a source missing, search the agency's site, its document host (CPW uses widen) and its GIS portal. Colorado's harvest reports, W-2 regulations and GMU layer were all there to find.

## 4. Draw odds: models by draw system

All odds are fractions from 0 to 1, per pool (resident, nonresident, youth…) and per choice. Show the hunter what the number is: **last draw** (what happened) or **projected** (a model). Use "Unavailable" when it can't be computed.

### Random draw, no points (Idaho controlled hunts; New Mexico)
- Last draw: `drawn / first-choice applicants` for the pool. Idaho's pooled 5-year odds pool the counts (Σ drawn ÷ Σ applicants); they are not an average of the yearly percentages.
- Separate pools (NR caps, outfitter pools in NM) and later choices change who competes. Use the published pool counts; `quota / applicants` is only a rough indicator.

### Preference points (Colorado; Oregon's 75% phase; Wyoming nonresident preference phase)
- Licenses go to the highest points first. The **cutoff** is the level where they run out; everyone above it draws; at the cutoff the odds are `remaining licenses / applicants at that level`; below it the odds are 0 (except a random or hybrid phase).
- **Effective points** put the cutoff on one scale: cutoff points + (1 − share drawn at the cutoff). 6 points with 60% drawn = 6.4.
- **Projection for next year** (`coOdds.project`): start from the last draw. A floor is set by the **returning cohort**: everyone who failed returns with +1 point, winners leave, and supply stays fixed. Then calibrated year-to-year moves are applied (deciles by residency and point band, measured across every code). The cutoff never falls below the last draw or the cohort floor. Odds are averaged over the outcomes and scaled by the share above the cutoff who actually draw (res 0.965, nr 0.935).
- **Point creep:** a 5-year least-squares slope of effective points, never negative. It is shown as creep and as "years to draw", and is not used for next year's cutoff.
- A split preference/random draw (OR 75/25, WY 75/25 nonresident, CO hybrid for 5+ points, CO from 2028 50/50 preference/bonus) needs both phases modeled, with winners removed from the preference phase before the random phase.
- **Who is eligible for the random phase is a per-state fact, not a given.** Montana's nonresident combination draw is 75/25, but the random 25% is restricted to **zero-point** applicants, so applicants below the cutoff and above zero draw at exactly 0% — a shape no other state in the app has. Verified against the 2026 report; see [states/mt-onboarding.md](states/mt-onboarding.md) §3.1. Check this before reusing Wyoming's or Oregon's split.

### Bonus or weighted lottery (Montana, Nevada, Washington, Arizona random pass, Utah 50/50 bonus half)
- Each applicant gets a state-specific number of entries: points+1, (points+1)², points²+1… Verify the exact function per state and year (see western-state-research.md). Points are never "tickets you can win with twice".
- **Don't use `1 − (1 − entries/total)^quota`.** It treats each license as an independent draw with replacement, so one applicant can win more than once, and it never removes winners. It can be wrong in either direction. Example: 3 applicants and 3 tags, so everyone draws (100%). For a 1-entry applicant among 11 entries the formula gives 1 − (10/11)³ = 25%.
- Instead, use a **Monte Carlo simulation without replacement** of the published algorithm: build the applicant pool from the published applicants-by-points table; draw a weighted winner; remove all of that winner's entries; repeat until the quota is gone; apply pool caps, choice order and party rules where they are published. Run enough trials that the odds at each point level are stable to ±0.5%. Seed the generator so the results can be reproduced.
- Arizona-style bonus passes (a share of tags to max points first, then random): run the pass, remove its winners, then simulate the rest.

### Validation every model must pass before it ships
1. **Reproduce the past.** Feed the model last year's published applicant counts. Its last-draw odds must match the agency's published results (exactly for preference; within simulation error for lotteries).
2. **Backtest the projection.** Predict each year Y from years before Y only. Score with Brier = mean((p − drew)²) over applicants at each point level, weighted by applicants. The projection must beat the naive baseline "next year = last year's odds" for both residencies. If it doesn't, ship last-draw odds only and label them as such. Record the numbers in the state doc.
3. Unit tests with real fixtures: a strict cutoff, a partial-level cutoff, an empty pool, a hybrid draw, and a pool cap.

Colorado history, for reference: the original decile projection beat last year's odds (Brier, deer 2024–2026: nonresident 0.080–0.085 vs 0.098–0.107; resident 0.051–0.055 vs 0.058–0.066). A re-draw simulation and a 5-year trend both did **worse** than last year's odds and were rejected. The returning-cohort floor was added later and **has not been backtested yet**. The comment on `projectedOdds` still quotes the old numbers.

## 5. Display parity checklist (compare against the live reference pages in AGENTS.md)

- Hunt card: the same three tinted stat panels (personal draw odds, 5-year success, hunters/sq mi), Quality/Opportunity with their explanation, and a points row only for point states.
- Hunt page: odds by points table and graph (point states), odds history, harvest trend, population, land bar, overlapping seasons, sources with years.
- Unit page: land, population, the list of hunts with odds at the user's points, and a link to Find Hunts filtered to the unit.
- Map: the same metric choices (`mapMetrics.ts`) plus state-specific ones (points needed, creep); missing values unshaded; a legend that says which way is better.
- Filters: shared filters apply to every selected state; state filters are labeled with the state and restrict only that state.
- Account: residency and points per state **and species**; saved units and presets grouped by state.
- Check on a phone-width screen and on desktop, in single-state and combined search.

## 6. Data loading in production (current process)

Web startup runs Next.js only. Agency fetches and summary rebuilds run as a reviewed, state-scoped one-off worker (Colorado: `scripts/co-maintenance.ts` with `railway.co-maintenance.json`, restart policy NEVER). It backs up first, checks that every other state's summaries are unchanged, and is removed afterwards. Automatic sync stays off. The `SYNC_ON_START` hook is still in `src/instrumentation.ts`, but it runs agency sync on web startup, which AGENTS.md forbids. Don't use it.
