# Montana onboarding: data, draw models and integration plan

Status, Nov 10 2026: **research and plan only.** No Montana data is parsed, no adapter exists, nothing is imported. Everything below that is marked *verified* was checked against the agency's own reports or GIS services during this research; everything marked *unverified* is a lead. Use this worksheet with the [state-onboarding checklist](../state-onboarding-checklist.md) and the [state adapter guide](../state-adapter-guide.md).

Scope for the first release: **deer, elk and antelope (pronghorn)**. Moose, sheep, goat and bison use the same bonus-point machinery and can follow once the core three are validated.

---

## 1. What is different about Montana

Montana does not fit either the Idaho or the Colorado template cleanly, and it is the first state we would add that runs **two unrelated draw systems at once**:

| | Nonresident combination licenses | Everything else (permits and B licenses) |
|---|---|---|
| System | **Preference points**, capped at 3 | **Bonus points**, squared, uncapped |
| Applies to | NR general deer/elk opportunity | Antelope, Antelope B, Deer B, Elk B, deer permits, elk permits |
| Allocation | 75% by points, 25% random **to zero-point applicants only** | Weighted lottery over the whole pool |
| Points lost | On drawing, **and on skipping a year** | On drawing only |
| Residents | Not applicable (residents buy general licenses OTC) | Residents and nonresidents draw in separate pools |

The second structural difference: **a Montana general license is the normal way to hunt deer or elk**, and permits only *restrict* where and when you may use it. A permit is not an extra animal. This is the opposite of Idaho's controlled-hunt framing and has to be reflected in the hunt-type labels, or a Washington hunter will read a Montana permit as a tag.

---

## 2. Sources

### 2.1 Drawing statistics (verified reachable and parseable)

Page: `https://myfwp.mt.gov/fwpPub/drawingStatistics`

The report list is **not** in the page HTML. The species `<select>` (`#repositoryObjectId`) drives an AJAX reload; the Search button calls `callReload('reloadReportResultsDiv')`. Category ids:

| Category | id |
|---|---|
| Antelope | 28561 |
| Elk | 28562 |
| Goat | 28563 |
| Moose | 28564 |
| Nonresident Combination | 94776 |
| Other | 94777 |
| Sheep | 28565 |
| White-tailed/Mule Deer | 28566 |

Files are then at `https://myfwp.mt.gov/getRepositoryFile?objectID=<id>`. Regenerate the manifest with `scripts/mt_fetch_sources.mjs` (browser-side; the workspace shell cannot reach myfwp.mt.gov — see §8). Captured counts: 77 antelope, 71 elk, 70 deer, 13 nonresident-combination, 84 other; 118 deer/elk/antelope reports for 2016–2026. Antelope reports go back to 2006.

Two report kinds per year and license type:

- **Drawing Statistics Report** — one row per LPT: applicants, successful, % successful.
- **Detailed Bonus Point Drawing Statistics** — the same, broken out **by bonus point level**, by residency and landowner status. This is the one the odds model needs.

**Naming is not stable** and a parser must not rely on a URL or title pattern:

- 2006–2021: a single combined *"Deer, Elk and Antelope Detailed Bonus Point Drawing Statistics"* file per year (with "&" instead of "and" before 2010).
- 2022: retitled *"… Bonus Point Drawing Statistics"* — the word "Detailed" disappears, and the file is split per license type.
- 2018 and 2023–2026: split per license type (Antelope, Antelope B, Antelope 900/Archery, Deer B, Deer Permit, Elk B, Elk Permit), with the antelope archery file renamed between 2025 ("Antelope 900-20 Archery") and 2026 ("Antelope Archery Only").
- 2016 has a typo in the source listing: "Antelope B Drawing **Statics** Report".

Build the manifest from the live listing, store it as `data/mt/draw-sources.csv`, and key it on (year, license type, report kind) parsed from the title, not on the objectID ordering.

### 2.2 Detailed bonus point report format (verified against 2026 Antelope, objectID 117234)

15 pages, 1,039 point-level rows parsed cleanly with pdf.js using x/y text positions.

Columns: `Item Description | District | Residency | Number of Points | Number of Applications | Number of Successes | % Successful`

- **District** is really the **LPT** — the license/permit type code, `NNN-TT`. FWP's own on-page legend says the first three digits "most often" represent the hunting district. Exceptions seen: `007-20` (Region 7 area-wide) and `900-20` (statewide archery). Treat the district mapping as a lookup table built from the regulations, never as a substring parse.
- `TT` is the license type: `20` = antelope licence, `21` = antelope B. Deer/elk permit and B-licence suffixes still need confirming from the regulations district tables.
- **Residency** has four values, not two: `RESIDENT`, `RESIDENT LANDOWNER`, `NONRESIDENT`, `NONRESIDENT LANDOWNER`. Landowner preference is a **separate pool** and must not be merged into the general pool — a landowner row at 100% would otherwise flatter the public odds.
- `% Successful` = successes ÷ applications for that point level.
- `# Applicants` is **first-choice only** (stated in the page legend), like Wyoming.

### 2.3 Nonresident combination reports (verified against 2026, objectID 116132)

Nine years available, 2018–2026, plus rolled-up "2011 Through 2020" style multi-year files. Titles drift here too: *"Nonresident Combination License Preference Point Drawing Statistics"* (2018–2021), *"Big Game Combo / Elk Combo Drawing Statistics"* + a separate deer file (2022), *"NR Combo PP Stats"* (2023), *"NR Combination Preference Point Statistics"* (2024–2026).

### 2.4 Regulations

2025 deer/elk/antelope regulations: `https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/2025/2025-dea-regulations-final-for-web.pdf` — 426,598 characters of extracted text; the district tables (pp. 46–119, 138–143) carry the per-district season structure and the five-digit codes and **have not been parsed yet**. They are the source for general-vs-permit status (§6).

### 2.5 Harvest estimates

The three CSV exports supplied by the owner (elk, deer, antelope; 2004–2025) come from FWP's Harvest Estimates Search. Findings in §5. FWP's methodology statement is **not** on the harvest reports page and still needs to be located — it matters for confidence intervals.

### 2.6 GIS (verified)

ArcGIS server: `https://fwp-gis.mt.gov/arcgis/rest/services/admbnd/huntingDistricts/MapServer`

| Layer | Name | Use |
|---|---|---|
| 11 | Deer Elk Lion Hunting Districts | deer + elk boundaries (**shared**, as expected) |
| 3 | Antelope Hunting Districts | antelope boundaries (**different geometry**) |
| 4, 12, 13, 14 | Antelope / Mule Deer / White-tailed / Elk Portions | sub-district portions — the source of the `212E`, `560N`, `520NW` codes in the harvest data |
| 2, 15 | Big Game / Elk Restricted Areas | candidate source for permit-restricted area shading |

Layer 11 fields: `DISTRICT` (3-char), `REG` (region), `AREA_AC`, `AREA_MI`, `REGYEAR`, plus deer/elk web page links and a PDF map link. `AREA_MI` gives us unit area directly, so density does not need an offline acreage build the way Colorado did — but verify `AREA_MI` against the geometry before trusting it (Wyoming's equivalent `SqMiles` was stale for redrawn areas).

These layers are **current-season only** (description: "the current deer-elk-lion hunting districts"). The hub also publishes *"Antelope Hunting Districts All Past Years"* and *"Big Game Hunting District Restricted Areas All Past Years"*, which are the historical tie-out source (§4). The deer/elk "all past years" equivalent still needs locating.

### 2.7 Fees — current schedule, no season year on the page

`https://fwp.mt.gov/buyandapply/hunting-licenses/nonresident-licenses/fees`, checked Nov 10 2026. **This page carries no season year**, exactly like IDFG's fee pages, so every Montana fee we display must be labelled "current schedule, checked &lt;date&gt;" and never given a year. See §7 — the current page already disagrees with the 2025 regulations PDF.

---

## 3. Draw rules, as the reports actually show them

### 3.1 Nonresident combination — verified, and the headline finding

2026 report, Big Game / Elk Combination, regular drawing (29,892 applicants):

| Preference points | Applicants | Successful | Draw rate |
|---|---|---|---|
| 2.2 – 3 | 5,377 | all | 100% |
| 2 | 9,609 | 7,281 | 75.77% |
| 0.2 – 1.8 | 7,063 | 0 | **0%** |
| 0 | 7,843 | 4,205 | 53.61% |

General Deer Combination, primary drawing (13,213 applicants): 1.2–3 pts 100%; 1 pt 20.90%; **0.2–0.75 pts 0%**; 0 pts 51.03%.

Checks that passed:

- Preference-phase winners 5,377 + 7,281 = 12,658 of 16,863 total = **75.0%**; random winners 4,205 = **24.9%**. The 75/25 split is exact.
- Total drawn 16,863 ≈ the 17,000 Big Game combination quota named in the 2025 regulations. Independent corroboration of both numbers.
- The 25% random pool is **zero-point applicants only**. FWP's page does not say this outright, but it is forced by the data: 7,063 applicants between 0.2 and 1.8 points drew nothing while zero-point applicants drew at 53.61%. They cannot have been in the same random pool.

So the model is:

```
rank applicants by points descending
fill 75% of quota from the top → cutoff level gets remaining/applicants
0 < points < cutoff            → 0%
points == 0                    → 25% of quota ÷ zero-point applicants
```

Fractional levels (2.2, 0.75) are **party applications**: a party's points are the average of its members', rounded to three decimals, and the party draws as a single entry. Point levels are therefore continuous, and the report groups them into bands. The parser must accept a decimal points column and must not round it into integer buckets.

**The consequence a Montana applicant most needs told:** in 2026, a nonresident holding 1 preference point had **no chance at all** at a big game combination, while a nonresident holding none drew at better than a coin flip. Below the cutoff, buying a preference point is strictly worse than holding none. This is the opposite of how Colorado and Wyoming points behave and it is the single most important thing the Montana pages must communicate. See §9.

Also verified from FWP: points cap at 3; points are lost on drawing **and on skipping an application year**; a separate Nonresident Landowner Priority Pool runs alongside (133 applicants in 2026, all point levels drawing at 100% where any applied) and must be modelled as its own pool.

### 3.2 Bonus points — formula contested, evidence favours one reading

FWP's two pages disagree, and this is not a nitpick — it changes every permit odds number on the site:

- The [bonus points page](https://fwp.mt.gov/buyandapply/hunting-licenses/bonus-points) says 10 points gives 101 chances, i.e. `entries = p² + 1`.
- The [licence FAQ](https://fwp.mt.gov/buyandapply/licenseandpermitfaq) works an example of 3 accumulated points plus 1 purchased = 4² + 1 = **17** chances, i.e. `entries = (accumulated + purchased)² + 1`.

Tested against the 2026 Antelope detailed report. Pooling the 20 pools where zero-point odds are under 10% (so that without-replacement saturation barely distorts the ratios):

| Accumulated points | Pooled odds | Observed ratio to 0 pts | `p²+1` predicts | `(p+1)²+1` predicts |
|---|---|---|---|---|
| 0 | 4.09% | 1.00 | 1.0 | 1.0 |
| 1 | 10.11% | **2.48** | 2.0 | **2.5** |
| 2 | 19.22% | **4.70** | 5.0 | **5.0** |

Point level 1 is the only level that distinguishes the two formulas, and it lands on 2.48. **The evidence favours `(accumulated + 1)² + 1`**, with the report's "Number of Points" column meaning accumulated points *before* the current year's purchase.

Caveats, recorded honestly: the unfiltered median across all 36 usable pools was 2.14 at point level 1, not 2.48, and that gap is not yet explained. Levels 3 and 4 are censored by pools where odds approach 100% and were not used. **This must not ship until validation gate 1 in the adapter guide passes** — a full without-replacement simulation reproducing the published successes per point level across many codes and at least three years.

The second bonus-point rule to verify before building: the FAQ states that accumulated bonus points are **not used at all** in a year unless you buy a point with that application. If true, a hunter sitting on five points who applies without buying gets exactly one chance. That is a trap no other state in the app has, and it needs its own UI warning. It also means the "points" a hunter stores in their account is not sufficient state — we need to know whether they are buying this year.

### 3.3 Nonresident caps — the one architecture-guide claim that survived

Nonresident share of antelope licence successes, across 44 codes with 50+ total successes: median 9.4%, 75th percentile 10.0%, maximum 10.4%. The 10% nonresident cap is real for antelope licences. Do not generalise it to deer and elk permits without the same test — run it per species and per year from the reports rather than hard-coding a constant.

---

## 4. Tying hunting districts together across years

Districts change, and both name-matching and silent aggregation would produce wrong five-year metrics.

Observed in the harvest data:

- **Splits and merges that reverse:** `520` → `520NW`/`520SE` (2013) → `520E`/`520W` (2017) → back to `520` (2018). Also `212`/`212E`/`212W`/`212UN`, `560`/`560N`/`560S`/`560UN`, `391`/`391N`/`391S`, `411E`/`411W`, `510E`/`510W`. The `UN` suffix is "unspecified portion". These correspond to the "Portions" GIS layers (§2.6).
- **A large restructure in 2022:** elk lost 34 districts and gained 10; deer lost 29 and gained 7; antelope lost 18 and gained 16. Districts `323` and `324` vanish in 2022 and **return in 2024**, while `102`, `109`, `203`, `283` and `300` never come back.
- Montana sets regulations on a **two-year cycle** (the current GIS layer is labelled "2026 and 2027 Seasons"), which is why the changes arrive in jumps on even years.

**Do not build the crosswalk from district numbers.** Build it from geometry:

1. Pull the "All Past Years" district layers and the current layer, keyed by `REGYEAR`.
2. For each consecutive pair of regulation cycles, intersect polygons and record the area overlap matrix.
3. Classify: unchanged (>99% mutual overlap), split, merged, renumbered, retired, new.
4. Store the crosswalk as `data/mt/district-history.json` with the evidence (overlap fractions), and expose a canonical `districtFamily` for multi-year aggregation.
5. Aggregate multi-year metrics **only within a family whose geometry is stable across the years being pooled**. Where it is not stable, show the shorter series and say why rather than pooling across a boundary change.

A sub-district (`212E`) rolls up into its parent family (`212`) for pooling, but its own rows must be kept separate in the raw tables.

---

## 5. Harvest data — read this before using the CSVs

This is where Montana is genuinely weaker than Idaho, Colorado and Wyoming, and the weakness is not the one previously recorded in `western-state-research.md`.

### 5.1 District-level estimates alternate by species — the owner was right

Every calendar year 2004–2025 is present in all three files, which is why a first pass reads as full annual coverage. It isn't. In the off years **every district row is zero** and only the statewide row carries data.

| Species | Years with district-level data |
|---|---|
| Elk | 2004–2012 annually, 2014, 2015, 2016, then **even years only**: 2018, 2020, 2022, 2024 |
| Deer | 2004–2011 annually, 2013, then **odd years only**: 2017, 2019, 2021, 2023, 2025 |
| Antelope | 2004–2012 annually, 2014, 2015, then **even years only**: 2018, 2020, 2022, 2024 |

Since 2017 FWP rotates: deer in odd years, elk and antelope in even years. Most recent district-level data is **deer 2025, elk 2024, antelope 2024**.

Consequences:

- "Five-year success" cannot mean five calendar years. It must mean **five surveyed seasons**, which spans about nine calendar years for elk and antelope. Label it with the actual years on every surface: "5 surveyed seasons (2016, 2018, 2020, 2022, 2024)".
- Never interpolate a missing year, and never treat a zero row as a zero harvest. A zero district row in an off year means *not estimated*, and must be read as null before any aggregation.
- Deer and elk success figures for the same district will come from different years. On a combined deer/elk page this must be stated, not smoothed over.

### 5.2 Hunter counts are not additive across districts

Rows whose "Hunting District" is not a district: `State`, `XXX`, `Reg_X`, `Reg_1`…`Reg_7`, and `1XX`…`7XX`. `State` is the statewide estimate; `Reg_n` are regional; `nXX` is "district unknown within region n"; `XXX` and `Reg_X` are statewide-unknown. Filter all of them out of district tables — and note that `State` is a word, so a numeric-only filter will silently include it and double the state total.

2024 elk, residency `SUM`:

| | Hunters | Harvest |
|---|---|---|
| Sum of district rows | 143,059 | 27,931 |
| Sum of region rows | 121,602 | — |
| `State` row | 111,969 | 28,188 |

**Harvest is additive** (district sum + unknown ≈ statewide; an animal is killed in one district). **Hunters are not**: district sums exceed the statewide estimate by about 28%, regional sums by about 8%. A hunter who hunts three districts is counted in all three. The same pattern holds in 2004 and 2015.

So:

- A per-district success rate (district harvest ÷ district hunters) is valid, because numerator and denominator share the same district scope.
- Per-district hunter density is valid and arguably the right crowding measure: it counts everyone who hunted there.
- **Never sum district hunter counts** to get a multi-district, regional or statewide figure — for a multi-district licence, use FWP's own region or state rows, and label the basis, per the existing `basis` convention in the adapter guide.

### 5.3 Smaller data notes

- `SUM` ≠ `R` + `N` in 617 district-years, but always by exactly 1. These are independently rounded survey estimates, not errors. Take `SUM` as published; do not reconstruct it.
- Deer rows carry `all_deer`, `md` and `wt`. `all_deer` ≠ `md` + `wt` in 2,447 of 3,794 district-years — `all_deer` is separately estimated, and a hunter can appear under both species. Mirror the Wyoming treatment: combined deer success is an upper bound.
- The export carries no confidence intervals. FWP's harvest estimates are survey-based; until the methodology statement is found, we cannot state precision, and small-district figures should carry a sample caveat or be withheld.

---

## 6. General versus permit districts

The owner's requirement: every district open to a general tag appears, with shading for which districts have a general hunt, and Montana has very few permit-only districts.

Not yet sourced. Three candidates, in order of preference:

1. The **regulations district tables** (2025 regs pp. 46–119) — authoritative, states per district what the general licence is valid for and which permits exist. Requires parsing the regs PDF; this is the real job.
2. **Big Game Restricted Areas / Elk Restricted Areas** GIS layers (2, 15) — gives a map layer directly but describes restricted areas, which is not the same fact as "a general licence is valid here".
3. Derived from the LPT list — a district that appears only with permit codes and never with a general season. Weakest, and inverts the logic; use only as a cross-check.

Build from (1), cross-check against (3), and use (2) for map shading only if its semantics hold up. Do not infer "general" from the absence of a permit.

---

## 7. Costs and refunds

Two sources disagree, which is itself the finding. 2025 regulations PDF versus the current nonresident fees page (checked Nov 10 2026):

| Item | 2025 regs | Current page |
|---|---|---|
| NR Big Game Combination | $1,278 | **$1,312** |
| NR Elk Combination | $1,078 | **$1,112** |
| NR Deer Combination | $744 | **$760** |
| NR base hunting licence | $15 | **$50** |
| NR antelope | $205 | $200 |
| NR Deer B / Elk B (drawing) | $80 / $275 | $75 / $270 |

Other fees, from the 2025 regulations: resident general deer $16, general elk $20, deer permit application $5, elk permit application $9, Deer B $15 drawing, Elk B $25 drawing, antelope $19. Bonus point $2 resident / $20 nonresident per licence or permit. Preference point $100. Application fee $5 per licence or permit applied for, **nonrefundable** ($50 for moose/sheep/goat/bison).

Refunds, from the 2025 regulations: the $5 application fee and the prerequisite licences (base hunting, conservation, AIS) are never refunded. For a drawn combination licence returned later: 80% before Aug 1, then 50%. Hardship refunds: 100% on death of the licensee, 90% on death of an immediate family member or medical emergency. Taking the 80% refund option **resets preference points to 0**.

**Not yet confirmed, and needed before any cost line ships:** exactly what is charged at the moment of application and what comes back automatically to an unsuccessful applicant. FWP's fee page says only that the $5 is nonrefundable; the regulations list refund *mailing dates* by licence type, which implies the full licence fee is taken up front and returned, but that is an inference and must not be presented as fact. Per AGENTS.md, ship this as an itemised "before you draw / if you draw / if you don't draw" breakdown with a source link and a checked date, never as a single total.

### Rule changes in flight

In December 2025 the Fish and Wildlife Commission voted to withhold about **2,500 nonresident general deer licences** — specifically half of the deer licences that are detached from elk combination licences when a nonresident applies for the elk combo only — for the 2026–2027 seasons, with a regional allocation option tied to the 2027 licence year. FWP projected more than 12,000 nonresident general deer licences would still be issued. The 2026 reports already post-date this vote, but any projection into 2027 must not extrapolate a quota trend through it. Montana needs the same treatment Colorado's 2028 change gets: a dated note on the page.

---

## 8. Network and tooling

- The workspace shell **cannot** reach `myfwp.mt.gov` or `fwp.mt.gov` (agent proxy refuses the connection), matching the CLAUDE.md note for other agency sites. `fwp-gis.mt.gov` and the ArcGIS REST API were reachable through WebFetch.
- Working route, used for all the report research above: Claude in Chrome on the owner's machine, loading pdf.js 4.4.168 from cdnjs into a tab on `myfwp.mt.gov` and parsing by x/y text position. 15 pages, 1,039 rows, no failures.
- Therefore the import pipeline mirrors Wyoming's: a browser-side or owner-run fetch step produces the PDFs or extracted text, and a committed, reproducible build script turns them into `data/mt/*.json` with checks that fail loudly.

---

## 9. Points and odds visualisation

Montana cannot reuse the Colorado points chart unchanged, because Colorado's curve is monotonic and Montana's is not. The nonresident combination chart has four zones and the dead zone is the point of it:

- **At or above the cutoff** — drew, 100%.
- **The cutoff level itself** — partial, show the actual rate (75.8% in 2026).
- **Above zero, below the cutoff** — 0%, shaded distinctly, labelled in plain hunter language: "1 point drew nothing in 2026."
- **Zero points** — its own bar, with its own basis note: "25% of licences are drawn at random among zero-point applicants."

The hunter's own point balance is marked on the axis, as Wyoming's ladder does. Where a hunter sits in the dead zone, the page must say so directly rather than printing "0%" and leaving them to work out why. The "years to draw" idea does not transfer: with a 3-point cap and points lost on a skipped year, the honest statement is which point level cleared the cutoff in each of the last N draws.

For bonus-point species the chart is a conventional rising curve by point level, built from the detailed reports — closer to Colorado, but with resident, nonresident and the two landowner pools kept separate.

---

## 10. What follows the existing pattern, and what is new

Follows Idaho/Colorado/Wyoming with no new concepts:
- `StateConfig` registration in `src/lib/states.ts`, including `privateLandOnly`.
- `HuntSummary` rows, state-prefixed unit keys (`mt-312`) and hunt slugs.
- A `src/lib/mtOdds.ts` pure adapter, its own filter group, map metrics, hunt and unit pages, CSV.
- Success, density, land and score plumbing — with Montana's own labels for surveyed years.

New work Montana forces:
- Two point systems in one state, so the account model needs **per-system** point balances, not one number per species. Colorado's special-species split is the nearest precedent but is not the same shape.
- A points value that can be **fractional** (party averaging) and **capped**.
- A "did you buy a point this year?" input for bonus-point species, if §3.2's second rule holds.
- Species-specific unit geometry: deer and elk share districts, antelope does not. The map needs the same species-switch Wyoming has, but for a different reason.
- Surveyed-year labelling throughout, because no two species share a harvest year.
- General-licence shading as a first-class unit attribute.

Open question for the owner: **should Montana launch with the nonresident combination draw only?** It is the thing a Washington hunter actually needs, it is fully verified, and it is nine years deep. The bonus-point permit side is a bigger build that is gated on resolving §3.2. Shipping the combination draw first would get Montana live sooner and is consistent with "launch the core species first".

---

## 11. Build order

1. `scripts/mt_fetch_sources.mjs` → `data/mt/draw-sources.csv`; freeze a PDF fixture per report shape (2006 combined, 2022 renamed, 2026 split, NR combo).
2. NR combination parser + `mtOdds` preference model; reproduce 2018–2026 published results exactly (gate 1); Brier backtest against "last year's cutoff" (gate 2) before any projection is shown.
3. District crosswalk from the GIS "all past years" layers → `data/mt/district-history.json`.
4. Harvest loader with the §5 rules: rollup rows dropped, off-year zeros nulled, surveyed years recorded per species.
5. Regulations district-table parser → general-vs-permit, season dates, LPT→district mapping.
6. Bonus-point simulator, only once gate 1 passes for a sample of codes across three years.
7. UI: cards, hunt and unit pages, the §9 charts, filters, map, both UAT personas, phone and desktop.

Nothing in steps 1–7 writes to production. The eventual import follows the Wyoming pattern: a state-scoped script, a reviewed dry run, and the owner's explicit yes, per AGENTS.md.
