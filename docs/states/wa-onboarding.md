# Washington onboarding: plan for deer and elk

Status (Nov 12, 2026): **live for deer and elk.** Imported Nov 12 22:28 PT and enabled. The build is PR #128: the import was gated on the dry run's digest `d9f29442d25da351` and on 0 live, 1,228 added, 0 removed, 0 changed. Result: 1,228 hunts, 188 units, 738 scored; ID, CO, WY, MT and UT unchanged. A re-run showed nothing left to change. The maintenance service is idle again. Use with [state-adapter-guide.md](../state-adapter-guide.md) and [state-onboarding-checklist.md](../state-onboarding-checklist.md). Anything marked **verify** is not confirmed and must not reach the site until it is.

## 0. What earlier material got wrong (including this doc's first version, PR #122)

- **The owner's 2018 workbook** (`WA-DrawOdd-2018.xlsx`, Drive) computes odds as `1 − (1 − P²/total entries)^tags` with a flat 1.08–1.2× "creep". That is the invalid with-replacement formula (adapter guide §4), and it treats each hunt as its own drawing. Its data (2017 deer and elk point tables) is kept in `data/wa/source/drawing-points-2017-2018.csv`.
- **"Entries = points² + 1"** (forums, outfitter sites): wrong. Entries are **P²**, with P the point total WDFW prints, which already counts this year's application (§3).
- **"No points, straight random draw"** (some odds sites): wrong.
- **"WDFW stopped publishing draw results"** (the owner's recollection, and #122): only the point-level tables stopped (last: 2020). Still published every year:
  - each pamphlet's permit tables print the **previous year's applications and average winner points** for every hunt (2021–2026 pamphlets → 2020–2025 drawings);
  - the special-hunt harvest reports print **total applicants and permits issued** per hunt (2013–2025);
  - the 2021 drawing dashboard (Power BI, still live) gives per hunt: quota, issued, applications, average winner points, and winners by choice rank (1st/2nd/3rd/4th, drawn for another hunt, not drawn).
- **#122 said "verify what Total Applicants means".** Verified: it is every application that listed the hunt at any choice. Harvest-report applicants equal the 2021 dashboard's applications for all 841 hunts that join, and the pamphlet's "APPS" equals the dashboard for 580 of 588 hunts whose name is unchanged.
- **#122 said land would use BLM SMA with `ADMIN_ST='WA'`.** That returns nothing: Washington's federal land is administered by the Oregon/Washington offices (`ADMIN_ST='OR'`), plus Idaho for the panhandle edge. Query by Washington's bounding box instead (§4).
- **Fee figures in #122 came from secondary sites and were inconsistent.** WDFW's own page (checked Nov 12, 2026) is below; the "$1,321.62" nonresident figure is the deer+elk+bear+cougar licence *with* small game; without it it's $1,188.04.
- **The master guide** says "P²" for Washington: right about the square, silent on the shared category queue, choices and multi-season.

## 1. Scope (WA-1: deer and elk)

| Opportunity | How you get it | What the app shows |
|---|---|---|
| **General deer** (modern, archery, muzzleloader) | Over the counter; one tag, one weapon, statewide. | One hunt per GMU × weapon: dates, legal deer, success, hunters, land. "No draw". |
| **General elk** | Over the counter; one weapon **and one side**: Eastern (EF/EA/EM, 100/200/300 GMUs) or Western (WF/WA/WM, 400/500/600). GMU layer carries `EastWest_Ind`. | One hunt per GMU × weapon with its tag area. East/West is a Washington filter and an account setting. Permit-only GMUs (157, 418, 437, 485, 522, 556, 621, 636, 653) and closed 490 say so. |
| **Multi-season deer / elk** | Drawing (Dec 1 – Mar 31; 8,500 deer, 1,000 elk; groups of 2). Elk tag good on both sides. Leftovers sold to unsuccessful applicants every year since 2021. | Two statewide hunts with odds by points, plus the leftover history. |
| **Special permits, deer** | Quality, Buck, Antlerless, Second Deer | Odds at every point level, table and chart. |
| **Special permits, elk** | Quality, Bull, Antlerless | Same. |

Later: Youth, 65+, Hunters with Disabilities, Master Hunter categories (parsed already, same model, add once the main ones are live), raffles, incentive and landowner permits, moose/sheep/goat.

You must hold the matching transport tag to apply (weapon; East/West for elk); multi-season holders may apply with any weapon and either side. The finder hides special hunts the hunter's chosen tag can't apply for.

## 2. The drawing

Checked against the 2026 pamphlet, pp. 17–19:

- **Weighted points:** one point per application per category; reset to zero when drawn; restored if the permit is returned two weeks before the season. An application bought but not submitted gets a point ("Points Option"); **Point Saver** builds a point without any chance of being drawn.
- **Choices:** up to four hunt choices, two for Quality Deer and Quality Elk; "each hunt will be considered in the drawing in order of the priority you chose".
- **Groups:** up to 8 for deer and elk special permits, 2 for multi-season; points averaged; the group draws as one.
- **Residency:** one pool for residents and nonresidents, no caps (the pamphlet describes no split).
- **Entries:** P², the best of P² random numbers ranks the application (§3). WDFW doesn't print the formula.

**Fees** (WDFW `licenses/hunting/big-game`, checked Nov 12, 2026; no season year on the page, so label "checked <date>"):

| | Resident | Nonresident |
|---|---|---|
| Deer licence | $61.70 | $599.07 |
| Elk licence | $69.29 | $685.60 |
| Deer + elk | $116.85 | $1,020.06 |
| Deer + elk + bear + cougar | $133.03 | $1,188.04 |
| Special permit or multi-season application | $9.61 | $152.30 |
| Quality special permit application | $18.72 | $152.30 |
| Multi-season deer / elk tag (if drawn) | $191.77 / $250.97 | same |
| Second deer tag (if drawn) | $68.48 | $356.90 |

Applications are not refundable. Youth, senior and disabled prices are on the same page.

## 3. Check: what weighting does WDFW use?

`python3 -I scripts/wa_check_draw_weights.py`

| Data | P² | P² + 1 | (P + 1)² | P | flat |
|---|---|---|---|---|---|
| Multi-season elk 2019 (1 hunt, 14,763 applications), log-lik / χ² | **−2,822.8 / 6.7** | −2,835.2 / 28.6 | −2,863.6 / 79.5 | −2,981.5 / 312.6 | −3,512.9 / 1,666 |
| Special permits 2017–2018 (562 hunts), log-lik | **−29,688** | −29,816 | −29,971 | −30,770 | −34,876 |

P² wins on both; on the single-hunt drawing it fits almost exactly (at P = 1: 32 expected, 29 drawn; P² + 1 expects 58).

## 4. Sources (all fetched Nov 12, 2026 in Claude in Chrome on the owner's PC)

In `data/wa/source/` unless noted. SHA-256 prefixes in the Files list.

| File | What | Notes |
|---|---|---|
| `drawing-points-2018-2020.csv` | WDFW "Special Hunt Applicant Preference Point Distribution" PDFs, parsed with pdf.js: 2018 and 2019, 15 deer/elk categories each (no 65+ file found); 2020, 11 (no multi-season, 65+, deer disabled or elk master hunter file found). 25,864 rows. | Per hunt and point level: applications, selected applications (2018–19 also applicants, selected applicants). Every one of the 1,617 hunts with applicant columns sums exactly to its permits awarded. Applications here are ~95% of the all-choice count (median ratio to the harvest report 0.95), not first choice only. 2018: `/sites/default/files/hunting/permits/2018_<cat>_drawing_results_by_hunt_number.pdf`; 2019: `/2019-09/2019 <Cat> drawing results by hunt number.pdf`; 2020: `/2021-03/2020_<cat>_drawing_results_by_hunt_choice.pdf` (antlerless deer `..._by_hunt_number.pdf`). |
| `drawing-points-2017-2018.csv` | From the owner's workbook (WDFW 2017 tables). | 2017 files are no longer on WDFW's site. |
| `special-hunt-summary-2021.csv` | The 2021 Power BI dashboard, queried through its public `querydata` API: 969 hunts, all species. | Applications = 1st + 2nd + 3rd + 4th-choice winners + drawn for another hunt + not drawn, for every row. |
| `permit-tables-2021-2026.json` | `scripts/wa_parse_permit_tables.py` over `regs-2026.json` and `pamphlets-2021-2025.json` (pdf.js text items of the six pamphlets' permit pages). 4,945 deer/elk rows. | Per hunt and year: category, choice number, name, notes, tag, dates, legal animal, unit/area, permits, and the prior year's applications / average winner points. One unparsed cell (2023 hunt 1509, "two separate hunts in 2022"). |
| `harvest-2013-2025.json` | Every deer and elk game-harvest page, 2013–2025: statewide, general (GMU × weapon), special, combined, individual hunts. | Individual hunts: applicants, permits, reports, hunters, success, harvest by antler points. |
| `gmu-areas-2026.json` | `geodataservices.wdfw.wa.gov/.../MapServices/HOReferenceService/MapServer` layers 0 (GMU, 162), 4 (Deer Areas, 19), 5 (Elk Areas, 37), in EPSG:5070 at 10 m and WGS84 at 0.0005°. | "In effect April 1 2026 to March 31 2027". GMU fields include `EastWest_Ind` and region. |
| `regs-2026.json` | 2026 pamphlet text items (118 pp.), April 22 corrections, and WDFW's fee table. | |
| Owner's PC, `Downloads\huntapp\wa\wa-land-access-5070.json` (4.3 MB) | BLM national SMA, every non-private feature intersecting Washington's box (OR- and ID-administered), rings clipped to the GMU extent + 2 km, EPSG:5070, 30 m generalisation; plus WDFW's 663 private-lands access polygons (Feel Free to Hunt, Register to Hunt, Hunt by Written Permission…). | Input for `wa_build_land.py`; too big and too raw for the repo, as with Utah. |

Reach: the workspace shell is refused for every WDFW host. In Chrome: one download per tab; `geodataservices.wdfw.wa.gov` and `gis.blm.gov` answer cross-origin from a wdfw.wa.gov tab; the Power BI API answers from the dashboard tab. Files go `Downloads` → `Downloads\huntapp\wa` → staged into the workspace.

**Hunt numbers are reused.** Of the 824 hunts in the 2022 pamphlet whose number appears in the 2021 dashboard, 236 carry a different name. Join years on number **and** name; the pamphlet's prior-year columns are WDFW's own link from a number to last year's demand.

**2024 anomaly:** a vendor error awarded 738 extra permits (WSR 24-23-005). Flag 2024 in odds history.

## 5. Odds method and backtest

Per hunt: odds at P = 1 − (1 − u)^(P²), with u solved so the expected draws equal the permits. Exact for one-hunt drawings (multi-season); an approximation for special permits, where earlier choices remove winners.

**Point mix after 2020:** roll forward. Each year, unselected applications gain a point, selected ones leave, and new applications enter at P = 1 to make up that year's published application count.

`python3 -I scripts/wa_backtest.py data/wa/source/drawing-points-2018-2020.csv data/wa/source/permit-tables-2021-2026.json`. Brier score per application against WDFW's per-point results (main categories; hunts whose name is unchanged from the year before):

| Method | 2019 | 2020 |
|---|---|---|
| Last year's odds at the same points (baseline) | 0.02317 | 0.03015 |
| Roll forward, last year's application count (true projection) | **0.01955** | **0.02778** |
| Roll forward, that year's actual count (what we have for 2021–2025) | **0.01949** | **0.02722** |
| Roll forward, then force the published average winner points | 0.02626 | 0.03243 |

- Roll forward beats the baseline by 16% and 8%, so the projection may be shown (adapter guide §4). r = 1.0 (every unselected application returns) scored best of 0.6–1.0.
- **Anchoring to the published average winner points makes it worse** and is rejected. Even with the exact point mix, the per-hunt model's average winner points miss WDFW's by 1.37 points on average with no bias (2020, 555 hunts). So the average carries choice effects this model can't use.
- **2017 → 2018 check (the owner's 2018 workbook, Nov 12).** The owner's idea: the high-demand hunts keep the same shape of point mix, shifted to higher points each year. That is exactly what roll forward assumes, and it can be tested directly: roll each 2017 table one year and score it on 2018 (115 hunts paired by name, permits and demand, since WDFW renumbered). Baseline 0.01910, roll 0.01618, roll with 2018's count 0.01616; r = 1.0 again beat 0.8–0.95. Top of the mix, rolled vs actual 2018 applications with 15+ points: Entiat 373 vs 357, Desert (5 permits) 323 vs 333, Colockum (1 permit) 199 vs 191, Pearrygin 206 vs 171. Roll forward slightly overfills the top (some long-time applicants stop), but by less than one year's growth.
- **Drift with no point tables:** rolling 2020 forward through 2021–2025 with only published applications and permits, the model's average winner points stay unbiased (mean error −0.34, +0.67, −0.05, +0.34, −0.31). Mean absolute error grows from 1.4 to 1.8–2.5 points. Say "estimated" on every Washington special-permit figure, with the year of the last point table (2020).
- **What the app shows:** "last draw" = 2025 estimated (published applications); "next draw" = 2027 projection (two roll steps, 2026 permits then 2027, with 2025's application count). When the 2027 pamphlet prints 2026's applications, update.
- **Multi-season:** single hunt, same formula. Application totals after 2020 still need a source (news releases give leftovers, not applications). **Verify** before showing multi-season odds past 2020.

## 6. App work (Idaho parity)

- **Registry:** `WA` in `src/lib/states.ts`; `privateLandOnly` from permit notes and areas described as private land (**verify** the note letters in the pamphlet's hunt-notes page); drawings June (special) and April (multi-season).
- **Identity:** units `wa-<GMU>`, `wa-da<NNNN>`, `wa-ea<NNNN>`; general hunts `wa-gd-<gmu>-<weapon>`, `wa-ge-<gmu>-<weapon>`; special `wa-<choice>`; multi-season `wa-ms-deer`, `wa-ms-elk`. History joins by number + name.
- **Odds adapter** `src/lib/waOdds.ts`: P² entries and stored per-hunt point mixes (`{last, proj}` per point level, the Wyoming `oddsByPts` shape).
- **Account:** points per category (Quality/Buck/Antlerless/Second Deer, Quality/Bull/Antlerless Elk, Multi-season Deer/Elk), deer tag weapon, elk tag weapon + East/West. Show "you'll draw with N + 1 points = (N + 1)² entries".
- **Finder, cards, hunt and unit pages, map, Planner, What Changed, How The Draw Works** as Idaho/Utah. Headline: *every application is a weighted lottery: your entries are your points squared, counting this year's.*

## 7. Built data (Nov 12, 2026)

**`scripts/wa_build_land.py` → `data/wa/units.json`, `data/wa/land.json`.** 152 GMUs, 19 Deer Areas, 37 Elk Areas, with outlines, acreage, ownership and WDFW private-lands access acres per unit.
- **GMUs don't tile the state.** Olympic National Park, the Yakama and Colville reservations and other tribal land lie outside every GMU. GMU 2 is open water, and GMUs 51 and 53 are the North Cascades and Mount Rainier parks; none of those three becomes a unit. So across the GMUs: federal 28.5% (USFS 22.6%), state 9.1%, tribal 1.4%, private 60.9%.
- **State land may be undercounted.** DNR's ~5.6M upland acres (~13% of the state) suggest SMA misses some DNR parcels. Check against DNR's own layer before trusting state shares in western WA.
- **Private-lands access:** four programs measured per unit: Feel Free to Hunt, Register to Hunt, Hunt by Written Permission and Hunt by Reservation.
- **Spot checks:** Alpine (249) 99.6% USFS; Horse Heaven (373) 90% private; Deschutes (666) 96% private, which is industrial timber.

**`scripts/wa_build_hunts.py` → `data/wa/hunts.json`.** 1,225 hunts:
- 499 special permits: Quality, Buck, Antlerless and Second Deer; Quality, Bull and Antlerless Elk;
- 2 multi-season tags;
- 771 general-season GMU × weapon hunts (413 deer, 358 elk), from the pamphlet's season tables. A row exists only where the 2025 harvest report shows general hunters for that weapon in that GMU.
- **Odds per §5:**
  - 394 special hunts start from their own 2020 point table, linked through the 2021 pamphlet's application count; that table must hold 85–102% of it and agree on number or name (60–110% when both agree: archery tables run low).
  - The other 105 start from their category's pooled 2020 mix, labelled `seed: "category"`.
  - **Fixed Nov 12 (was 344 own / 155 pooled).** Three faults put famous hunts on the pooled mix, which badly understates how many high-point applicants they have. (1) Hunts sharing name, tag, area and legal animal (Desert's two modern Quality hunts, Colockum's) broke the year-to-year chain; now ties break on dates, then the closest permit count. (2) Continuation rows of split 2020 PDF tables have no hunt name, so the name check failed (Pearrygin); the name now carries over. (3) Archery tables hold 70–80% of the printed applications and failed the 85% test. Desert (4 permits), Colockum (1 permit), Pearrygin and the Entiat/Desert archery hunts now use their own tables.
  - **Point tables now run to 40 banked points (was 25).** Entiat, Desert and Colockum had applicants at 30–36 points in 2020, so anyone past 25 was shown the 25-point odds. The roll no longer caps points at 30.
  - One 2021 demand cell lost its slash in the PDF ("44505" for Prescott archery elk, 14–26 applications in other years); slashless cells are treated as unknown.
- **New hunts (Nov 13):** WDFW prints NEW, or 0/0 (17 cells in 2026, e.g. the rebuilt Alkali antlerless hunts), for a hunt with no drawing last year. Both now mean "no applications yet": the hunt isn't chained to last year's hunt of the same name and is left out (no odds to estimate). Three Alkali antlerless hunts had been live with 0% odds at every point level because 0/0 was read as zero applications.
- **Odds floor:** a weighted lottery with permits is never 0, so stored odds keep a floor of 0.0001% instead of rounding to 0 (it was showing "No chance" at 0 points for hunts like Desert Quality Deer).
- **Youth permits (Nov 13).** Deer - Youth and Elk - Youth are built like the main categories: 110 hunts (12 more are new in 2026 with no applications yet and left out), 99 seeded from their own 2020 youth table. Youth is under 16 at purchase, resident or nonresident; each youth category has its own points (`YOUTH_DEER`, `YOUTH_ELK` on the account page). Backtest on WDFW's 2018-2020 youth tables (`wa_backtest.run` with the youth categories): last-year odds 0.11690 (2019) / 0.11656 (2020); roll r = 1.0 0.11278 / 0.10445; r = 0.7 0.11126 / 0.10418. r = 0.7 was picked on 2019 and held on 2020, so youth roll forward with 70% of unsuccessful applicants returning (they age out at 16). Youth hunts are `youthOnly`, hidden in Find Hunts unless the Youth filter is set or a youth category is picked. Youth general days (2026: two rows in the modern deer table, GMU 124 any deer Oct 24–30 and 127–142 3 pt. min. or antlerless Oct 24–27; none for elk, archery or muzzleloader) are on those 7 general hunts' season lists and legal line, marked youth in `tagSeasons`. They don't change the hunt's dates or legal animal, which are an adult's. The shared Youth Hunts filter decides whether they count: Hide ignores them (an antlerless search won't match GMU 127 modern deer), Include counts them, Only matches hunts with a youth season or youth permit. Tested in `tests/washington.test.ts`.
- **Menu pages (#136, #137):** How The Draw Works, What Changed and Application Planner for Washington (`src/components/WaPages.tsx`).
- **Permit-only GMUs:** the 2026 pamphlet lists deer as permit only in 290, 329, 371 and 485, and elk in 157, 418, 437, 485, 522, 556, 621, 636 and 653 (490 closed). The harvest report still shows "general" hunters in some (653 White River elk, ~45 a year), so the builder reads those lists from the pamphlet and drops general rows there. White River general archery, modern and muzzleloader elk were live by mistake until Nov 12.
  - Chains walk pamphlets back by category + name, then tag, area and legal animal when several hunts share a name.
- **Multi-season applications:** WDFW's harvest reports list multi-season as hunts 1999 (deer) and 2999 (elk), with Total Applicants from 2021. 2025: 28,274 deer and 26,768 elk applications for 8,500 and 1,000 tags. Thousands of deer tags still go unsold each year because winners don't buy, so the drawn odds understate a deer applicant's real chance of getting a tag. The page must say so.
- **Left out (16):** Buckrun and Blackrock Ranches (private ranch areas with no WDFW polygon); the Alkali and Blue Creek hunts (no published applications in any year); one 2026 area cell that parses as "GMU 37 1".
- **General seasons from the pamphlet (Nov 13).** `scripts/wa_parse_general_seasons.py` → `data/wa/general-seasons-2026.json`: 106 rows from the six general-season tables (deer and elk × modern, archery, muzzleloader), each with dates, GMUs, legal animal and deer type (black-tailed, white-tailed, mule). Rows for Master Hunters only, high-buck wilderness hunts and youth are kept but flagged; an adult general-tag hunter can't use them. These tables now decide which general hunts exist, their dates and their legal animal; harvest only supplies success (antlered hunts count antlered kills, antlerless-only hunts count antlerless kills, either-sex hunts count all). 771 general hunts (413 deer, 358 elk): 47 new GMU × weapon hunts the harvest report had no 2025 row for, and 4 dropped that have no adult general season (deer muzzleloader 249 and 372, elk archery 368, Alkali 371 modern elk, which is Master Hunters only).
  - **This replaced a guess that was wrong.** #130 classed each GMU's legal animal from the harvest mix (≥15% antlerless → either sex). Checked against the tables it was wrong for about 30 GMUs: WDFW's general harvest rows include Master Hunter, youth and other allowance kills, so antlered-only units such as 145, 334, 407 and the Colockum true-spike units looked either-sex.
  - Deer Area and Elk Area rules (e.g. Deer Area 6020 any deer, Elk Area 3722) are parsed but not applied to GMU hunts.

## 8. Open items

- **Scores:** 490 hunts have no Quality score. Most are special permits with under 30 hunters across their harvest years (`smallSample`), the same rule as other states.
- **Unit Map:** shows GMUs only; Deer/Elk Area permits count in the GMUs they list. Multi-season tags aren't shaded.

## 9. Next steps

1. WA-2: 65+, Hunters with Disabilities and Master Hunter categories (youth done Nov 13).

## Files

| File | SHA-256 prefix |
|---|---|
| `data/wa/source/drawing-points-2017-2018.csv` | `61b0fb230550e726` |
| `data/wa/source/drawing-points-2018-2020.csv` | `aa86482becd2f87e` |
| `data/wa/source/special-hunt-summary-2021.csv` | `5817274a4837638d` |
| `data/wa/source/harvest-2013-2025.json` | `0d51792639ee1dd6` |
| `data/wa/source/gmu-areas-2026.json` | `e64ee3d707fd8ae9` |
| `data/wa/source/regs-2026.json` | `7161a7445bdca47e` |
| `data/wa/source/pamphlets-2021-2025.json` | `5ed0c01cade71e53` |
| `data/wa/source/permit-tables-2021-2026.json` | `13b203d17ce4e9bd` (built) |
| `data/wa/source/multiseason-elk-2019.csv` | `d70c4eb146d0c7c3` |

Scripts: `wa_check_draw_weights.py` (§3), `wa_parse_permit_tables.py` (§4), `wa_backtest.py` (§5).
