# New Mexico onboarding: deer and elk

Started Nov 17, 2026. Scope: public-draw deer and elk hunts (2026–27 rules), the way Idaho controlled hunts work. Private-land elk sold through EPLUS landowner authorizations are not draw hunts and are out of scope.

## 1. Draw rules (checked Nov 17, 2026, NMDOW "How New Mexico's Draw Works")

- **Pure lottery, no points of any kind.** Every application gets a random sequence number. Applications are examined in order, one whole application at a time.
- **Three choices**, tried in order: 1st, then 2nd, then 3rd, each subject to the pool quota. A **4th choice** (deer and elk only) is a separate later drawing for any leftover license of the same weapon type, including antlerless, and only for applicants who opt in.
- **Pools (NMSA 17-3-16(B)):** a minimum of 84% to residents, 10% to residents or nonresidents contracted with a New Mexico outfitter, 6% to nonresidents without an outfitter. A resident applying with nonresidents draws only if both pools have a license.
- Consequence for odds: because a whole application is processed at its sequence number, a later application's 1st choice can already be gone to an earlier application's 2nd or 3rd choice. First-choice drawn ÷ first-choice applicants per pool is the published, honest last-draw figure; NMDOW itself says no formula gives exact odds.
- **In flight:** Attorney General Opinion 2026-12 (Oct 9, 2026) concludes the 10% outfitter set-aside violates the anti-donation clause. It is not binding; outfitters oppose it, and legislators plan to strike the set-aside in the January 2027 session. If it passes before the March 2027 deadline, the pools for the 2027–28 draw change and any NM projection must say so.

## 2. Sources

- Complete drawing-odds reports (Excel), 2019–2026: `wildlife.dgf.nm.gov/hunting/applications-and-draw-information/how-new-mexico-draw-works/download/<year>-…-complete-report/`. Pre-draw applicants by choice and pool; post-draw successes by choice and pool. Summary reports exist for 2020 and 2023–2026.
- 2026 dates: application deadline Mar 18, 2026, 5 pm MDT; results Apr 22, 2026.

## 3. Access

- Workspace shell: proxy refuses wildlife.dgf.nm.gov and www.wildlife.state.nm.us.
- Claude in Chrome on the owner's PC reads NMDOW and fetches the Excel files same-origin. The eight complete reports were saved to the owner's Downloads as `nm-complete-odds-2019-2026.json` ({year: {ct, b64}}).
- Folder access to Downloads was refused by the session's approval check on Nov 17, so the files have not reached the workspace yet.
