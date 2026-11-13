# Utah onboarding: plan for deer, elk, pronghorn and bison

Status (Nov 11, 2026): **sources fetched and the draw model checked against 2021–2026 results (§5a); nothing built yet.** No production data has changed. Use this with [state-adapter-guide.md](../state-adapter-guide.md) and [state-onboarding-checklist.md](../state-onboarding-checklist.md). Every rule below was checked against DWR's own pages, the 2026 guidebook or the administrative rule on Nov 11, 2026; the sources are listed in §9. Anything marked **verify** has not been confirmed and must not reach a page until it is.

## 0. What the earlier worksheet and the attached guide got wrong

- **"Odds reports are PDFs on the DWR odds page."** True through 2025 only. From the 2026 draw, DWR moved to a new draw system (utahdraws.com, run by Aspira) and **stopped posting static PDF odds reports**. 2026 odds exist only in an interactive tool at `utahdraws.com/drawodds`. The 2026 entries on DWR's odds page are empty. The tool is backed by a JSON endpoint (§3), which is better data than the PDFs: it carries each pool's quota and its max-point and regular-round quotas.
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
- 50% of each hunt's permits reserved for the highest point tier on first choice, then the next tier down, and so on. **Rounding (verified):** per residency pool, max-point permits = ceil(quota ÷ 2), **except a pool with a single permit, which goes to the random round**. DWR's own 2026 quotas match this in 760 of 760 pools; the 2021–2025 reports match it in 4,125 of 4,135 oversubscribed pools (the 10 misses are pronghorn pools where more permits were issued than the pool's quota). It is the same rule every year; a one-permit hunt does not alternate.
- Random draw: entries = points + 1. Simulate it (adapter guide §4), seeded, without replacement.
- Cow bison: the 2026 tool lists the cow hunts (e.g. BI6539) under species Bison, Once-in-a-lifetime, so they use bison bonus points and the lifetime rule. **Verify** the lifetime rule in the guidebook text before stating it.
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
| **2026 odds, all hunts** | `utahdraws.com/drawodds`, backed by `GET /internetsales/Home/DrawOddsData?drawName=Big Game&licenseYear=2026&masterHuntTypeID=<id>` (JSON; same-origin, so call it from a utahdraws.com tab) | 2026 only (the tool offers no earlier year) | IDs: 5 general buck deer, 32 dedicated hunter, 6 youth elk, 8 LE deer (193 hunts), 9 LE elk (210), 10 LE pronghorn (88), 12 bison (17), 11 moose, 13/14 sheep, 15 goat. Per hunt: resident/nonresident quota, max-point and regular-round quotas, youth quotas; `OddsList` per residency × point: `ParticipantCount` (first choice), `SuccessfulByMaxPointRoundCount`, `SuccessfulByRegularRoundCount`, and all-choices counts. |
| LE/OIAL harvest per hunt | `.../pdf/bg/YYYY/YYYY_le_oial_all.pdf`, listed on `wildlife.utah.gov/biggame/reports` | 2010–2024 (**2025 not published yet**, Nov 11) | Permits, hunters afield, harvest, avg days, success %, satisfaction. No res/NR split. |
| General buck deer harvest by unit and weapon | `YYYY_gs_buck_deer_hr.pdf` | 2010–2024 final; 2025 as `2025_gs_buck_deer_hr-preliminary.pdf` | Hunters afield, harvest, days. |
| General elk harvest by unit (any-bull, spike, archery) | Annual big game report `/pdf/annual-reports/big-game/YY_bg_report.pdf` (hyphens; the underscore path now 404s; 2024 is 13.7 MB, elk pp. 60–99) | 2020–2024 | Not in the harvest-data index; it's in the annual report. |
| Preliminary current-year harvest | `pdf/bg/2025/2025_gs_buck_deer_hr-preliminary.pdf` (the `2026-03-06-…` file found by search now 404s) | 2025 | General deer only. Label preliminary; replace when final. |
| Population | Annual report (deer post-season estimates by unit 2020–24; elk, pronghorn, bison sections) | | Herd/unit granularity varies by species; never assign a herd total to each hunt. |
| Hunt boundaries | `dwrmapserv.utah.gov/.../hunt/Boundaries_and_Tables/MapServer`: layer 0 polygons (`BoundaryID`); table 1 `HUNT_INFO_MOBILE` (`HUNT_NUMBER` → `BOUNDARYID`, text) | current (2026 seasons); `Utah_Big_Game_Hunt_Boundaries_2024` on ArcGIS Online for history | 709 polygons, 3,063 hunt → boundary rows (all species and hunt types). CORS works from a Chrome tab. Polygons are per hunt boundary, not per management unit. maxRecordCount 1000. Join needs a type cast. Example: BI6503 and BI6539 (Henry Mtns) are both boundary 637. |
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

## 5a. Results of the checks (Nov 11, 2026)

Run in Claude in Chrome against DWR's own files: pdf.js on the 2021–2025 `YY_bg-odds.pdf` reports, the JSON endpoint for 2026.

**Parsing.** The bonus-point reports are one hunt per page, point levels as columns, resident block above the nonresident block. Every hunt page in all five years reconciles (applicants, bonus, regular and total permits each sum to the printed totals; bonus + regular = total at every level): 2021 550 hunts, 2022 559, 2023 580, 2024 580, 2025 594, zero failures. The hunt name sometimes sits on three separate text items, and the totals column moves (x 525 in 2025, 514 in 2024); the parser keys on the "Totals" label, not a fixed x. The 2025 general buck deer report (`25_deer_odds.pdf`, 106 hunts) has the same layout with wider columns and also reconciles fully.

**Max-point round.** The rounding rule in §2 holds (760/760 pools in 2026, 4,125/4,135 in 2021–2025). Within a pool, the max-point permits go to the top point levels in order in 572 of 605 pools in 2025 and 723 of 745 in 2026. The misses are a few high-point applicants left undrawn at a level, consistent with group applications that can't all fit (groups up to four, averaged points). Model single applicants and say so.

**Random round: points + 1 entries is right.** Expected regular-round permits per point level (weighted draw without replacement, solved exactly for the expected value; a 1,500-run Monte Carlo agreed to the 4th decimal on BI6503), compared with what DWR issued:

| Year | Pools | Brier, points + 1 | Brier, no weighting | Brier, (points + 1)² |
|---|---|---|---|---|
| 2021 | 790 | 0.01144 | 0.01172 | — |
| 2022 | 802 | 0.01149 | 0.01172 | — |
| 2023 | 847 | 0.01251 | 0.01280 | — |
| 2024 | 845 | 0.01249 | 0.01277 | — |
| 2025 | 851 | **0.01309** | 0.01340 | 0.01329 |
| 2026 | 745 | **0.02033** | 0.02070 | 0.02082 |

2025 regular permits by points held, issued vs model: 0 pts 274 vs 281; 1: 333 vs 332; 2: 327 vs 336; 3: 342 vs 342; 4: 338 vs 335; 5–9: 1,202 vs 1,198; 10–19: 790 vs 792; 20+: 122 vs 113. Without weighting, 0 points would have drawn 744 and 20+ only 48; with squared points, 0 points 133 and 20+ 179. Both are clearly wrong. 2026 is close but looser at the ends (0 pts 346 vs 309; 20+ 64 vs 81); recheck once later choices are modelled.

**General buck deer (preference) 2025:** a strict queue per unit and pool fits. 1.25% of applicants above the cutoff didn't draw, 0.006% below it did, and no permit was a "bonus" permit. Brier 0.071 for the queue against 0.184 for a flat lottery.

**What these checks are not:** they reproduce published results from published applicant counts. They are not yet a projection backtest (§5.2), which needs the next-year applicant counts the model can't know.

**Source data in the repo (Nov 11, 2026)**, in `data/ut/source/`, fetched in Claude in Chrome and copied through the owner's `Downloads\huntapp\ut` folder (SHA-256 prefixes checked on both ends):

- `odds-2021-2025.json` (1.5 MB, `4b32d3fefc722e1c`): every hunt page of `YY_bg-odds.pdf` and `YY_deer_odds.pdf`, 2021–2025, parsed as above. Per hunt and pool: `levels` = [points, eligible applicants, max-point permits, random permits, total permits] at first choice, plus the printed totals.
- `odds-2026.json` (1.1 MB, `4437868606c4f5d6`): the `DrawOddsData` JSON for all 11 big-game species IDs, trimmed to the quota fields and `odds` rows in the order of `oddsFields`.
- `hunt-boundaries.json` (6.5 MB, `3c2aca70f1b68876`): DWR's 709 hunt-boundary polygons (WGS84, generalized to 0.0005°) and the 3,063-row hunt → boundary table, current 2026 seasons.

## 5b. Built data (Nov 12, 2026, PR "Utah data")

All built offline from files saved in Claude in Chrome; raw GIS inputs too big for the repo (BLM SMA 40 MB, 10 m boundaries 13 MB) are in the owner's `Downloads\huntapp\ut`.

- **Harvest** `data/ut/source/harvest-2020-2025.json`: LE/OIAL per hunt 2020–2024 (2,915 hunt rows; 2020–2021 have no weapon column and split bison male/female), general buck deer per hunt 2020–2024 (776 rows), DWR's **2025 preliminary report for every hunt and species** (1,120 rows; correction: the file named `2025_gs_buck_deer_hr-preliminary.pdf` covers all species, so 2025 LE harvest *is* published, preliminary), and general-season elk by unit from the annual reports 2020–2024. DWR states success and averages are computed from raw survey answers, not from the projected hunters/harvest, so printed success ≠ harvest ÷ hunters. General elk unit rows sum exactly to DWR's statewide totals in 2024 and within 0.5% in 2020–2023 (some units repeat per subunit). The 2024 extended-archery table's bull/cow/calf columns did not parse cleanly; its totals do.
- **Hunt → boundaries**: the Utah Hunt Planner's `HuntNumberToBoundaries?HN=<hunt>` gives every hunt's boundary IDs (976 hunts; the MapServer's `HUNT_INFO_MOBILE` table was missing many LE elk hunts). General elk any bull hunts (EB1001) cover 29 boundaries, spike hunts 24.
- **Land** `scripts/ut_build_land.py` → `data/ut/land.json` and `data/ut/units.json` (709 boundaries, display outlines ~60 m). BLM SMA, every feature intersecting Utah (49, incl. Navajo lands administered from AZ/NM). Montana's centre-sampled 100 m raster. Statewide: federal 64.4% (BLM 42.0, Forest Service 15.0, NPS 3.9, DOD 3.3), state 9.9%, tribal 4.5%, private 21.2%: matches the published ~63% federal, ~9% state, ~4.5% tribal.
- **Regulations** `data/ut/source/guidebooks-2026.json`: text of the 2026 application and field regulations guidebooks. Season dates come from the 2026 draw data per hunt; general elk dates from field regs p. 8.
- **Hunts** `scripts/ut_build_hunts.py` → `data/ut/hunts.json`: 515 deer and elk hunts: LE deer 69, premium LE deer 9, management buck 4, LE elk 145, CWMU deer 110 and elk 64 (private-land-only; residents only in the public draw), general buck deer 106 (preference queue), the draw-only youth any bull elk hunt, and 7 over-the-counter general elk hunts. The bonus model run on 2026's own applicants expects 6,114 permits drawn against DWR's 6,119. Left out: dedicated hunter, antlerless, landowner, conservation/expo, EB1012 (private-lands any bull, no boundary). Pronghorn and bison: UT-2 and UT-3.

## 5c. Projection backtest (Nov 12, 2026)

`scripts/ut_backtest.py` → `data/ut/backtest.json`. Every bonus-point hunt (limited-entry deer, elk, pronghorn; bison) and every general buck deer unit, 2023–2026, each year predicted only from the years before it and scored with Brier against what DWR drew (first choice, youth rows out, weighted by applicants at each point level).

Methods, all using the previous draw's permits:
- **last**: the reproducing model on the previous draw (what the site showed until now).
- **cohort**: everyone who didn't draw comes back one point higher, scaled by a return rate; new applicants enter at 0, scaled by a growth rate. Both rates are pooled per species and residency from earlier year pairs only.
- **shape**: the cohort's point mix, scaled back to the previous total applicants (flat demand).
- **blend**: the average of last and cohort.

**The rule, fixed before 2026 was looked at:** for each species and residency, pick the method with the lowest Brier over 2023–2025. Ship it only if it also beats last on 2026 (held out) and over all four years. Otherwise show the last draw.

| Species | Pool | Picked on 2023–25 | 2026 last | 2026 picked | 2023–26 last | 2023–26 picked | Shipped |
|---|---|---|---|---|---|---|---|
| Limited-entry buck deer | Resident | shape | 0.0328 | 0.0330 | 0.0312 | 0.0294 | last draw |
| Limited-entry buck deer | Nonresident | shape | 0.0093 | 0.0087 | 0.0090 | 0.0081 | **projected** |
| Limited-entry bull elk | Resident | blend | 0.0349 | 0.0373 | 0.0359 | 0.0372 | last draw |
| Limited-entry bull elk | Nonresident | blend | 0.0164 | 0.0163 | 0.0175 | 0.0173 | **projected** |
| Pronghorn | Resident | blend | 0.1052 | 0.1054 | 0.0945 | 0.0935 | last draw |
| Pronghorn | Nonresident | cohort | 0.0407 | 0.0286 | 0.0434 | 0.0263 | **projected** |
| Bison | Resident | blend | 0.0078 | 0.0071 | 0.0080 | 0.0073 | **projected** |
| Bison | Nonresident | shape | 0.0017 | 0.0013 | 0.0022 | 0.0019 | **projected** |
| General buck deer | Resident | blend | 0.1057 | 0.0987 | 0.0980 | 0.0939 | **projected** |
| General buck deer | Nonresident | blend | 0.1189 | 0.0945 | 0.0956 | 0.0900 | **projected** |

**What this changed:** my first pass scored residents and nonresidents together and said pronghorn "wins 4/4". That was wrong for residents: the whole gain was nonresident, and resident pronghorn loses in 3 of 4 years. The guide requires a win for each residency, so the decision is now made per pool. Resident limited-entry deer's chosen method lost 2026 by 0.6%, so it shows the last draw too.

**Why it can move odds up:** in small hunts the top-point holders who just drew lose their points, so next year's queue is thinner at the top (PB5000: 6 of 23 resident applicants drew at 3+ points). Point creep can run backwards; the projection sees that and the last draw can't.

**Not modelled:** next year's permits (the Wildlife Board sets them after applications close), hunt switching between years (points are per species, not per hunt), and group applications.

## 6. App work

- **Schema (UT-3 only, needs the owner's yes):** add `BISON` to the `Species` enum (`ALTER TYPE "Species" ADD VALUE 'BISON'`, additive, no rows change). Then `SpeciesKey`, labels, colours, icons, filters, the drawing grouping (`drawOf` must not put bison in Deer/Elk/Pronghorn), a bison score benchmark in `score.ts` (success is near 100% on some hunts, so the deer/elk curve would overrate it), and Montana's later bison can reuse it.
- **States registry:** `UT` in `src/lib/states.ts` with `privateLandOnly` (CWMU hunts; plus any hunt whose every boundary is private: **verify** from guidebook text), `features`, map bounds.
- **Odds adapter:** `src/lib/utOdds.ts` (bonus: tiered first-choice half + seeded simulation; preference: Colorado-style queue) and `src/lib/utPoints.ts`.
- **Account (point tracker):** bonus balances for LE deer, LE elk, LE pronghorn, bison; preference balance for general deer; last-drew year per species so the waiting period shows ("eligible again in 2029"). Saved as `User.points.UT`.
- **Finder and pages to Idaho parity:** "Utah Filters" group (hunt type LE / premium LE / OIAL / general / OTC; weapon; waiting period), shared private-land-only filter, cards with the three panels, hunt pages with odds-by-points table and charts, point creep at max points, harvest trend, land bar, overlapping general elk seasons on deer pages; unit pages; map with Utah metrics. Planner, What Changed and How The Draw Works pages for Utah (the Montana #91–#93 pattern), with the plain-language headline: *half the tags go to the most points; everyone else, including zero points, is in a weighted random draw.*
- **Costs:** 2026 guidebook figures, labelled "2026 guidebook": application fee $10 resident / $21 nonresident per species or point (+2.2% transaction fee); permits resident/nonresident: general deer $46 / $599, LE deer $94 / $1,070, general any-bull elk $56 / $849, LE elk $314 / $1,950, LE pronghorn $63 / $571, bison $460 / $4,840 (Antelope Island resident $1,221). A Utah hunting licence is required to apply; **verify** its 2026 price before showing a total.
- **Dates:** 2026 application March 19 – April 23, results by May 31; OTC elk on sale July 7/9/16. 2027 dates unknown until DWR posts them.

## 6a. App status (Nov 12, 2026)

Built and merged, with Utah still `enabled: false` (unlisted):
- #105: hunt page (`src/app/hunts/[id]/UtHuntPage.tsx`: odds at every point level, success and draw-history charts, land bar, seasons, odds table), boundary page (`UtUnitPage.tsx`), finder card (`UtHuntCard`) and the "Utah: Hunt Type" filter (`utLic`: le / general / otc / cwmu), account point tracker (`src/lib/utPoints.ts`: LE deer and LE elk bonus points, general deer preference points), map boundaries per species, `tests/utah.test.ts`.
- #106: How The Draw Works, What Changed and Planner (`src/components/UtPages.tsx`), header links, home title.
- **Imported** (owner: "apply UT", Nov 12 11:28 PT): gated on the dry run (commit d1d6033, 0 live, 515 added, 0 removed, 0 changed, digest `07d110f328cb8427`); result 515 hunts, 209 boundaries, 386 scored, other states unchanged; the re-run showed 515 live and 0 left to change. Maintenance service back to idle. Start command used:
  `sh -c 'npx tsx scripts/ut-import.ts > /tmp/dry.txt 2>&1; cat /tmp/dry.txt; grep -qF "\"planDigest\":\"<digest>\"" /tmp/dry.txt && grep -qF "\"live\":0,\"liveUnits\":0,\"added\":515,\"removed\":0,\"changed\":0" /tmp/dry.txt && npx tsx scripts/ut-import.ts --apply && npx tsx scripts/ut-import.ts'` (pin the service to the reviewed commit with `connect-service-source` + `commitSha`).
- **Live** (#109, enabled: true). Verified Nov 12: Find Hunts `?states=UT&species=ELK` (152 elk options with private-land hunts hidden), hunt pages EB3000 / EB1001 / DB1502 / DB1001, boundary 685, How The Draw Works, What Changed, Planner; no horizontal scroll at 390 px after #110/#111.
- **Open:** the Unit Map (`/map`) with Utah selected still shows Idaho's controls (a Pronghorn toggle, "general season" shading) over the boundaries; it needs a Utah branch like Montana's (#87).

Not built yet: a projection (needs the §5.2 backtest), waiting-period tracking on the account page, Utah's Walk-in Access layer, unit-level general elk harvest on boundary pages, pronghorn (UT-2) and bison (UT-3).

- **UT-2/UT-3 and the Unit Map: live (PRs #114, #115, #116, Nov 12).** Owner said "Go" (12:31 PT) to the additive schema step. Production got `prisma/add-bison.sql` (`ALTER TYPE "Species" ADD VALUE IF NOT EXISTS 'BISON'`) before the code merged, because the finder queries `species IN (..., 'BISON')` and Postgres rejects an unknown enum value, which would break search in every state. Then the import was gated on the dry run (commit ed46d1d: 515 live, 102 added, 0 removed, 0 changed, digest `0d05f21e4fde2e7d`). Result: 617 hunts, 243 boundaries, 461 scored, other states unchanged; a re-run showed nothing left to change. Maintenance service is back to idle.
  - Hunts: +86 pronghorn (66 limited entry, 20 CWMU) and +16 bison. PB5329 is omitted: it has no DWR boundary.
  - Unit Map: one boundary set at a time (species × general / limited entry). Every boundary carries its DWR name (`data/ut/boundary-labels.json`). Odds are at saved Utah points. CWMU boundaries are left off. General elk is not shaded by success or crowding, because it is sold over the counter and DWR reports its harvest statewide.
  - Odds under 0.1% now print `<0.1%`. They used to print `0.0%`, which read as no chance. Bison odds for a nonresident at 0 points are about 0.01%.
  - **Open:** `chanceOf` (src/lib/coOdds.ts) labels any odds under 0.5% "No chance" in every state, although its own comment says "none only when no outcome draws". It needs an owner decision; it was not changed here.

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

- Choice counts for LE/OIAL and general deer, and whether later choices draw (step 2).
- Cow bison: confirm the lifetime rule in the guidebook text; Antelope Island nonresident eligibility (step 9).
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
