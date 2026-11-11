# Montana onboarding: data, draw models and integration plan

Status, Nov 10 2026: **the nonresident combination draw is built, with six draws of history** — 2021–2026 parsed from FWP's own report text (`data/mt/nr-combo-text/` → `data/mt/nr-combo.json`), odds adapter (`src/lib/mtOdds.ts`), charts and the `/montana` page. Gate 1 passes for 2021–2026 (see §3.1). No projection for 2027, by decision. Everything else below is still research and plan: no permits or B licenses, no districts, no harvest, no hunt or unit rows, nothing imported into the database. Montana is registered in `src/lib/states.ts` as **disabled**, so it stays out of the state picker and Find Hunts until it has hunt data. Everything marked *verified* was checked against the agency's own reports or GIS services; everything marked *unverified* is a lead. Use this worksheet with the [state-onboarding checklist](../state-onboarding-checklist.md) and the [state adapter guide](../state-adapter-guide.md).

Scope for the first release: **deer, elk and antelope (pronghorn)**. Moose, sheep, goat and bison use the same bonus-point machinery and can follow once the core three are validated.

---

## 1. What is different about Montana

Montana does not fit either the Idaho or the Colorado template cleanly, and it is the first state we would add that runs **two unrelated draw systems at once**:

| | Nonresident combination licenses | Everything else (permits and B licenses) |
|---|---|---|
| System | **Preference points**, capped at 3 | **Bonus points**, squared, uncapped |
| Applies to | NR general deer/elk opportunity | Antelope, Antelope B, Deer B, Elk B, deer permits, elk permits |
| Allocation | 75% by points, 25% random **to zero-point applicants only** | Weighted lottery over the whole pool |
| Points lost | On drawing, **and on not applying in the next drawing** (a point-only purchase doesn't prevent it) | On drawing only |
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

**Built 2026-11-11** into `data/mt/units.json` (`scripts/mt_build_districts.ts --from <dir>`): 139 deer/elk and 61 antelope districts, all `REGYEAR` 2026. Saved from the browser because neither the workspace nor the owner's PC shell can reach fwp-gis.mt.gov. Geometry is server-generalized (`maxAllowableOffset` 0.001°, ~100 m) for display: full resolution froze the tab. The public-land overlay must fetch full resolution, not reuse these.

Checks against data the geometry did not produce:
- Deer: every one of the 138 districts with 2025 harvest has a polygon. The only polygon without harvest is 432.
- Antelope: every one of the 59 districts with 2024 harvest has a polygon. Extras with no harvest: 413 and 485.
- Elk 2024 harvest reports ten codes with no polygon: 391N/S, 411E/W, 535E/W, 580N/S and 701E/W. They are elk *portions* of 391, 411, 535, 580 and 701 (layer 14), so the hunt-to-district join must map portions to parents.
- Deer/elk districts total 84.2M acres. Montana's land area is about 93M acres. The gap is about the size of Montana's Indian reservations (~8M acres), which FWP districts would not cover. That explanation is plausible but **not yet checked against a reservation layer**.

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
- The 25% random pool is **zero-point applicants only**. The 2025 regulations (p. 17) state it; an earlier note here said FWP didn't, which was wrong — we had only read the web page. The data agrees independently: 7,063 applicants between 0.2 and 1.8 points drew nothing while zero-point applicants drew at 53.61%. They cannot have been in the same random pool.

So the model is:

```
rank applicants by points descending
fill 75% of quota from the top → cutoff level gets remaining/applicants
0 < points < cutoff            → 0%
points == 0                    → 25% of quota ÷ zero-point applicants
```

Fractional levels (2.2, 0.75) are **party applications**: a party's points are the average of its members', rounded to three decimals, and the party draws as a single entry. Point levels are therefore continuous, and the report groups them into bands. The parser must accept a decimal points column and must not round it into integer buckets.

**The consequence a Montana applicant most needs told:** in 2026, a nonresident holding 1 preference point had **no chance at all** at a big game combination, while a nonresident holding none drew at better than a coin flip. Below the cutoff, buying a preference point is strictly worse than holding none. This is the opposite of how Colorado and Wyoming points behave and it is the single most important thing the Montana pages must communicate. See §9.

#### The full series, 2021–2026 (gate 1)

Six draws are parsed and machine-checked (`tests/mtOdds.test.ts`). The allocation rule holds in **every** regular draw:

| Draw | Big Game / Elk cutoff | At the cutoff | 0 points | Licenses | Random share |
|---|---|---|---|---|---|
| 2021 | 1 | 31% | 71.7% | 16,994 | 25.01% |
| 2022 | 2 | 97.5% | 73.6% | 16,998 | 25.00% |
| 2023 | 2 | 83.9% | 60.2% | 17,000 | 25.00% |
| 2024 | 2 | 90.27% | 56.61% | 16,864 | 25.05% |
| 2025 | 2 | 83.80% | 52.84% | 16,870 | 24.91% |
| 2026 | 2 | 75.77% | 53.61% | 16,863 | 24.94% |

What this settles, and what it changes:

- **The dead zone is not permanent, it is a consequence of where the cutoff lands.** In 2021 the cutoff sat at the 1-point level, so there was nothing between it and zero and no dead zone existed. From 2022 the cutoff has sat at 2 points every year, so 1-point holders have drawn nothing for five straight years. The model derives this rather than hard-coding it.
- **Big Game and Elk combinations are one drawing.** FWP reported them as two licenses through 2021 and as a single "Big Game/Elk Combo" from 2022. The 2021 tabular report's separate pools give a random share of 22.85% (big game) and 31.76% (elk), which looks like a rule change — but combined they give 25.007%, and FWP's own 2022 restatement of 2021 confirms the single pool. **Treat them as one draw in every year.** This was nearly recorded as "the rules changed in 2022"; they did not.
- **Holding one point has been worse than holding none in all six draws**, not just the recent ones. Even in 2021, when 1 point still drew, it drew at 31% against 71.7% for zero points.
- **Where two reports restate the same draw, they agree exactly** for every overlap in 2021–2026, and the build fails if that ever stops being true. The exception is outside the narrative series: FWP's older tabular 2021 report bands points as whole numbers and disagrees slightly with the 2022 restatement (31,917 vs 31,915 applicants). The narrative restatement is used.
- **Two of FWP's printed totals do not close**: 2023 big game is 90 applicants short of its own band sum, and 2021 deer by one. Both are recorded as `totalMismatch` and shown as published rather than silently corrected. The parser fails if a gap exceeds 1% of the total.
- **2022 big game omits its 0% band entirely.** The 12,188 applicants the printed total does not account for are reconstructed and flagged `inferred`, bounded so the reconstruction cannot absorb a genuinely lost row.

**2018–2020 are not parsed.** Those PDFs are laid out column-wise, so extracting text by line yields stacked fragments ("100 100 100 100 100", "Successful", "%") rather than rows. They need 2-D reconstruction from x/y positions, which is a separate job. Six years is already enough for gate 1 and for the cutoff history; the older years matter only if a projection is attempted later.

Also verified from FWP: points cap at 3; points are lost on drawing **and when a holder does not apply for a combination licence in the next available drawing** (2025 regulations p. 17). A nonresident who does not apply may buy one point-only ($100, Jul 1 – Dec 31), but that does not stop the deletion: the rule is about applying. Earlier site copy said buying a point kept them; corrected 2026-11-11; a separate Nonresident Landowner Priority Pool runs alongside (133 applicants in 2026, all point levels drawing at 100% where any applied) and must be modelled as its own pool.

### 3.2 Bonus points — formula contested, evidence favours one reading

FWP's two pages disagree, and this is not a nitpick — it changes every permit odds number on the site:

- The [bonus points page](https://fwp.mt.gov/buyandapply/hunting-licenses/bonus-points) says 10 points gives 101 chances, i.e. `entries = p² + 1`.
- The [licence FAQ](https://fwp.mt.gov/buyandapply/licenseandpermitfaq) works an example of 3 accumulated points plus 1 purchased = 4² + 1 = **17** chances, i.e. `entries = (accumulated + purchased)² + 1`.

Tested properly on 2026-11-10: **7,000 point-level rows** across antelope, Deer B, Elk B and the elk permit
reports, 2024–2026, fitted with a Monte Carlo of the weighted draw **without replacement** — the algorithm
FWP actually runs, and the one the adapter guide prescribes.

First attempt used the closed-form approximation `P(draw) = min(1, c · entries)`. It ranked "points don't
matter at all" **above** both squared candidates, which is a sign the model was wrong rather than the data.
Capping at 1 ignores that a winner's entries are removed, and that is exactly what bites at high draw rates.
Replacing it with a real simulation fixed the ranking.

| Entry weight | Log-likelihood (220 pools) |
|---|---|
| `(points+1)² + 1` | **−53,855** |
| `points² + 1` | −53,900 |
| `(points+1)²` | −54,069 |
| `points + 1` | −55,676 |
| 1 (points ignored) | −63,240 |

**Squaring is confirmed decisively** — both squared forms beat `points+1` by thousands of log-likelihood
units. **Which squared form is not resolved**, and my earlier note here claiming the evidence favoured
`(accumulated+1)²+1` was based on too narrow a sample (one report, one low-odds subset, ratio 2.48). On 190
low-saturation pools across three species and three years the picture is mixed:

- the simulation likelihood favours `(points+1)²+1` by 43 units — real but small;
- the observed median odds ratio between 1 point and 0 points is **2.087**, against 2.0 predicted by
  `points²+1` and 2.5 by `(points+1)²+1` — which favours the other one.

A hypothesis that reconciles them, and is consistent with FWP's FAQ rule that accumulated points go unused
unless you buy a point with that application: each reported point level is a **mixture** of applicants who
bought this year and applicants who did not. If a share *f* buy, average entries at level *p* are
`f·((p+1)²+1) + (1−f)·1`, and the 1-versus-0 ratio becomes `(1+4f)/(1+f)`. The observed 2.087 implies
*f* ≈ 0.57. Under `points²+1` the same mixture gives a ratio of `1+f`, which cannot reach 2.087 at all. So
the mixture story only works with the FAQ's formula. **This is a two-parameter fit to aggregate data and is
not good enough to ship.**

**It also turns out not to block anything.** The detailed reports publish observed success *by point level,
per licence code, per pool* — the same shape as Wyoming's printed odds. Last-draw odds for every controlled
hunt can be read straight from them, with no entry formula involved. The formula is only needed to project a
future draw, which Montana is not doing. Controlled-hunt odds are therefore unblocked; resolving the formula
can wait for the projection work, if it ever happens.

The second bonus-point rule — **confirmed** in the 2025 regulations (p. 17), not just the FAQ: accumulated bonus points are **not used at all** in a year unless you buy a point with that application (they are kept, not lost). A hunter sitting on five points who applies without buying gets exactly one chance. That is a trap no other state in the app has, and it needs its own UI warning. It also means the "points" a hunter stores in their account is not sufficient state — we need to know whether they are buying this year.

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

### 5.1 Harvest is annual; hunter participation alternates — corrected 2026-11-10

An earlier version of this section said that in off years "every district row is zero and only the statewide
row carries data". **That was wrong**, and it understated what Montana has. Checked against all three exports:

- **District harvest is estimated every year, 2004–2025**, for 140–168 deer and elk districts and 58–69
  pronghorn districts. The harvest trend is annual, like Idaho's.
- **Hunters and days are not.** FWP surveys hunter participation in alternating years by species. In a
  non-survey year every district's `Hunters` and `Days` read 0 while the harvest columns are populated.

| Species | Years hunter participation was surveyed | Latest |
|---|---|---|
| Elk | annual 2004–2012, then 2014, 2015, 2016, and even years to 2024 | 2024 |
| Deer | annual 2004–2011, then 2013 and odd years to 2025 | 2025 |
| Pronghorn | annual 2004–2012, then 2014, 2015, and even years to 2024 | 2024 |

Consequences, which are narrower than the earlier note claimed:

- **Harvest trend: annual.** No special handling beyond labelling the source.
- **Harvest success and hunter density: surveyed years only.** Both need a hunter count, so both are
  limited to the table above. "Five-year success" means five *surveyed* seasons — about nine calendar
  years for elk and pronghorn — and must be labelled with the actual years on every surface.
- Deer and elk success for the same district will always come from different years. On a combined page
  that has to be stated, not smoothed over.
- A zero `Hunters` in a non-survey year means *not estimated*. `scripts/mt_build_harvest.ts` stores it as
  **null**, never 0, and never interpolates. A district reporting hunters in a year classed as unsurveyed
  fails the build.

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

### What the finder has to show for general districts (owner, Nov 10 2026)

Every district open to a general tag appears as a row in Find Hunts, carrying:

- the **last reported harvest statistics** for that district — which, given §5, means the most recent *surveyed* season for that species, labelled with its actual year, and different years for deer and elk on the same district;
- the hunter's **overall odds**, which for a general tag is the combination-licence draw at their preference point balance — the same number `mtOdds` already produces. It is a statewide figure, identical across every general district, so the card must say that it is the chance of getting a licence at all, not the chance of drawing that district. Printing a per-district number that never varies would read as a per-district fact and mislead;
- **shading on the map** for which districts have a general hunt, since very few Montana districts are permit-only.

Two things to settle before building it. First, a Montana general district is not a "hunt" in the Idaho sense — the licence is statewide and the district only bounds where you may use it, so the hunt/unit identity needs deciding rather than copying. Second, a hunter holding 1 point currently draws at 0%, which would stamp **0% on every Montana row in a combined search**. That is accurate, but it needs the dead-zone explanation attached to the card, not a bare zero.

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
- A points value that can be **fractional** (party averaging) and **capped**. A *person's* balance is whole; only a party's average is fractional, so the account stores whole points.
- A "buying a point this year?" input per bonus-point licence type. **Built** (2026-11-11): the account page stores one combination preference balance (0–3) and a bonus balance plus buying switch for each of deer permit, elk permit, antelope, Deer B, Elk B and Antelope B (`src/lib/mtPoints.ts`). Bonus points are per licence type and not transferable between species drawings (regulations p. 17); antelope archery-only codes (`900-20`) are antelope licences and share the antelope balance.
- Species-specific unit geometry: deer and elk share districts, antelope does not. The map needs the same species-switch Wyoming has, but for a different reason.
- Surveyed-year labelling throughout, because no two species share a harvest year.
- General-licence shading as a first-class unit attribute.

Open question for the owner: **should Montana launch with the nonresident combination draw only?** It is the thing a Washington hunter actually needs, it is fully verified, and it is nine years deep. The bonus-point permit side is a bigger build that is gated on resolving §3.2. Shipping the combination draw first would get Montana live sooner and is consistent with "launch the core species first".

---

## 11. Build order

1. ~~`scripts/mt_fetch_sources.mjs` → `data/mt/draw-sources.csv`~~ **done** (manifest partial; regenerate before the permit work). Still to do: freeze a PDF fixture per report shape (2006 combined, 2022 renamed, 2026 split).
2. **Done for 2021–2026.** `scripts/mt_parse_nr_combo.ts` parses the narrative reports; `scripts/mt_build_nr_combo.ts` merges them into `data/mt/nr-combo.json` and fails if two reports state the same draw differently; `src/lib/mtOdds.ts` resolves odds from the cutoff rather than by matching a printed band, so a party's fractional average still lands correctly. The extracted report text is committed under `data/mt/nr-combo-text/` so the build is reproducible without a browser. 30 tests.
   - Format quirks the parser handles, all real: point bands written either way round (`2.2 – 3`, `3-2.2`); en dash or hyphen; leading-dot decimals; pdf.js splitting digits inside numbers (`9,7 21`, `2,01 8`, `53. 6`); successes written as `, 7,281 successful` or `/ 9,098 combos available`; the word "Draw" missing; and a whole band omitted. Percentage tolerance follows the printed precision — the 2022-era reports round to whole numbers (17% for 17.46%), while 2026's two decimals are held to two decimals.
   - Still to do: 2018–2020, which need a column-aware extractor (see §3.1). Gate 2 (Brier backtest) stays unstarted until someone wants a projection — nothing projects today, and `/montana` says so.
3. District crosswalk from the GIS "all past years" layers → `data/mt/district-history.json`.
4. Harvest loader with the §5 rules: rollup rows dropped, off-year zeros nulled, surveyed years recorded per species.
5. Regulations district-table parser → general-vs-permit, season dates, LPT→district mapping.
6. Bonus-point simulator, only once gate 1 passes for a sample of codes across three years.
7. UI: cards, hunt and unit pages, the §9 charts, filters, map, both UAT personas, phone and desktop.

Nothing in steps 1–7 writes to production. The eventual import follows the Wyoming pattern: a state-scoped script, a reviewed dry run, and the owner's explicit yes, per AGENTS.md.
