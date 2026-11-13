# Washington onboarding: plan for deer and elk

Status (Nov 12, 2026): **rules researched, the drawing's weighting tested against WDFW's own results (§3), sources inventoried (§4); nothing built yet.** No production data has changed. Use with [state-adapter-guide.md](../state-adapter-guide.md) and [state-onboarding-checklist.md](../state-onboarding-checklist.md). Anything marked **verify** has not been confirmed from a WDFW page or rule and must not reach the site until it is.

## 0. What earlier material got wrong

- **The owner's 2018 workbook (`WA-DrawOdd-2018.xlsx`, Google Drive).** Its odds column is `1 − (1 − P²/total entries)^tags`, with total entries grown by a flat 1.08–1.2× "creep". That is the invalid with-replacement formula the adapter guide already rejects (§4), and it treats each hunt as its own drawing when WDFW draws a whole category as one queue (§2). The workbook's real value is its data: WDFW's 2017 deer and elk, and 2018 deer and quality-elk tables of applicants and selections at every point level. Those are now in `data/wa/source/drawing-points-2017-2018.csv`.
- **"Entries = points² + 1"** (forum posts, repeated by outfitter sites). Wrong. The entries are **P²**, where P is the point total WDFW prints, which already includes this year's application point (the lowest level printed is 1). A first-time applicant has 1 entry; someone with 4 banked points draws with P = 5, 25 entries. Tested in §3.
- **"Washington has no points; it's a straight random draw"** (some draw-odds sites). Wrong since 1996.
- **"WDFW no longer publishes draw results."** Half right. Per-point-level results by hunt were published for **2017–2020** (PDF/XLSX, "Special Hunt Applicant Preference Point Distribution by Hunt Choice"), and a 2021 dashboard was last updated June 21, 2021. Nothing by point level since. But every year's **special-permit harvest report still prints total applicants and permits issued for each hunt**, through the latest season. So per-hunt demand is known every year; only the point mix is missing after 2020 (§5).
- **The master guide's WA entry** ("Squared bonus points (P²)") is right about the square but silent on the category-wide queue, the four hunt choices and the multi-season drawing.
- **Nonresident caps.** None. Residents and nonresidents are in the same drawing with the same odds; only prices differ (**verify** the rule text; outfitter sites agree).

## 1. Scope (WA-1: deer and elk)

| Opportunity | How you get it | What the app shows |
|---|---|---|
| **General deer** (modern, archery, muzzleloader) | Over the counter. One tag, one weapon, statewide. | One hunt per GMU × weapon (Montana general-district pattern): dates, legal deer, success, hunters per sq mi, land. Odds: "No draw". |
| **General elk** | Over the counter. One weapon **and one side of the state**: Eastern (100/200/300 GMUs: EF, EA, EM tags) or Western (400/500/600: WF, WA, WM). | One hunt per GMU × weapon, carrying its tag area. The East/West choice is shown on every card and is a Washington filter; closed and permit-only GMUs (157, 418, 437, 485, 522, 556, 621, 636, 653; 490 closed) say so. |
| **Multi-season deer / elk** | A drawing (Dec 1 – Mar 31, results April). 8,500 deer and 1,000 elk tags. The elk tag is valid on **both** sides of the state and all three weapons. | Two statewide "hunts" with odds by points (§2). Leftovers have been sold to unsuccessful applicants every year since 2021 (2024: 2,369 deer, 130 elk; 2026: 3,137 deer, 187 elk), so deer is close to certain for anyone who applies; say that plainly. |
| **Special permits, deer** | Drawing (late April – May 20/27, results June). Categories: Quality, Buck, Antlerless, Second Deer. | Hunt cards and pages with odds at every point level, Colorado-style table and chart. |
| **Special permits, elk** | Same drawing. Categories: Quality, Bull, Antlerless. | Same. |

Labelled but not in WA-1: Youth, 65+, Hunters with Disabilities and Master Hunter categories (eligibility-restricted pools; same model, add after the main categories pass), raffle and auction permits, incentive permits, landowner (LHP) permits, moose/sheep/goat (later, once-in-a-lifetime rules).

A special permit doesn't replace the general tag: you must already hold the matching transport tag (weapon, and East/West for elk) to apply, and the permit table says which tags qualify for each hunt. Multi-season tag holders may apply with any weapon (elk: either side). This is an eligibility filter, not just a note: the finder must hide special hunts the hunter's chosen tag can't apply for.

## 2. The drawing (rules to model)

- **Points:** one per application per category (or a points-only purchase). Kept per species category, reset to zero when drawn, restored if the permit is returned two weeks before the season. Not transferable between categories.
- **Entries:** P² random numbers, where P = banked points + this year's application; the best number is the applicant's rank for the whole category.
- **One queue per category, not per hunt.** Up to four hunt choices (two for Quality). Applicants are taken in rank order and given their highest choice that still has permits. So a hunt's odds depend on who listed it first and on every other hunt in the category. **Verify** the exact assignment order from WDFW's description (forum accounts and the 2021 drawing video agree on "random numbers per category").
- **Groups:** up to 8 for deer/elk special permits, 2 for multi-season; points averaged; one entry for the group. WDFW's tables count both applications (groups) and applicants (people); the model works on applications.
- **One permit per species per year.**
- **Fees** (none confirmed from WDFW's own page yet; figures disagree between secondary sources, **verify** at `wdfw.wa.gov/licenses/hunting/big-game` and label "checked <date>"): special-permit or multi-season application $9.61 resident / $152.30 nonresident (Quality had a higher resident fee); multi-season tag $191.77 deer, $250.97 elk, same for both residencies; nonresident elk licence about $685.60, deer about $599. Application fees are not refundable.

**Model.** For one hunt h with cutoff u_h, an application with P points is selected with probability 1 − (1 − u_h)^(P²) (best of P² uniform numbers below the cutoff). u_h is solved so the expected selections equal the permits the hunt gave out. This is exact for a single-hunt drawing (multi-season) and an approximation for special permits, because applications that drew an earlier choice drop out. A full category simulation needs each application's ranked choices, which WDFW doesn't publish. Ship the per-hunt form, labelled as an estimate, unless a category simulation built from first-choice shares beats it in the backtest (§5).

## 3. Check: what weighting does WDFW use? (Nov 12, 2026)

`python3 -I scripts/wa_check_draw_weights.py` fits the cutoff per hunt for each candidate weighting and scores the published selections at every point level.

| Data | P² | P² + 1 | (P + 1)² | P | flat |
|---|---|---|---|---|---|
| Multi-season elk 2019, 1 hunt, 1,000 tags, 14,763 applications (log-likelihood / χ²) | **−2,822.8 / 6.7** | −2,835.2 / 28.6 | −2,863.6 / 79.5 | −2,981.5 / 312.6 | −3,512.9 / 1,666 |
| Special permits 2017–2018, 562 hunts | **−29,688** | −29,816 | −29,971 | −30,770 | −34,876 |

P² wins on both. On the single-hunt drawing it is a near-perfect fit (χ² 6.7 over 13 levels): at P = 1 it expects 32 selections against 29 actual, where P² + 1 expects 58. Squaring is real, and "+1" is not.

## 4. Sources

| Element | Source | Years | Notes |
|---|---|---|---|
| Applicants and selections by point level, per hunt | WDFW "Special Hunt Applicant Preference Point Distribution by Hunt Choice", one file per category, e.g. `wdfw.wa.gov/sites/default/files/2019-09/2019 Buck deer drawing results by hunt number.pdf`, `/2021-03/2020_second_deer_drawing_results_by_hunt_choice.pdf`, `/hunting/permits/2018_second_deer_drawing_results_by_hunt_number.pdf` | 2017–2020 (2017–2018 partly in the owner's workbook) | Columns: quota, permits awarded, point total, applications, selected applications, applicants, selected applicants. Multi-season files exist too (hunt 2888 elk). Some rows run together in the PDF text: parse by position and reconcile to the hunt's permits. |
| 2021 drawing dashboard | `wdfw.wa.gov/hunting/special-hunts/results` | 2021 | Interactive; "data last updated June 21, 2021". Check in Chrome whether its data is still behind it. |
| Older summaries | `2009permit_summary_{deer,elk}.pdf`, `2010category_points_quality{deer,elk}.pdf` (owner's Drive) | 2009–2010 | Trend context only. |
| Per-hunt demand every year | Special-permit game harvest reports (`wdfw.wa.gov/hunting/management/game-harvest`, one HTML page per species/season/year) | through the latest season | Per hunt: total applicants, permits issued, reports returned, hunters, harvest, success, antler points. **Verify** whether "Total Applicants" means first-choice or any-choice by comparing 2019 and 2020 against the drawing files. |
| General-season harvest | Game harvest reports: deer and elk general season by GMU and weapon | annual | Hunters, harvest, days, success, antler points. |
| Seasons, legal animal, permit quotas | WAC 220-415-020 (deer general), -050 (elk general), -030 and -060 (special permits); the 2026 Big Game pamphlet and its May 21, 2026 errata | 2024–2026 rule package | The general-season WAC carries three years of dates. 2027 needs the new package. |
| GMU and hunt-area boundaries | `geodataservices.wdfw.wa.gov/arcgis/rest/services/MapServices/SharedReferenceLayers/MapServer` (GMUs, Deer Areas, Elk Areas), also `HOReferenceService` | current | Special hunts are drawn on GMUs, parts of GMUs or 4-digit Deer/Elk Areas. |
| Private-land access | WDFW Private Lands Hunting Opportunities layer (Feel Free to Hunt, Register to Hunt, Hunt by Written Permission) | current | Fills the "Access Yes!" slot, as Montana's Block Management does. |
| Land ownership | BLM national SMA, `ADMIN_ST='WA'` (Montana/Utah builder) | current | Tribal land (Yakama, Colville, Spokane and others) is not public. Industrial timberland in western WA is private and often fee-access only; never count it as public. |
| Population | Game Status and Trend Report (annual) | annual | Herd-level; don't assign a herd figure to each GMU. |
| Fees | `wdfw.wa.gov/licenses/hunting/big-game` | current schedule | No season year on the page; label "checked <date>". |

**Reach:** the workspace shell gets a proxy refusal for wdfw.wa.gov and geodataservices.wdfw.wa.gov (checked Nov 12). Use Claude in Chrome on the owner's PC (one download per tab; pdf.js in a WDFW tab), as for Montana and Utah. WebFetch returns only summaries.

**2024 anomaly:** a vendor error awarded 738 permits that should not have been drawn; WDFW let them stand and raised the 2024 quotas by 738 (WSR 24-23-005). 2024 permits issued exceed the original quotas; flag 2024 in odds history and leave it out of the backtest.

## 5. Estimating odds without point tables after 2020

1. **Reproduce 2017–2020.** Per-hunt model vs WDFW's selections at every point level; record the fit per category.
2. **Roll the point mix forward.** Start from a hunt's last published table. Each year: selected applicants leave, everyone else gains a point, new applicants enter at P = 1, then rescale to that year's published applicant total from the harvest report. Solve u_h from that year's permits. Repeat to 2026, then to 2027 for the projection.
3. **Backtest before anything ships** (adapter guide §4): predict 2019 from 2017–2018 and 2020 from 2018–2019, Brier at every point level, against the baseline "last published year's odds at the same points". If the roll-forward loses, ship the last published year's odds, labelled with its year (and say how old it is).
4. **What can't be known:** how many new applicants vs returning ones, and choice order. Show "estimated" on every Washington special-permit odds figure, with the year of the last point table.

The owner could also ask WDFW for the 2021–2026 tables under the Public Records Act; a hunter on the WA forum reports being refused (Apr 2026).

## 6. App work (Idaho parity)

- **Registry:** `WA` in `src/lib/states.ts` with `privateLandOnly` (permit-table text "private lands only"; landowner permits are out of scope), drawings (special permits June; multi-season April), map bounds.
- **Identity:** units `wa-<GMU>` and `wa-da<NNNN>` / `wa-ea<NNNN>` for Deer/Elk Areas; general hunts `wa-gd-<gmu>-<weapon>`, `wa-ge-<gmu>-<weapon>`; special `wa-<hunt choice>`; multi-season `wa-ms-deer`, `wa-ms-elk`. Hunt-choice numbers are reused across years: join history on hunt name + area, not number alone.
- **Odds adapter** `src/lib/waOdds.ts`: P² entries, per-hunt cutoff, roll-forward; client-safe, with fixtures from the 2019 multi-season file and a 2018 quality hunt.
- **Account (point tracker):** points per category (Quality Deer, Buck Deer, Antlerless Deer, Second Deer, Quality Elk, Bull Elk, Antlerless Elk, Multi-season Deer, Multi-season Elk), plus the deer tag weapon and elk tag weapon + East/West, because they decide which special hunts you can apply for. Show "you'll draw with N + 1 points = (N + 1)² entries".
- **Finder:** "Washington Filters": licence (general / special permit / multi-season), category, weapon tag, elk tag area (East/West), and the shared private-land-only filter. Residents and nonresidents see the same odds; only cost lines differ.
- **Cards, hunt and unit pages, map, Planner, What Changed, How The Draw Works**: as Idaho/Utah. The draw page headline: *every application is a weighted lottery; your entries are your points squared, counting this year.*

## 7. Next steps, in order

1. In Chrome: download every 2017–2020 point-distribution file (all deer and elk categories, multi-season), the 2021 dashboard data if it's still there, and the special-permit and general-season harvest pages 2017–2025. Parse by position; reconcile each hunt.
2. Answer the "Total Applicants" definition (§4) and the assignment order (§2).
3. Reproduce 2017–2020 and run the §5 backtest; write the numbers here.
4. GMU / Deer Area / Elk Area boundaries, land, private-lands access layer.
5. 2026 permit tables and seasons from WAC 220-415 and the pamphlet; fees from WDFW.
6. Build `data/wa/*.json`, `scripts/wa-import.ts` (Washington rows only; other states digested before and after), the app pieces in §6, then import, enable and check live at desktop and 390 px.

## Files

- `data/wa/source/drawing-points-2017-2018.csv` (SHA-256 prefix `61b0fb230550e726`): extracted from the owner's workbook sheets "Deer All" and "Elk All", which are WDFW's published tables. 2017 deer (hunt numbers 10xx–14xx; the deer sheet has no category column, so take the category from that year's pamphlet), 2018 deer (10xx), 2017 quality, bull and antlerless elk, 2018 quality elk. The workbook's own odds columns are not carried over.
- `data/wa/source/multiseason-elk-2019.csv`: WDFW's 2019 multi-season elk file (hunt 2888), all 13 point levels.
- `scripts/wa_check_draw_weights.py`: the §3 check.
