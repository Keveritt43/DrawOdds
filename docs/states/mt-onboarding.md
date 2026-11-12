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
- `TT` is the licence type within a species, but it is **not unique across species**: `100-00` is both a Deer B and an Elk B licence (§2.4). Antelope licences end `-20`/`-21`, antelope B `-30`/`-31` (an earlier note here said antelope B was `-21`; the regulations and the draw reports both say `-30`). Always key a code by licence type + code.
- **Residency** has four values, not two: `RESIDENT`, `RESIDENT LANDOWNER`, `NONRESIDENT`, `NONRESIDENT LANDOWNER`. Landowner preference is a **separate pool** and must not be merged into the general pool — a landowner row at 100% would otherwise flatter the public odds.
- `% Successful` = successes ÷ applications for that point level.
- `# Applicants` is **first-choice only** (stated in the page legend), like Wyoming.

### 2.3 Nonresident combination reports (verified against 2026, objectID 116132)

Nine years available, 2018–2026, plus rolled-up "2011 Through 2020" style multi-year files. Titles drift here too: *"Nonresident Combination License Preference Point Drawing Statistics"* (2018–2021), *"Big Game Combo / Elk Combo Drawing Statistics"* + a separate deer file (2022), *"NR Combo PP Stats"* (2023), *"NR Combination Preference Point Statistics"* (2024–2026).

### 2.4 Regulations — parsed 2026-11-11

**Use the 2026 book, not 2025.** Earlier notes here pointed at the 2025 regulations. FWP's regulations page now lists the [2026 Deer, Elk & Antelope regulations](https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/2026/2026-dea-regulations-final-with-low-resolution-maps-for-web.pdf) (141 pages) and a one-page [corrections](https://fwp.mt.gov/binaries/content/assets/fwp/hunt/regulations/2026/corrections-to-the-2026-printed-dea-regulations-and-legal-descriptions.pdf) sheet. District boundaries are on a two-year cycle (legal descriptions valid Mar 1 2026 – Feb 28 2027), and match the 2026 GIS layer in `data/mt/units.json`. The 2027 regulations are not published yet, so the next draw's season structure is unknown: label what we show as the 2026 regulations.

Built: `data/mt/regs-2026.json` by `scripts/mt_parse_regs.py` from two browser extracts kept in `data/mt/source/` so the build reruns offline:

- `2026-dea-regs-text.json` — every pdf.js 4.4.168 text run with its position. Pages 44–120 are stored rotated 90°; the parser re-projects them.
- `2026-dea-regs-rules.json` — the y of every horizontal table rule, per column, found by rendering each page at 3× and scanning pixel rows. **This is why the parse is right.** Cells merge vertically (one "General Deer License" cell spans four season rows; one Elk B licence carries different restrictions on its two rows), and merged text is centred on rows of unequal height, so text position alone misassigns it. A cell is the band between two rules in its column, as drawn.

Output: 335 district/species tables (139 deer, 139 elk, 57 antelope sections), 1,418 opportunity rows, 387 licence/permit codes, 42 multi-district codes. Each row: licence, code, opportunity, apply-by, OTC flag, quota, quota range, the five season columns (two for antelope), restrictions text, and a section qualifier where the species band carries one.

Checks, none of which the parser can satisfy by construction:

- **Every GIS district has a table and vice versa:** deer 139/139, elk 139/139. Antelope 55 district tables plus Region 7's two "Portions of HDs 700–705 North / South of the Yellowstone" sections cover all 61 GIS districts.
- **Five pages compared cell by cell against the rendered page** (pp. 53, 59, 60, 95, 137), including both merged-cell cases. `tests/mtRegs.test.ts` holds those values.
- **The multi-district reference table (pp. 122–123) and the district tables are printed independently, and name the same districts for every one of the 42 codes.** My first parse said three disagreed; that was my regex stopping at the word "portion" ("a portion of 270"). Corrected, and any future disagreement now fails the build.
- **Drawing-only elk.** Nine districts have no General Elk License at all: 250, 410, 455, 555, 620, 621, 622, 630, 700. Seven carry the band "ELK Hunting by Drawing Only"; HD 250 and 622 print no band but their elk tables hold only Elk B licences and permits (250 confirmed on the rendered page).
- **Corrections sheet:** both items (HD 202 archery season, HD 535 youth mule deer antlerless) are already in the web edition; nothing applied.

Findings that change the model:

- **A licence code is not unique on its own.** `100-00` is a Deer B licence and an Elk B licence with different quotas; `005-00` is a drawn Deer B (June 1, quota 4,500) and an over-the-counter Elk B. Key every code by licence type + code. FWP's detailed draw reports are split by licence type, so the join in step 3 is (report type, code), never code alone. This corrects §2.2, which treated the code as the identity.
- **The regulations contradict themselves in seven places**, all checked against the page text. Each district keeps what its own table prints, and the code map records the conflict rather than picking one (`codes[].conflicts`, `codes[].referenceConflict`; the build fails if the set changes):
  - Deer B 395-01: HD 380 "Jun 1", HD 391 "OTC: Jun 15".
  - Elk B 004-00: HD 417 "Jun 1", every other Region 4 table OTC.
  - Elk B 210-03: quota 300 in HD 210, 200 in HDs 211, 212, 216.
  - Elk Permit 799-21: HD 704 prints a range of "1,000–1,000", the others none.
  - The reference table disagrees with every district table on how three licences are sold: Deer B 006-00 (reference OTC; districts June 1, quota 2,000), Elk B 005-00 and Elk B 201-01 (reference June 1; districts OTC, unlimited).
- **Private-land-only is per row, not per licence.** 169 of the 1,418 rows carry "Only valid on private land" (or "Valid on private land only", "Private land only"). Elk B 240-01 is private-only in its late segment and not otherwise. Rows that add other land ("AND ALSO VALID on DNRC lands") are not flagged, and a restriction scoped to other districts ("In HD 390, only valid on private land" printed in HD 380's table) is not applied to the district it is printed in. A hunt is private-only only when every one of its rows is, the Wyoming rule. No district has every general deer or general elk row private-only.
- **Not parsed:** p. 120, the youth/PTHFV summary. It restates rows already in the district tables.

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
- Deer/elk districts total 84.2M acres. Montana's land area is about 93M acres. The gap is about the size of Montana's Indian reservations (~8M acres), which FWP districts would not cover. That explanation is plausible but **not yet checked against a reservation layer**. (2026-11-11: the land build found only 0.13% tribal land inside the districts, and the districts leave out Glacier too, which supports it.)

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

**Corrected 2026-11-11 (step 3).** The analysis above read the last "0" row in the 2024–2026 reports as hunters holding zero banked points. §3.4 shows it is the applicants who **did not buy a point**. The printed level is the points *used* in the draw, banked plus the one bought that year. Read that way:

- FWP's two formulas are the same formula. Both are `level² + 1`, because the level already counts the purchased point.
- The predicted 1-vs-"0" ratio is 2.0. It was observed at 2.087 above, and at 2.0–2.1 in the pooled check below.
- The "mixture of buyers and non-buyers" hypothesis is withdrawn. It reconciled a contradiction that came from misreading the column.
- The simulation likelihood table above was fitted under the old reading and has not been re-run. A projection would need that redone; last-draw odds do not.

### 3.4 What the points column means — established 2026-11-11

FWP never defines it. Its listing legend covers only LPT, applicants and successes, all first-choice. Neither the reports nor the 2023 legislative audit of the drawing system say either. So it was established from the reports' own structure, across every deer, elk and antelope pool, 2021–2026:

| Draw | Bottom groups printed | Reading |
|---|---|---|
| 2021 | blank, `0`, then `1`… in almost every pool | unclear |
| 2022 | blank, then `1`…; a `0` group in 141 of 661 pools | unclear |
| 2023 | blank, then `1`… (a `0` in 7 pools) | points used |
| 2024–2026 | `1`…, then `0` printed **last** (blank in one pool a year) | points used |

The evidence for 2023–2026:

- **No buyer is listed at zero.** Every first-time buyer starts at 1, so the level must include the point bought with that application.
- **A separate group draws at about half the 1-point rate every year.** Pooled over unsaturated pools (all levels under 20%), the ratio of 1-point to that group is 2.04 (2023), 2.09 (2024), 3.15 (2025) and 2.44 (2026). One chance against two (`1² + 1`) predicts 2.0. That group is the applicants who applied without buying, whose banked points the regulations say are not used.
- **It matches an older pattern.** An informal [Hunt Talk thread](https://www.hunttalk.com/threads/montana-drawing-statistics-data-question.306512/) (undated here, not FWP) described the 2021-style layout as blank = didn't buy, 0 = bought with nothing banked. From 2023 the "0 banked" buyers move to 1 and the blank group stays. That's a change of label, not of rule.

2021 and 2022 don't fit cleanly. In 2022 the `0` group draws *worse* than the blank group (ratio 0.43), which no reading of the rules explains. Those years are kept as printed for totals, quotas and trends, but **are not used for odds by point level** (`pointsColumn` in `data/mt/draws.json`).

**What a hunter's saved points mean against these tables:** a hunter with N points on their FWP account who buys a point this year compares with last year's **N+1** row. One who applies without buying compares with the no-purchase row, whatever they hold. That's a one-row shift the hunt pages must make explicitly. It's also why the account tracker stores a "buying this year" switch (#71).

### 3.5 The detailed draw reports, 2021–2026 — parsed 2026-11-11

`data/mt/draws.json` comes from `scripts/mt_parse_draws.py`. Its input is `data/mt/source/draw-reports-2021-2026.json`: the listing read in the browser, the pdf.js text of every PDF, and the 2021–2022 reports, which are **Excel files** (`.xls`). Those were converted with LibreOffice into `data/mt/source/draw-xls-csv/`.

- **Coverage.** The full FWP listing has 76 deer, elk and antelope reports for 2021–2026. The hand-built `draw-sources.csv` lacked the 2023 Deer Permit and Elk Permit detailed reports (108845, 108847). The output holds 2,149 licence-years and 32,407 point-level rows.
- **Format traps, all handled and all reported if they recur:**
  - column positions differ in every report, so rows are read by token type, not position;
  - 2026 deer codes carry the species ("004-01 WT", "101-50 MULE");
  - elk permit codes carry notes ("270-45 (First Choice Only)");
  - some summary PDFs split a code into three runs ("100", "-", "00");
  - a blank points cell and a "0" are different values and are kept apart.

  The first two were being **skipped silently** until the parser was made to fail on any data line it can't read.
- **FWP's printed totals:** 2,147 per-code TOTAL rows, and all agree with the rows except one. 2024 Deer B 393-01 rows sum to 151 applications against a printed 152; successes agree.
- **Detailed vs summary report:** the summary report is printed separately and gives quotas by pool and 1st/2nd/3rd-choice results. The detailed report's first-choice pool totals match it **exactly in about 95% of pools**, within 1% in about 4%, and by more in about 1% (90 of 6,512). Where they differ, the summary nearly always has a few more applicants and the same successes. The two are run on different dates, so the detailed report is used for odds.
- **Against the 2026 regulations:**
  - 362 of 363 drawn codes have a 2026 report, and every report code is in the regulations.
  - The one gap is Elk B 004-00, which the regulations print as "Jun 1" only in HD 417. It has no draw report, so it was sold over the counter, and HD 417's line is the misprint.
  - All 41 quotas that differ from the printed regulations fall inside the printed quota range, none outside. FWP sets the final quota within the range, which is what the range is for.

### 3.6 Nonresident caps — the one architecture-guide claim that survived

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

**Sourced from the regulations district tables (§2.4).** That bears the requirement out:

- Every one of the 139 deer/elk districts has a General Deer License opportunity.
- 130 have a General Elk License opportunity. The nine that don't are drawing-only for elk: 250, 410, 455, 555, 620, 621, 622, 630, 700.

Two cautions for the build:

- **"Has a general licence row" is not "a general hunter can hunt there."** Some general rows are youth-only, PTHFV-only, private-land-only or archery-only. The hunt rows in step 4 must carry those restrictions rather than flatten them into "general: yes".
- The Restricted Areas GIS layers (2, 15) remain unused. They describe restricted areas, which is a different fact from where a general licence is valid.

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
3. District crosswalk from the GIS "all past years" layers → `data/mt/district-history.json`. **Not done.** Until it is, five-season harvest figures assume a district number means the same ground across 2016–2025, which is wrong for districts changed in the 2022 restructure.
4. **Done (#68), with a bug fixed 2026-11-11.** Harvest loader with the §5 rules. The deer "4 or More Points" column key carried a leading space, so every deer trophy value read as 0. The CSV header is trimmed and the key wasn't. Fixed, and the builder now fails on any column name it can't find. The rebuilt `harvest.json` is identical apart from that column.
5. **Done (#74).** Regulations district-table parser (§2.4).
6. **Not needed for last-draw odds (#75).** Detailed draw reports parsed (§3.5) and the points column established (§3.4). A simulator is only needed for a projection.
7. **Built 2026-11-11, step 4.** `scripts/mt_build_hunts.py` → `data/mt/hunts.json`, and the app side (see §12).
8. **Built 2026-11-11.** `scripts/mt_build_land.py` → `data/mt/land.json` and the land fields on `data/mt/units.json` (§13). Run it before `mt_build_hunts.py`, which reads it.

Nothing in steps 1–7 writes to production. The import is `scripts/mt-import.ts`: state-scoped, dry run by default, and it aborts if any Idaho, Colorado or Wyoming summary changes. It applies only after a reviewed dry run and the owner's explicit yes, per AGENTS.md.

## 12. Montana hunts — what step 4 built (2026-11-11)

**535 deer and elk hunts.** Antelope waits, as the owner asked.

- **General licences: 139 deer and 130 elk,** one per district where the regulations print a General Deer or Elk License row. The nine drawing-only elk districts have none (250, 410, 455, 555, 620, 621, 622, 630, 700).
  - Residents buy over the counter.
  - Nonresidents get the combination draw's odds at 0–3 preference points, **as drawn**. The dead zone is kept: at 1 point the general elk odds are 0%, at 0 points 53.6%.
- **Drawn permits and B licences: 137 deer and 129 elk,** keyed by licence type + code.
  - `oddsByPts.last[pool][N]` is the odds for a hunter holding N bonus points who buys one, which is FWP's row N+1.
  - `oddsByPts.noBuy[pool]` is for a hunter who applies without buying.
  - Levels nobody applied at take the level below, and a running maximum removes small-sample dips, because more points can never lower a chance in a weighted draw.
  - 32 are valid in several districts. Region-wide licences expand to every district in the region.
- **Over-the-counter B licences are not hunts yet.** They're add-ons to a general licence, and the finder has no way to say so. Recorded as a follow-up.
- **Harvest** is FWP's district estimate for **all** hunters of that species, every licence type. It covers the last five *surveyed* seasons (deer odd years, elk even years). Every hunt carries `harvestBasis` saying so, and the hunt page repeats it.
  - The elk portions (391N/S etc.) are combined when the parent has no row.
  - Multi-district hunts sum their districts and say a hunter in several districts is counted in each.
- **Deer type** uses Idaho's rule: whitetail share of the same seasons' harvest, ≥ 60% whitetail and ≤ 40% mule deer.
- **Seasons:** each regulations row and season column becomes a `tagSeasons` entry, so the weapon, season, youth and antler filters work as they do in Idaho. "ArchEquip only" rows are archery throughout.
- **Flags:** 71 hunts are private-land-only (every row "Only valid on private land") and 6 are youth-only.
- **Public land: measured 2026-11-11 (§13).** Superseded the step-4 state, where `publicPct` was null and no Montana hunt had a Quality score.

**App:**

- **Search:** `src/lib/mtHunt.ts` gives `mtPersonal()`, the odds from your Account settings. The finder has Montana cards (`MtHuntCard`) and a **Montana: License Type** filter (`mtLic`, kept in saved presets). The shared private-land-only filter covers Montana.
- **Pages:**
  - The hunt page (`MtHuntPage`) shows:
    - your points against FWP's row;
    - the full ladder with the no-purchase row;
    - quotas by pool, with landowner pools reported separately;
    - seasons by district;
    - FWP's own contradictions where a licence has them;
    - the draw history;
    - harvest by surveyed season.
  - A district page (`MtUnitPage`) lists general licences, then permits and B licences.
- **Map:** shades by district, from Unit rows the import writes.
- **What disappears by itself after the import:** the Find Hunts notice and the home panel's "not yet" list follow whether Montana rows exist.


Nothing in steps 1–7 writes to production. The eventual import follows the Wyoming pattern: a state-scoped script, a reviewed dry run, and the owner's explicit yes, per AGENTS.md.

## 13. Public land — built 2026-11-11

`scripts/mt_build_land.py` measures land ownership in each of the 139 deer/elk districts.

- **Source:** BLM's national Surface Management Agency layer (`BLM_Natl_SMA_LimitedScale/MapServer/1`, `ADMIN_ST='MT'`), the same source as Colorado and Wyoming. Montana's own BLM service needs a token. The 43 features came back at full resolution in EPSG:5070. District outlines were fetched again at 10 m, because `units.json`'s ~100 m display outlines are too coarse for acreage. Both were saved from Chrome into `Downloads\huntapp`.
- **Method:** Wyoming's 100 m equal-area raster, with one fix. PIL's polygon fill includes every cell an edge touches. A 10×10-cell square fills 121 cells and a 4×4 square fills 25, so small parcels come out 20–60% too big. Montana's scattered 640-acre state sections would have been overstated (the first run gave 7.2% state land, against 6.7% once fixed). The Montana build fills a cell when its centre is inside the polygon, which has no such bias, and district areas then agree with the exact polygon areas within 1%.
- **Wyoming has the same bias,** in `wy_build_areas.py`. Its statewide checks passed, but areas with many small parcels are likely to overstate public land. **Not fixed:** it would change live Wyoming scores, so it needs its own reviewed change.
- **Classes:** public = BLM, Forest Service, NPS, FWS, Reclamation, Defense, other federal (Corps, USDA research land), state (trust land and FWP) and local government. Not public: private, tribal (BIA) and BLM's "undetermined" (0.4% of the districts, up to 2.7% in HD 170), which we don't guess at.
- **Checks (the build stops on any failure):**
  - every district's raster area is within 1% of its polygon area;
  - ownership covers at least 97% of every district (it covers 100%);
  - across all districts, federal land is 29–34% and state land 5.5–8%. The published statewide figures (~29% federal, ~6% state) cover all of Montana, while the districts leave out the reservations and Glacier and Yellowstone.
- **Expected vs built:** about 17.0M acres Forest Service + 8.0M BLM + 1.1M FWS ≈ 31% of the districts' 84.3M acres. Built: 31.5% federal (Forest Service 20.2%, BLM 9.6%) and 6.7% state. Drawing the parcels in reverse order gives the same shares to 0.01%, so the SMA parcels don't overlap.
- **Hunts:** a multi-district licence takes the acre-weighted share of its districts (Wyoming's rule). A private-land-only licence shows its districts' share, but **scores as 0% public**, as in Wyoming's import. With land in, all 535 Montana hunts get a Quality score.
- **Ownership is not access.** State trust land and Corps land have their own access rules, and landlocked public land still counts. Every page says so.


## 14. Antelope — built 2026-11-11

**96 antelope hunts:** 59 Antelope Licenses and 37 Antelope B Licenses, every one in the 2026 draw. Montana sells no general antelope license, and **a nonresident applies without a combination license** (owner-confirmed 2026-11-11; deer and elk permits still need one).

- **Districts:**
  - Antelope districts are not the deer/elk districts. Unit keys carry an "A" (`A320`; URL `/units/mt-A320`).
  - Region 7's licences are printed for "Portions of HDs 700, 701 and 703 North of the Yellowstone River" and "Portions of HDs 701–705 South".
    - Those are FWP's layer-4 portions plus whole districts: north `A700, A701N, A703N`; south `A701S, A702, A703S, A704, A705`.
    - Whole 701 and 703 are not imported as units.
  - The portions' display outlines come from an inverse EPSG:5070 projection (`to_lonlat` in `mt_build_land.py`). It matches FWP's own lon/lat outline of 701 to 0.0001°.
- **Public land:** the same raster and classes as deer/elk (§13), measured per antelope district and portion. Across districts: min 4.4%, median 27.6%, max 79.1%. The two portions of 701 and of 703 add up to their district within 1%.
- **Harvest and the 2022 redraw.** `data/mt/district-history.json` holds, for each 2026 antelope district and each regulation year 2014–2026, the overlap of that year's outline with today's. The source is FWP's "Antelope Hunting Districts All Past Years"; the overlap is intersection ÷ union on the 100 m raster. The 2026 entries all overlap 100%, which checks the method.
  - A surveyed season counts only if the district then overlapped today's by ≥ 98%. Season Y uses the latest regulation year ≤ Y, because FWP sets districts for two seasons.
  - Districts that overlap today's by ≥ 98%: 33 of 61 in 2014, 42 in 2020, 56 in 2022, 57 in 2024.
  - **Not only 2022:** HD 480 was redrawn again for 2026. Its overlap with every earlier outline is 37%, so it has no harvest at all, and nor does 485, which FWP has never estimated.
  - The archery licence 900-20 is valid in 33 areas, including 430 and 480. With the every-district rule it has no usable season, so it's unscored and says why. That's 5 unscored hunts in all.
  - Harvest is never apportioned by area.
  - FWP estimates 701 and 703 whole, so a Region 7 licence uses the whole districts' estimates and says so.
- **No trophy share.** FWP's antelope estimates count bucks and does, not horn size, so `bigPct5` is null rather than 0%. The hunt page shows the bucks' share of the harvest instead.
- **Found and fixed while building this:** 40 drawn deer/elk licences carried the **antelope** district's name. `district_name()` took the first regulations table with that number, which was sometimes the antelope one: Deer B 318-00 said "Big Hole" instead of "Butte-Basin". This fix changes only those names; no deer/elk score moves.
- **App:**
  - **Search:** the Montana: License Type filter gains "Antelope licenses". Antelope B licences sit under "B licenses".
  - **Map:** with Pronghorn picked, the map draws antelope districts.
  - **District pages:** they explain that there's no general licence and no combination licence.
  - **Hunt pages:** they show the stand-alone rule for nonresidents.

## 15. Mule deer vs whitetail, mule-buck permits, and nonresident odds — 2026-11-11

Asked by the owner, 2026-11-11.

- **Which deer a licence allows comes from its own regulation rows** ("Antlered Buck Mule Deer", "Either-sex White-tailed Deer"). It is stored as `pointOdds.deer`, and the hunt's `deerType` is that species when there's only one; otherwise Idaho's harvest-share rule applies. Ten general deer licences are whitetail only, HD 270 among them.
  - Filter: **Montana: Mule Deer Or Whitetail** (`mtDeer`). A licence allowing both counts as either.
- **Species success, general licences only.** A general licence for one species uses FWP's harvest of that species. FWP's species estimates carry the same hunter count as the all-deer estimate (HD 270, 2025: 1,968 hunters in all three), so the rate is "whitetail harvest per deer hunter". HD 270's general rate goes from 23.6% to 18.8%, because the mule bucks taken by permit holders no longer count for it.
  - **Not applied to drawn licences.** Their holders are a small subset of the district's hunters, so a species rate describes the district, not the licence. I tried it: a whitetail Deer B in mule deer country fell to about 5%, e.g. Deer B 262-00 from 49 to 5. Drawn licences keep the district's all-deer success, labelled.
- **Mule-buck permits where only a permit allows a mule buck** (16 districts, from the 2026 rows: no general or B row allows antlered mule deer in any season, and every such permit is single-district).
  - Success there = FWP's antlered mule deer harvest ÷ permits issued (all pools, all the district's mule-buck permits together).
  - It uses surveyed seasons 2021, 2023 and 2025, but only where every such permit was drawn that year and the district had today's boundary.
  - **A season whose estimate exceeds the permits issued is left out.** HD 270 does so every season (70, 72 and 62 mule bucks estimated against 60 permits), so it stays on the district rate, and so does HD 303's 300-50.
  - **Results, mule bucks per permit vs the old district rate:** 202-50 62% (was 36%), 291-50/51 83% (30%), 410-50 88% (39%, 2025 only, as 410 had no mule permit before then), 261-50 63% (34%), 262-51/52 45% (56%).
  - **Assumption:** the 2026 rule (permit-only mule bucks) held in each season used. A season only counts when the permit existed that year, but the older regulations aren't parsed.
- **Deer/elk district history.** `district-history.json` now has `deerElk`, from FWP's "Deer Elk and Mountain Lion Hunting Districts All Past Years". That layer holds every district twice per regulation year. The copies are identical except 7 in 2026, where the later copy (higher OBJECTID) matches the current layer, so the build keeps the latest.
  - Deer/elk harvest now uses the same ≥ 98% rule as antelope. Districts matching today's: 68 of 139 in 2014, 96 in 2020, 123 in 2022, 130 in 2024.
  - **Districts redrawn for 2026:** 652, 311, 320, 700, 622, 630, 123, 413 and 432. Their earlier seasons describe different ground, and their hunts lose that harvest.
  - **Effect on scores:**
    - 35 deer and elk hunts lose all harvest; 16 deer and 19 elk hunts lose their score.
    - 197 hunts have fewer seasons.
    - 120 deer and 88 elk scores change.
- **Nonresident odds include the combination draw.** Deer and elk permits need a combination licence, applied for together: deer permits need Big Game or Deer, elk permits need Big Game or Elk (2026 regulations p. 12).
  - A nonresident's chance of holding both = combination odds at their preference points × permit odds. A permit everyone drew at 0 points equals the combination draw at 0 points.
  - **Display (owner, 2026-11-11):** the draw odds shown on cards and hunt pages are the permit draw's alone, as if the combination is drawn. The combination draw's odds sit just beneath. Draw and fill, the Opportunity score and odds sorting use both.
  - Draw and fill uses the product.
  - FWP doesn't say how a permit drawn without a combination is handled, so the two draws are treated as independent.
  - **Account:** "Combination you apply for" — Big Game (deer and elk), Elk, or Deer. Big Game and Elk share FWP's Big Game / Elk drawing; Deer has its own odds. A licence the chosen combination doesn't cover shows 0%, with the reason.
  - **Changed default:** nonresident general deer odds now default to the Big Game draw. Before this they used the Deer Combination draw.

## 16. Block Management — built 2026-11-11

FWP's Block Management program is Montana's counterpart to Idaho's Access Yes!: landowners enrol private land and FWP
opens it to public hunting. The owner asked for it to be treated by permission type (Nov 11, 2026):

- **Type 1**: FWP: "Area where hunters administer their own permission" (sign-in box, roster, or none). Treated as
  public access with the BMA's own rules (vehicles usually on marked roads only, sometimes walk-in only; rules vary
  by BMA, so the copy never promises one rule). **Included** in "public + Block Management", the Quality score's
  access input, the map's combined shading and, by default, the filters.
- **Type 2**: FWP: "Area where someone other than the hunter issues permission" (landowner or FWP; often
  reservations, pasture assignments and hunter limits). **Never** added to public land or the score. Shown on its
  own on cards, hunt and district pages and the map; the filters count it only with "Also count Type 2" (`mtBma2=1`).

**Sources.**
- FWP `wild/hpNewBMA_MIL/MapServer`: layer 5 BMA boundaries with `PTYPE` 1/2 (946 features, 905 BMAs), layer 4 BMAs
  with access closed or restricted (1, left out), layer 3 restricted areas inside BMAs ("Not in BMA (No
  Trespassing)", safety zones and no-shooting areas are cut out: 113,147 acres; weapon and species restriction areas
  stay in). A BMA is `REGION-BMANUM`: numbers repeat across regions.
- FWP's 2026 Block Management guide (`2026-fwpblockmanegment-finalproof.pdf`) for **species**. The GIS has no
  species field, and BMAs differ: #3-132 is antelope only, #3-87 whitetail and birds, #3-143 allows only elk and
  antelope, #6-132 is upland birds only. Counting every BMA for every species would overstate elk access badly
  (855 of 892 BMAs list deer, only 273 elk). `scripts/mt_parse_bma_guide.browser.js` reads the sideways-printed
  tables (several county tables per page in Regions 6 and 7; a BMA crossing counties is listed in each).
  - 18 open BMAs on the map are not in the guide (late enrolments: 3-5, 4-80/84/87/89/90, 6-213/214/215/218/240/241/245,
    7-272/273/276/277/279). They count for **no** species: unknown is not "open to elk". This understates Type 2 in
    HD 701 by about half.
  - 8 guide rows list none of deer, elk, antelope (bird-only, #1-19 "Antlerless" with no species, #3-1 blank).

**Method.** `scripts/mt_build_bma.browser.js`, run in Chrome on an FWP tab (the shells can't reach FWP), on the grid
of `mt_build_land.py`: 100 m equal-area cells, centre-in-polygon. Public shares reproduce `land.json` within 0.1
point in all 204 districts. The acres added to public land are BMA cells that are **not already public** (BMAs
enrol state and federal parcels inside a ranch: 4.69M Type 1 acres, of which 3.93M are not public). A cell in both
types counts as Type 1. Results were read out of the tab and checked against an in-tab checksum, saved in
`data/mt/source/bma-2026-*.txt`, and built into `data/mt/bma.json` by `scripts/mt_build_bma.py`.

**Checks.**
- Statewide 6.81M acres of boundary (6.69M after cut-outs) against FWP's "almost 7 million acres" for 2026.
- Region 7: 244 BMAs, 1.95M acres against FWP's 245 and 1.99M (−2%).
- **Region 6 does not match:** 212 BMAs and 1.46M acres against FWP's printed 210 and 1.25M (+17%). Not
  explained; recorded in `bma.json` `regionCheck`.
- Same totals on two independent runs, in two tabs.

**Where it shows.**
- `HuntSummary.accessYesAcres / accessYesCount / accessYesPct / huntablePct` carry **Type 1 only**, for the hunt's
  species (`mt_build_hunts.py`, `mt-import.ts`). A private-land-only licence has 0% public, but Type 1 BMA ground is
  private land open by sign-in, so its huntable share is the Type 1 share.
- Score effect (dry run of `score.ts`): 268 of 591 scored hunts rise, median +1, largest +10 (Elk B 122-00); none fall.
- `src/lib/mtBma.ts` reads `bma.json` at render time for Type 2 and for the filters.
- Find Hunts: "Montana: Block Management" (`mtMinBma`, `mtMinHuntable`, `mtHasBma`, `mtBma2`); card line; hunt page
  and district page tables; finder map "Public + Block Mgmt Type 1 %".
- Map layers: FWP's live outlines (FWP's service answers this site's cross-site requests), Type 1 purple, Type 2
  teal dashed, cut-outs dark grey, popups linking FWP's PDF map for the BMA.

**Refresh each season**: re-run both browser scripts on the new guide and enrolment, then `mt_build_bma.py`,
`mt_build_hunts.py`, and the import as a reviewed dry run.

## 16. Over-the-counter B licences — built 2026-11-11

- **What they are.** Deer B and Elk B licences with an unlimited quota aren't drawn. FWP sells them from June 15 (2026 regulations p. 5 and p. 14: "those with UNL quotas are available for purchase over the counter").
- **25 of them:** 19 Deer B (all whitetail, antlerless or either-sex) and 6 Elk B. Every B code with no 2026 draw report is marked over the counter in its district tables, except Elk B 004-00 (§2.4: HD 417 misprints "Jun 1").
  - Deer B 395-01 is marked over the counter in HD 391 but drawn in HD 380. It has a draw report, so it stays a drawn licence, with the conflict recorded.
- **Hunt rows:** `type: GENERAL` (bought, not drawn, Idaho's meaning) and `pointOdds.kind: 'otc'`.
  - Odds are 100% for residents and nonresidents. No combination licence is needed, and points don't apply.
  - The licence-type filter lists them as B licences.
- **Fees as printed for 2026,** labelled with the year:
  - Deer B OTC: $10 resident (p. 10), $75 nonresident (p. 11);
  - Elk B OTC: $20 resident, $270 nonresident.
  - The conservation and base hunting licences come on top.
- **Success is the district's,** as for drawn B licences (§15).
- **Not modelled:** the three-deer-licence limit (one general + two B, or three B) is stated on the hunt page, not enforced. Nor are limited-quota B licences that could sell out over the counter, or surplus licences after the draw (FWP sells leftovers too; those aren't in the reports).
