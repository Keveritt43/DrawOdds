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

### Access

- The workspace shell gets a proxy refusal for www.azgfd.com and the S3 host.
- Claude in Chrome opens both, and Chrome's PDF viewer shows the reports, but it exposes no text. Getting the tables out needs pdf.js in a tab (the route used for MT/UT/WA) and a connected folder to carry files back; both were refused by the session's approval check on Nov 17 until the owner approves in chat.
