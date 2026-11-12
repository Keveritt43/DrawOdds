# Utah onboarding: plan for deer, elk, pronghorn and bison

Status (Nov 11, 2026): **plan only.** Nothing is built and no production data has changed. Use this with [state-adapter-guide.md](../state-adapter-guide.md) and [state-onboarding-checklist.md](../state-onboarding-checklist.md). Every rule below was checked against DWR's own pages, the 2026 guidebook or the administrative rule on Nov 11, 2026; the sources are listed in §9. Anything marked **verify** has not been confirmed and must not reach a page until it is.

## 0. What the earlier worksheet and the attached guide got wrong

- **"Odds reports are PDFs on the DWR odds page."** True through 2025 only. From the 2026 draw, DWR moved to a new draw system (utahdraws.com, run by Aspira) and **stopped posting static PDF odds reports**. 2026 odds exist only in an interactive tool at `utahdraws.com/drawodds`. The 2026 entries on DWR's odds page are empty. The data pipeline has to read that tool, and the 2026 shape will differ from 2021–2025.
- **"Utah: Hybrid 50/50 Bonus Points" (master guide).** Half right. The rule (R657-62-8) is: 50% of each hunt's permits go to the applicants with the **most** bonus points on their **first choice**, tier by tier until those permits run out (a preference queue, not a lottery). Everything left, plus everyone not drawn, goes to a random draw where each applicant gets **one random number for the application plus one per bonus point** and keeps the best. Ranking by the best of (points + 1) uniform numbers is mathematically the same as a weighted draw without replacement with weight points + 1. That gives us a model to simulate, not a closed-form formula.
- **"Draw odds = 1 − (1 − points/total)^quota"** (guide §5). Invalid, as already recorded in the adapter guide. Not used.
- **No skip-year point loss.** The rule's only forfeiture triggers are drawing a permit for that species (in or after the drawing) or a specific Wildlife Board rule. Don't copy Montana's "lose points if you don't apply" logic. **Verify** against the current rule text (the copy read was last changed Feb 7, 2025; a July 2025 R657-62 amendment package exists).
- **Hunt numbers are not stable.** Antelope Island bison was BI0001 in the 2024 harvest report and is BI6500 in 2026. Join years through boundaries and names, never hunt numbers alone (the Montana lesson again).
- **Bison doesn't fit the app as built.** `Species` (Prisma enum) and `SpeciesKey` have no BISON, and `drawOf()` files anything not moose/sheep/goat into the Deer/Elk/Pronghorn drawing. See §6.

## 1. Scope and release order

| Release | What ships | Why in this order |
|---|---|---|
| **UT-1: deer and elk** | Limited-entry (LE) and premium LE buck deer; LE bull elk; general-season buck deer (preference draw); general-season elk (any-bull, spike, archery: over the counter, no draw) | Standing rule: deer and elk first. General deer is the hunt most nonresidents actually draw. |
| **UT-2: pronghorn** | LE buck pronghorn | Same bonus machinery and data files as LE deer/elk, so mostly data. |
| **UT-3: bison** | Once-in-a-lifetime (OIAL) bison: hunter's-choice and cow hunts; Nine Mile (over the counter) and Antelope Island labelled separately | Needs an additive schema change (owner's yes), a new species everywhere in the UI, and a new score benchmark. |

Out of scope, labelled where they appear: antlerless deer/elk and doe pronghorn (separate June draw, preference points), CWMU permits (private land; nonresidents can't apply in the draw), dedicated hunter, landowner and mitigation permits, conservation, expo and sportsman permits, moose/sheep/goat.

Recommendation, challenge welcome: UT-1 and UT-2 parse the same files, so build both parsers together but release pronghorn only after deer/elk pass UAT. Bison is ~140 permits a year; its value is mostly for the experienced-hunter persona, so it goes last.

## 2. Draw rules to model (2026)

**Bonus points: LE deer, LE elk, LE pronghorn, OIAL bison.**
- 50% of each hunt's permits reserved for the highest point tier on first choice, then the next tier down, and so on. **Verify** the rounding when a pool has an odd number of permits (especially a single nonresident permit): read it off the 2021–2025 reports, where every hunt prints bonus and regular permits per point level.
- Random draw: entries = points + 1. Simulate it (adapter guide §4), seeded, without replacement.
- Choices: bonus permits use first choice only. **Verify** the number of choices allowed for LE/OIAL and how later choices draw.
- Resident and nonresident quotas are separate per hunt. Remaining LE deer/elk/pronghorn permits get a second evaluation that can cross between the two quotas (R657-62-18(4)(c)); that crossover is not stated for OIAL. Use the published pool counts; don't assume 10%.
- Groups: up to four for LE deer, elk and pronghorn; points averaged and rounded down. **No groups for OIAL.** Model single applicants; flag party effects as a limitation.
- Waiting periods after drawing: LE buck deer 5 years, LE bull elk 5 years, LE buck pronghorn 2 years, bison never again (including the Nine Mile over-the-counter permit). These are eligibility rules the account and cards must state.
- One LE/OIAL permit per person per year. Residents may apply for one species per hunt type; nonresidents may apply for every LE and OIAL species plus one general-season species.

**Preference points: general-season buck deer.**
- One point per unsuccessful application or point-only purchase; drawing forfeits them; a point works for any general deer unit.
- 20% of each unit's general buck permits go to youth. Groups of up to four, points averaged and rounded down.
- Model as Colorado's preference queue per unit and pool (`coOdds.ts` pattern), with the cutoff read from the reports. **Verify** the number of choices and whether later choices draw.

**Over the counter: general-season elk.** Any-bull (early hunt capped at 15,000 adult permits), spike (15,000, multiseason cap 4,500), archery. On sale July 7 (archery), July 9 (any-bull), July 16 (spike) in 2026. These cards show "No draw" plus the cap, the same treatment as Montana's B licences (`kind: 'otc'`). The youth any-bull/hunter's-choice draw (750) is youth-only: out of scope for UT-1.

**Bison specifics (2026 guidebook p. 65).** 16 drawn hunts: Book Cliffs (Bitter Creek; Little Creek/South) and Henry Mtns, hunter's choice and cow-only, any legal weapon and archery, plus Antelope Island (BI6500). A new cow hunt (BI6539, Henry Mtns) was added for 2026–27. **Verify:** whether cow-only permits are OIAL (lifetime) and use bison bonus points; whether nonresidents can draw Antelope Island (the table shows only a resident fee); 2026 permit split by residency.

## 3. Data sources and pipeline

| Element | Source | Years | Notes |
|---|---|---|---|
| LE/OIAL odds by point level, res/NR | `wildlife.utah.gov/pdf/bg/YYYY/YY_bg-odds.pdf` | 2021–2025 | Per hunt: applicants and eligible applicants, bonus and regular permits, success ratio, per point level, residents left / nonresidents right. Interleaved columns; parse by x/y. |
| General buck deer odds | `.../YY_deer_odds.pdf` (+ youth, dedicated hunter, landowner files) | 2021–2025 | Preference points by unit. |
| **2026 odds, all hunts** | `utahdraws.com/drawodds` (interactive) | 2026 | Read the tool's own data requests in Claude in Chrome; never scrape rendered text if a JSON source exists. Confirm its fields match the PDF fields before joining. |
| LE/OIAL harvest per hunt | `.../pdf/bg/YYYY/YYYY_le_oial_all.pdf` | 2015–2025 (index page stops at 2023; 2024 files exist) | Permits, hunters afield, harvest, avg days, success %, satisfaction. No res/NR split. |
| General buck deer harvest by unit and weapon | `YYYY_gs_buck_deer_hr.pdf` | 2015–2025 | Hunters afield, harvest, days. |
| General elk harvest by unit (any-bull, spike, archery) | Annual big game report `annual_reports/big_game/YY_bg_report.pdf` (elk pp. 60–99 in 2024) | 2019–2024 | Not in the harvest-data index; it's in the annual report. |
| Preliminary current-year harvest | `pdf/bg/2025/2026-03-06-2025-preliminary-bg-harvest.pdf` | 2025 | Label preliminary; replace when final. |
| Population | Annual report (deer post-season estimates by unit 2020–24; elk, pronghorn, bison sections) | | Herd/unit granularity varies by species; never assign a herd total to each hunt. |
| Hunt boundaries | `dwrmapserv.utah.gov/.../hunt/Boundaries_and_Tables/MapServer`: layer 0 polygons (`BoundaryID`); table 1 `HUNT_INFO_MOBILE` (`HUNT_NUMBER` → `BOUNDARYID`, text) | current; `Utah_Big_Game_Hunt_Boundaries_2024` on ArcGIS Online for history | Polygons are per hunt boundary, not per management unit. maxRecordCount 1000. Join needs a type cast. |
| Regulations, dates, quotas, fees | 2026 Big Game Application Guidebook (digital only) and the Hunt Planner | 2026 | 2027 guidebook not out yet; label as 2026. |
| Land ownership | BLM national SMA (as Montana) | current | Utah trust lands (SITLA) are state; DWR publishes SITLA access layers per species. Tribal land (Uintah & Ouray) is not public. |

Pipeline: `scripts/ut_parse_odds.py` (PDFs), a Chrome-side extractor for 2026, `scripts/ut_parse_harvest.py`, `scripts/ut_build_units.ts`, `scripts/ut_build_land.py`, `scripts/ut_build_hunts.py` → `data/ut/*.json` with sources in `data/ut/source/`, then `scripts/ut-import.ts` (Utah rows only; aborts if any other state's rows change). Reach: the shell can't reach DWR; use Claude in Chrome (pdf.js on the wildlife.utah.gov tab; one download per tab).

## 4. Identity and units

- Hunt slug `ut-<hunt number lowercased>` (e.g. `ut-bi6503`), year-scoped in data.
- Unit key `ut-<BoundaryID>` with DWR's boundary name. Utah hunts are drawn on hunt boundaries (e.g. "Book Cliffs, Bitter Creek") that don't line up with management units, and boundaries differ by species and hunt type; the map shows one species' boundaries at a time (Wyoming pattern).
- Year-to-year history: match boundaries by geometry overlap (≥ 98%, Montana's rule), then hunt name. A renumbered hunt on the same boundary keeps its history; a redrawn boundary starts fresh and says so on What Changed.

## 5. Model validation (before any odds ship)

1. **Reproduce 2025** for every LE/OIAL hunt and pool: the bonus half must give exactly the published bonus permits per point level; the simulated random half must land within simulation error of the published regular permits. Same for general deer cutoffs. Record any hunt that doesn't reproduce and why.
2. **Backtest projections** 2023–2026 (predict each year from earlier years only), Brier against "last draw's odds", per species and residency. Ship projected odds only where they win; otherwise last draw, labelled (Wyoming elk precedent).
3. Fixtures: a single-NR-permit hunt, a hunt where the bonus half runs below max points, a bison hunt, a general deer unit with a partial cutoff, a 2026 record from the new tool.

## 6. App work

- **Schema (UT-3 only, needs the owner's yes):** add `BISON` to the `Species` enum (`ALTER TYPE "Species" ADD VALUE 'BISON'`, additive, no rows change). Then `SpeciesKey`, labels, colours, icons, filters, the drawing grouping (`drawOf` must not put bison in Deer/Elk/Pronghorn), a bison score benchmark in `score.ts` (success is near 100% on some hunts, so the deer/elk curve would overrate it), and Montana's later bison can reuse it.
- **States registry:** `UT` in `src/lib/states.ts` with `privateLandOnly` (CWMU hunts; plus any hunt whose every boundary is private: **verify** from guidebook text), `features`, map bounds.
- **Odds adapter:** `src/lib/utOdds.ts` (bonus: tiered first-choice half + seeded simulation; preference: Colorado-style queue) and `src/lib/utPoints.ts`.
- **Account (point tracker):** bonus balances for LE deer, LE elk, LE pronghorn, bison; preference balance for general deer; last-drew year per species so the waiting period shows ("eligible again in 2029"). Saved as `User.points.UT`.
- **Finder and pages to Idaho parity:** "Utah Filters" group (hunt type LE / premium LE / OIAL / general / OTC; weapon; waiting period), shared private-land-only filter, cards with the three panels, hunt pages with odds-by-points table and charts, point creep at max points, harvest trend, land bar, overlapping general elk seasons on deer pages; unit pages; map with Utah metrics. Planner, What Changed and How The Draw Works pages for Utah (the Montana #91–#93 pattern), with the plain-language headline: *half the tags go to the most points; everyone else, including zero points, is in a weighted random draw.*
- **Costs:** 2026 guidebook figures, labelled "2026 guidebook": application fee $10 resident / $21 nonresident per species or point (+2.2% transaction fee); permits resident/nonresident: general deer $46 / $599, LE deer $94 / $1,070, general any-bull elk $56 / $849, LE elk $314 / $1,950, LE pronghorn $63 / $571, bison $460 / $4,840 (Antelope Island resident $1,221). A Utah hunting licence is required to apply; **verify** its 2026 price before showing a total.
- **Dates:** 2026 application March 19 – April 23, results by May 31; OTC elk on sale July 7/9/16. 2027 dates unknown until DWR posts them.

## 7. Steps, in order

1. Fetch and archive every source in §3 (Chrome), including a sample of the 2026 tool's raw responses.
2. Parse 2021–2025 LE/OIAL and general deer odds; reconcile per-hunt totals; reproduce 2025 (§5.1).
3. Extract 2026 odds from utahdraws.com; confirm its fields against 2025; reproduce 2026.
4. Boundaries + hunt join (`HUNT_INFO_MOBILE`) → `data/ut/units.json`; history crosswalk by overlap.
5. Harvest join per hunt (LE/OIAL) and per unit and weapon (general deer, general elk); public land per boundary.
6. Backtest projections (§5.2).
7. Build deer/elk hunts, registry, adapter, filters, cards, pages, map, account tracker, Utah menu pages; CI; reviewed dry-run import → owner's yes → apply → verify live at desktop and 390 px. (UT-1 ends.)
8. Pronghorn: same path. (UT-2.)
9. Bison: ask the owner for the enum change; species plumbing; benchmark; import; verify. (UT-3.)

## 8. Open questions (need answers before the step that uses them)

- Odd-permit rounding between the bonus and random halves (step 2).
- Choice counts for LE/OIAL and general deer, and whether later choices draw (step 2).
- Cow bison: OIAL lifetime and bonus points or not; Antelope Island nonresident eligibility (step 9).
- Whether the July 2025 R657-62 package changed point or forfeiture rules (before step 7 copy).
- Utah hunting licence price, 2026 (before showing costs).

## 9. Sources (checked Nov 11, 2026)

- [How bonus and preference points work](https://wildlife.utah.gov/how-bonus-and-preference-points-work.html)
- [R657-62 Drawing application procedures](https://wildlife.utah.gov/r657-62.html); [R657-62-8 Bonus points (Cornell LII copy)](https://www.law.cornell.edu/regulations/utah/Utah-Admin-Code-R657-62-8)
- [2026 Big Game Application Guidebook](https://wildlife.utah.gov/guidebooks/biggameapp.pdf)
- [New Utah draw application system (utahdraws.com, Aspira; PDF odds discontinued)](https://wildlife.utah.gov/draw.html); [Drawing odds and point results index](https://wildlife.utah.gov/drawing-odds-and-point-results.html)
- [2024 LE/OIAL odds](https://wildlife.utah.gov/pdf/bg/2024/24_bg-odds.pdf); [2025 general deer odds](https://wildlife.utah.gov/pdf/bg/2025/25_deer_odds.pdf)
- [Big game harvest data index](https://wildlife.utah.gov/hunting/main-hunting-page/big-game/big-game-harvest-data.html); [2024 LE/OIAL harvest](https://wildlife.utah.gov/pdf/bg/2024/2024_le_oial_all.pdf); [2024 annual big game report](https://wildlife.utah.gov/pdf/annual_reports/big_game/24_bg_report.pdf)
- [DWR hunt boundaries service](https://dwrmapserv.utah.gov/dwrarcgis/rest/services/hunt/Boundaries_and_Tables/MapServer/layers?f=pjson)
- [2026 application period announcement](https://www.theoutdoorwire.com/releases/2026/03/want-the-chance-to-hunt-big-game-in-utah-in-2026-the-application-period-opens-march-19/); [2026 permit numbers approved](https://wildlife.utah.gov/news/2026/05/01/utah-wildlife-board-approves-2026-big-game-hunting-permits)
