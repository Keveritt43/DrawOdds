# Colorado UAT and product recommendations — 2026-11-05

## Release status

Released to production on 2026-11-06. Live application commit: c4fd7fef92ebd13387ac46bdd8b284141fe01ff6, deployment ebb365ad-85ed-42b2-92a1-8bb2dba28563 (SUCCESS). Health endpoint returns 200 with ok:true. PR #10 remains open and unmerged: https://github.com/Keveritt43/DrawOdds/pull/10 . Railway web now follows the checked codex/co-hunt-graphs source with an explicit commit pin. Sync remains disabled; web startup runs Next.js directly with no pre-deploy schema command.

The initial staged-deploy connector action was cancelled twice despite chat approval. The owner clicked Deploy in Railway. That deployment used the previous main commit (941d467), despite source configuration displaying the requested eb4383a pin. Deployment metadata and the old live UI exposed the mismatch. Reconnecting the web source directly to the checked feature branch deployed eb4383a correctly. Live UAT then found a reset-query issue; c4fd7fe fixes it and is now live. This history explains why a green deployment status alone was insufficient proof of release.

## Test method and results

An expert-Idaho-user walkthrough was performed against the optimized production build locally, backed by an isolated, read-only copy of the saved Colorado post-repair report/summary snapshot and the public unit geometries. The fixture is confined to ignored out/ and is not part of the application or release. This is pre-deployment UI validation, not a substitute for production UAT or a test of real account persistence.

Observed and exercised:

- Colorado state selection and its state-specific navigation, points/residency controls, finder, hunt detail and unit map.
- Hunt chart renderer, actual/projected controls and resident/youth pool controls. At 900px the four charts form two columns; at 390px they stack. The hunters/harvest plot uses the exact Idaho bar component and colors. The actual point chart leaves unreported levels blank.
- Draw History and Odds At Every Point Level precede Deer Population in DOM and visible section order.
- Quality/Opportunity badges and four component bars, with unsupported Trophy blank. Scores agree with the shared Idaho calculation. Personalized Opportunity changes with draw odds; Quality is independent of draw odds.
- Any/Has OTC elk/No OTC elk controls change the URL and result set. The initial saved fixture had 522 antlered deer results, including 179 known positive overlaps. Missing/unverified dates now remain unknown and are excluded from both explicit overlap choices.
- Hunt card background is rgb(255,255,255); the three stat panels are rgb(233,238,228), the existing Idaho scheme.
- Colorado unit numbers visibly render on the map. Quality shading shows colors for scored units and gray for missing evidence. Controlled-map choices include Quality, success, density, points, creep, and point-personalized draw/draw-and-fill.
- Typecheck and optimized build pass. 113 tests pass, one existing test is skipped. New tests cover scoring parity, invalid/missing/small samples, private-only access, personalized Opportunity, unknown OTC dates and reversed/cross-year dates.

## Findings fixed during the walkthrough

1. Colorado's separate tiny SVG charts and different breakpoints: replaced with shared Idaho Recharts frames/components.
2. Hunters/harvest line chart: replaced with the exact Idaho grouped bar chart.
3. Missing score breakdown: added shared Quality/Opportunity presentation and input gates.
4. Gray hunt card body: changed to the Idaho white card with existing tinted stat panels.
5. One-sided OTC overlap checkbox: added mutually exclusive Any/Has/No choices and removable filter chips.
6. Idaho elk-zone preference hid Colorado unit numbers: prevent restoration in states without elk zones.
7. Multi-unit detail links flowed into separate grid rows: group them into one facts cell.
8. The “You” chart label overlapped the odds axis at zero points: retain the dashed marker and move its explanation into the caption.
9. Colorado's longer mobile brand pushed search/menu off screen: wrap Colorado's mobile header controls; Idaho's header layout is unchanged.
10. Missing/reversed dates could look like a confirmed absence of OTC overlap: add a three-state overlap result and exclude unknowns from explicit choices. Invalid date displays now request CPW verification; valid cross-year ranges name both years.
11. Comparison still used persisted Colorado score blanks and aggregate draw-and-fill: derive Quality/Opportunity and draw-and-fill at saved points.
12. Standalone map odds could have suggested Idaho-style aggregate probabilities: use Colorado saved species points and youth pool, with private/no-store responses and cache keys that change when points change.

## Ten remaining issues or missing areas

1. **Map explanatory copy:** the Quality legend still appends generic residency/odds wording and a relative-scale sentence, even though Quality uses fixed benchmarks. The displayed score values and fixed class breaks are correct; the explanatory copy needs refinement.
2. **Trophy evidence:** no verified hunt-level antler-size series is loaded; Colorado cannot reproduce Idaho's trophy chart truthfully.
3. **Incomplete score coverage:** 460 of 2,038 rows in the saved snapshot fail evidence gates. Missing scores remain explicit.
4. **2028 modeling:** the future split preference/bonus draw requires a separate model; the current scenario must not be extended past its stated rules.
5. **Legal access:** surface ownership does not establish entry rights, huntability of state trust/park/military land, or access through private parcels.
6. **Local pressure:** multi-unit hunt totals and full-unit density cannot identify trailhead crowding or allocate OTC hunters to one unit.
7. **Historical comparability:** older unit/season harvest and newer exact-code harvest are different reporting bases; trends can reflect that change.
8. **Forecast calibration:** returning-cohort projections have not been prospectively calibrated against independent future draws.
9. **Unverified season dates:** some codes lack verified dates or contain reversed year boundaries. The UI flags them; source correction requires checking the applicable CPW record.
10. **Account workflow coverage:** authenticated saving, cross-device points and real account persistence were not verified in the isolated snapshot UAT.

## Ten Colorado improvements

1. Show a compact evidence badge with sample size, harvest basis, land coverage and last source year beside every score.
2. Build a clearly separate 2028 split-draw simulator with CPW rule references and scenario comparisons.
3. Add Quality/Opportunity range filters, alongside the new sorting options.
4. Add Opportunity, point-needed and point-creep shading to the finder map as well as the standalone unit map.
5. Make a paired deer/elk planner that checks actual dates, overlapping units, residency, method and license eligibility together.
6. Convert herd population plots to the same interactive chart system, while retaining missing-year gaps and herd-wide labeling.
7. Add a decision worksheet comparing points spent, draw chance, harvest evidence, access and expected trip cost.
8. Improve mobile comparisons with pinned hunt names and a switch between differences and all metrics.
9. Link point-chart selection to the odds-table row, with keyboard access and explicit applicant counts.
10. Add an in-product data-correction flow that captures the exact hunt, year, field and agency source, with an auditable resolution history.

## Ten traffic and user-growth opportunities

GOHUNT already offers filtering, draw odds, unit research and point tracking; those features alone are not a credible differentiator. Its own descriptions: https://www.gohunt.com/learn/join-gohunt and https://www.gohunt.com/browse/tips-and-tricks/insider/point-tracker-insider-feature-and-why-it-should-be-your-first-step-in-researching-hunts . The following are proposals, not claims that competing products lack them.

1. Offer a useful free “What can I hunt with my points?” entry flow, with immediate results before account creation; measure completion and saved-hunt conversion.
2. Publish useful, indexable hunt pages with original explanations, sourced charts, provenance and alternatives; measure non-brand search visits rather than page count.
3. Create point-creep explainers and calculators that answer specific planning questions and link directly to matching hunts.
4. Build a trustworthy 2028 Colorado transition guide and separate simulator around CPW's published split-draw change; source: https://cpw.state.co.us/sites/default/files/dam/xpj1vx0mkp/websitefinaldrawchanges.pdf .
5. Make guest-accessible shareable shortlists and comparison links so hunting partners can discuss the same evidence; measure invitation-to-use conversion.
6. Lead with sourced “Easier to draw, just as good” examples, explaining tradeoffs instead of only highlighting high-demand trophy units.
7. Offer opt-in, meaningful change summaries for saved hunts: quota, dates, point cutoffs and corrected data. Keep agency sync disabled unless separately authorized; any approved recurring synchronization must be no more than weekly.
8. Partner with educators and creators on reproducible hunt-selection walkthroughs with disclosed relationships and source links.
9. Work with local clubs and conservation groups on public learning sessions and feedback-driven unit research, without publishing sensitive hunting locations.
10. Compete on fast mobile pages, transparent score math, visible uncertainty and an auditable correction record; measure return use, time to shortlist and trust feedback.

**Recommended positioning:** “Know why a hunt fits your points—and see the evidence.” Focus on explainable alternatives, honest uncertainty, actual season overlap and a familiar cross-state research experience. These are product directions to validate with hunters, not a promise of superiority over competitors.

## Production walkthrough — 2026-11-06

Verified on the live site after the correct release:

- Colorado DM025O2R displays Quality 39 and the shared breakdown. Actual/projection controls change selected draw and Opportunity; resident/youth pool controls update the graph caption. All four Recharts plots render, including 14 hunter/harvest bars across seven survey years.
- At 900px there are two chart columns; at 390px one column, with search/menu inside the viewport. Unit links share a single facts cell. Draw History and point-level odds precede population.
- Hunt cards have white bodies and the existing Idaho sage stat panels. Quality sorting produces descending scores while retaining the overlap filter.
- Default antlered-deer finder: 522 results. Has OTC elk: 179; No OTC elk: 211. Other hunts have insufficient date evidence and are excluded from explicit overlap choices. The first change after reset now retains the correct URL, selected radio and results.
- Colorado map exposes Quality, points, creep, success, density, personalized odds and draw-and-fill; unit numbers are visible. Quality legend distinguishes scored units from missing evidence. Its remaining generic explanatory wording is listed above.
- DM006O3R at the existing eight nonresident deer points presents three linked alternatives with better projected odds and at least 80% of baseline harvest success. No-alternative and insufficient-evidence states also have explicit explanations.
- Idaho deer hunt 1042 retains Quality 80, Opportunity 22 and its existing charts/navigation. State was restored to Colorado; eight deer/eight elk points were preserved, and test filters were reset afterward.
- No new browser errors were logged after the correct rollout. Earlier React hydration errors occurred during the old-release/deployment transition and were not reproduced on the final release. Browser screenshot capture repeatedly timed out during this live walkthrough; the local screenshot artifacts remain labeled local.
- Final code CI run 42233347382 passed typecheck, tests, build and state/filter smoke tests. Locally, 113 tests passed with one existing database test skipped. Final Railway deployment is healthy, with no pending staged changes. The sync service still has no cron and a no-op start command.

Additional finding fixed in production: Colorado filter and sort links now discard the transient reset flag before changing the query. This fixes the first-filter-after-reset state mismatch without changing Idaho's filter implementation.

Authenticated saving, cross-device persistence, user-specific plans and real account mutations were not tested; the signed-out save gate was present. No production database writes, schema operations or agency synchronization were performed by this release workflow.
