# Arizona onboarding: research starting point

Use this worksheet with the reusable [state-onboarding checklist](../state-onboarding-checklist.md). This is a preliminary inventory, not a completed integration or permission to import production data. Reverify current agency rules, report coverage, access terms and available years for each release; record evidence and unresolved gaps.

## Agency sources

- [Survey, harvest and draw odds data](https://www.azgfd.com/hunting/hunt-draw-and-licenses/harvest-reporting/): inventory species-specific harvest summaries, survey data, drawing odds and historical Hunt Arizona books by year and report format. AZGFD says newer data are published as individual summaries rather than a consolidated book; verify actual coverage and granularity.
- [Bonus point process and reports](https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/bonus-point-process/) and [draw process](https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/draw-process/): research bonus, first/second-choice and later-choice passes, residency, permits, quotas, party rules and point categories. Verify the current regulations and report definitions for each species and year.
- [Where to hunt](https://www.azgfd.com/hunting/where-to-hunt/): locate GMU maps and legal boundary descriptions. Investigate authoritative spatial data, hunt-specific boundaries, access terms, attribution, publication dates and changes over time.
- [Hunting regulations](https://www.azgfd.com/hunting/regulations/) and [big game draw](https://www.azgfd.com/hunting/hunt-draw-and-licenses/big-game-draw/): verify season dates, eligibility, license prerequisites, fees, hunt restrictions and application rules. Record applicable years and incomplete costs before presenting totals.

## Arizona-specific work to verify

- [ ] Inventory actual deer, elk, pronghorn and bighorn sheep opportunities, species/subspecies and report coverage by year and hunt type. Verify any other proposed species before displaying them; source availability does not mean completed app support.
- [ ] Build and test an Arizona-specific odds adapter against current agency rules and representative reports. AZGFD describes application and bonus-point random numbers, multiple passes and group-point treatment; verify applicable quotas, resident/nonresident limits, choices and rounding rather than applying a single universal formula or assuming a split for every hunt. Distinguish published results from modeled estimates and projections.
- [ ] Reconcile hunt numbers, GMUs, seasons and report populations across harvest and draw datasets, including boundary changes. Preserve source estimates and survey limitations; never duplicate broad-area counts into units or treat missing observations as zero.
- [ ] Validate harvest, hunter density, land access and species-specific Quality inputs. Keep unsupported metrics and scores unknown, and distinguish ownership from legal access.
- [ ] Complete the shared checklist for state-qualified database identity, residency and points, shared and Arizona-only filters, maps, cards, details, both UAT personas, performance and protected rollout. Record evidence and unresolved gaps before enabling Arizona.

## Findings, Nov 17, 2026 (Claude)

### Draw rules (AZGFD "Draw Process" and "Bonus Point Process" pages, read Nov 17, 2026)

- **Three passes per draw:** (1) 20% bonus point pass, (2) 1st/2nd choice pass, (3) 3rd/4th/5th choice pass. Each pass assigns fresh random numbers.
- **Random numbers:** one per application plus one per *group bonus point* (genus points + loyalty point + hunter education point, averaged over a group of 2-4 and rounded half up). The **lowest** number is used.
  - Consequence (to verify against the reports, not assume): taking the minimum of k uniform numbers and sorting ascending is exactly a weighted draw without replacement with weight k (−ln(1−U) is Exp(1); the minimum of k is Exp(k)). So the random passes should behave as a lottery with **points + 1 entries**, like Utah's random half. The attached guide's `1 − (1 − N/T)^quota` is not used.
- **Bonus pass:** up to 20% of each deer/elk hunt's permits. Applications sorted by group bonus points (descending), then random number; 1st then 2nd choice checked. Zero-point applications are excluded. Unissued bonus-pass permits return to the hunt. The **10% nonresident cap still applies** in this pass.
- **1st/2nd choice pass:** unsuccessful applications in pure random-number order (weighted as above), checking choice 1 then choice 2. A 2nd-choice applicant can take a permit before a 1st-choice applicant with a worse number, so a hunt's odds depend on its 2nd-choice demand too.
- **3rd–5th pass:** same, for choices 3-5 on what is left.
- **Group rule:** permits must exist for every member (and within the NR cap) or the application is skipped.
- **Points:** unsuccessful valid applicants gain a point per species; successful ones lose that species' points (loyalty and hunter-ed points are separate).

### Reports (all on the bonus-point page, hosted on `azgfd-live-portal-wordpress-pantheon.s3.us-west-2.amazonaws.com`)

- Per draw (Fall = deer; Midwinter = elk and pronghorn) and year: **Bonus Point Report**, Draw Report Bonus Pass, Draw Report 1-2 Pass, Draw Report 3-4-5 Pass, Individual Bonus Point Report. 2016-2026 listed; 2016-2021 bonus reports are "by genus"/"by hunt number".
- **Bonus Point Report** (2026 F, 138 pages): per hunt number × group bonus points: 1st-choice, 2nd-choice and 1st+2nd applicants (total/resident/nonresident), permits issued in the bonus pass, and permits issued bonus + 1-2 pass, by residency. This is the point-level table the odds model needs.
- **Draw Report 1-2 Pass** (2026 F, 81 pages): per hunt and residency: authorized permits, permits available to the pass, 1st/2nd/1st+2nd applicants, drawn by choice, permits issued in the pass, grand total issued, unissued.

### Data built (Nov 18, 2026)

All AZGFD PDFs were fetched in Claude in Chrome from AZGFD's S3 host (the owner approved the downloads and the connected
`Downloads` folder in chat on Nov 18) and are kept on the owner's PC in `Downloads\huntapp\az` (130 MB, not in the repo).

| File | From | Notes |
|---|---|---|
| `data/az/draws.json` | Bonus Point Reports + Bonus Pass / 1-2 Pass reports (`scripts/az_parse_draws.py`) | deer 2022-2026, elk 2021-2026; ~210-250 hunts a year. The 2021 deer reports are scanned images (left out). 2022 Total columns count applications, not people, so only the Res/NonRes columns are used. 2023 elk over-issues by 1-2 permits in 5 hunts (AZGFD's own figures). Pass reports read by word position (`az_parse_pass.py`): pdftotext drops blank cells. |
| `data/az/source/odds-ids-2021-2025.json` | yearly Draw Odds PDFs (`az_parse_odds.py`) | unit, method, dates, legal animal per hunt number per year |
| `data/az/source/regs-*-2026.json` | 2026-27 regulations (deer) and 2026 Pronghorn and Elk regulations (`az_parse_regs.py`) | tables read by word position; two tables can share a page; named elk hunt areas keyed by their footnote |
| `data/az/crosswalk.json` | `az_crosswalk.py` | **AZGFD renumbers hunts every year** (5A/5B general deer: 1007 in 2025, 1006 in 2026). Hunts are matched by method, units, legal animal and season order. 2026 vs 2025: 198/209 deer and 186/192 elk matched; the rest are new or split hunts. |
| `data/az/harvest.json` | draw-hunt harvest summaries (`az_build_harvest.py`) | deer 2021-2025, elk 2021 and 2023-2025 (2022 elk is on AZGFD's old Pantheon host, not fetched). AZGFD's total can exceed the printed parts (species or sex not reported). |
| `data/az/land.json`, `units.json` | AZGFD GMUs (ArcGIS org os1CphwIyxBDDUGn, 80 polygons, 76 named) x BLM national SMA (`az_build_land.py`) | statewide 42.0% federal, 12.7% state trust, 27.8% tribal, matching published figures. Hunt areas like 5B North and 12A West are portions of a GMU and take the whole GMU's land and area. |
| `data/az/hunts.json` | `az_build_hunts.py` | 401 hunts (209 deer, 192 elk), 391 with harvest history. Tribal (18xx/38xx) and Camp Navajo (19xx/39xx) hunts are left out (printed "----"). CHAMP hunts are `restricted`. |

### Model checks

- **Weighting** (`scripts/az_weight_test.py`, 4,280 hunt-residency pools 2021-2026, per-level permits in the 1-2 pass):
  log-likelihood P+1 -392,824; (P+1)² -406,469; P²+1 -409,181; flat -418,337; 2^P -447,548. AZGFD's stated rule
  (points + 1 random numbers, lowest kept) wins.
- **Reproduce 2026** (`scripts/az_check.py`): fitted per hunt and residency to AZGFD's first-choice draw counts, then
  predicting permits by point band (both choices) against the Bonus Point Report: deer res 0 pts 2,381 vs 2,536, 1-2 pts
  17,730 vs 18,059, 3-5 9,614 vs 9,195, 6-10 1,525 vs 1,479; elk res 6-10 4,389 vs 4,257, 11-15 652 vs 653; nonresident
  bands within ~10%.
- **Projection** (`scripts/az_backtest.py` -> `data/az/backtest.json`; expected Brier over first-choice applicants,
  each year predicted from the year before): the roll-forward lost to repeating the last draw everywhere except
  nonresident deer 2023 and 2024, and it lost on the 2026 holdout in every species and pool (deer res 0.1351 vs 0.1293,
  nr 0.0415 vs 0.0379; elk res 0.0928 vs 0.0898, nr 0.0301 vs 0.0268). **No projection ships**; pages show the 2026
  draw, labelled.

### Fees and dates (2026-27 Arizona Hunting Regulations, 2026 Pronghorn and Elk Regulations; checked Nov 18, 2026)

License (combination hunt and fish) resident $57, nonresident $160, youth $5. Application fee per species $13 resident,
$15 nonresident (bonus point only: the same). Permit-tags including the application fee: deer $58 / $315, elk $148 / $665
(youth-only hunts carry a different price). The tag is charged at the draw, only if drawn. 2026 deadlines: elk Feb 3
(mailed by Apr 1), deer June 2 (mailed by July 24). 2027 dates not posted on Nov 18 (draw site: elk opens in January).

### Open

- 2027 hunt lists (elk in January, deer in spring): a new import maps the new numbers through the crosswalk.
- Over-the-counter archery deer and the elk nonpermit-tag units (AZGFD's OTC options) are not built.
- 2022 elk harvest summary (old host); 2021 deer draw reports are scanned images.
- Hunt-area polygons (5B North, 12A West, named elk areas) are not in AZGFD's GMU layer; those hunts use the whole GMU.
- Choices 3-5 are not modelled (odds are for a first choice).

### Access

- The workspace shell gets a proxy refusal for www.azgfd.com and the S3 host.
- Claude in Chrome opens both, and Chrome's PDF viewer shows the reports, but it exposes no text. Getting the tables out needs pdf.js in a tab (the route used for MT/UT/WA) and a connected folder to carry files back; both were refused by the session's approval check on Nov 17; the owner approved them in chat on Nov 18.
