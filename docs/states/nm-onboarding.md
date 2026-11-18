# New Mexico onboarding: deer and elk (NM-1)

Started Nov 17, 2026. Scope: every deer and elk hunt in NMDOW's 2026–27 public draw, the landowner-authorized private-land deer draws, and the over-the-counter private-land deer hunts. Not in scope: private-land elk (EPLUS landowner authorizations, not a draw), Youth Encouragement elk (sold first come), and pronghorn, bighorn, oryx, ibex, Barbary sheep and javelina (later).

## 1. Draw rules (checked Nov 17, 2026)

Sources: NMDOW "How New Mexico's Draw Works"; 2026–2027 Hunting Rules and Information (the booklet) pp. 15–19, 49–53.

- **A pure lottery, no points.** Each application gets a random sequence number. NMDOW examines applications in that order, one whole application at a time: 1st choice, then 2nd, then 3rd, each against its pool's share. A **4th choice** (deer and elk) is a separate later drawing for leftovers of the same weapon type, antlerless included.
- **Pools (NMSA 17-3-16(B)):** at least 84% of each hunt's licenses to residents, 10% to residents or nonresidents who apply with a New Mexico outfitter (signed contract), 6% to nonresidents without one. A resident in a party with nonresidents draws only if both pools have a license.
- **Nonresidents can't apply for antlerless elk, WMA draw hunts or resident-only hunts** (booklet p. 17; the 2027–28 fee sheet says the same). 136 of the 679 hunts.
- **Military-only hunts (McGregor Range) are not resident-only.** My first build excluded nonresidents from them; the draw reports show nonresident first choices every year (ELK-1-396: 42 in 2026). Fixed, and tested.
- **Hunt-code weapon digit:** 1 = any legal sporting arm, 2 = bow only, 3 = muzzleloader, crossbow or bow (booklet p. 49).
- **Youth-only hunts:** 17 or younger on opening day, with a Hunter Education or mentor-youth number (p. 19).
- **Fees:** the full license fee is charged with the application and refunded, less the application fee ($7 resident, $13 nonresident), if unsuccessful. The game-hunting license ($25 / $90), HMAV ($4) and habitat stamp ($10, Forest Service or BLM land) are not refunded. Nonresident deer $398 standard / $623 quality or high-demand; elk $773 / $998; antlerless elk resident only ($70). The 2027–28 Draw Hunt License Fees sheet lists the same license prices. `NM_FEES` in `src/lib/nmHunt.ts`.
- **2026 dates:** applications closed Mar 18, 2026, 5 pm MDT; results Apr 22, 2026. 2027 dates not posted yet.

**Corrections to the Architecture Guide's NM entry.** "Odds = Quota / Total Applicants" is wrong twice: it ignores the three pools, and because applications are processed whole in random order, a hunt can be gone to earlier applicants' 2nd and 3rd choices before a later 1st choice is looked at. The honest per-pool number is first-choice drawn ÷ first-choice applicants, which NMDOW publishes.

### In flight (Nov 2026)

- **New rules and new hunt codes for 2027–28.** The current deer and elk rules (19.31.13, 19.31.14 NMAC) run through March 31, 2027. NMDOW opened both rules in February 2026 and is renumbering every hunt (`summary-of-hunt-code-changes`: e.g. ELK-2-264 → ELK-15-B1-ES-PUB). The adopted 2027–31 tables were not in the NM Register or on NMDOW's site on Nov 17. **This build keeps the 2026–27 hunts.** When the 2027–28 booklet is out, map old codes to new ones (the proposed-rule records have old/new pairs) and carry the draw history across.
- **Outfitter pool.** Attorney General Opinion (Oct 9, 2026) concludes the 10% outfitter set-aside violates the anti-donation clause. Not binding; legislators plan to take it up in the January 2027 session. If the pools change before the 2027 deadline, the pool model and labels change.

## 2. Sources and how they were fetched

Neither shell reaches NMDOW, ArcGIS Online or BLM. Claude in Chrome on the owner's PC fetched everything same-origin and saved one bundle per tab to Downloads (folder access granted Nov 17):

| File | What | Build |
|---|---|---|
| `data/nm/source/complete-2019…2026.xlsx` | NMDOW Complete Drawing Odds reports | `scripts/nm_parse_draws.py` → `data/nm/draws.json` |
| `data/nm/source/rules-2026-27.txt` | booklet, `pdftotext -layout` | `scripts/nm_parse_rules.py` → `data/nm/rules-2026.json` |
| `data/nm/source/harvest/*.txt` | deer and elk harvest reports 2023–24 to 2025–26 | `scripts/nm_parse_harvest.py` → `data/nm/harvest.json` |
| `data/nm/source/gmu-areas-5070.json` | NMDOW's own ArcGIS Online: GMUs (70, updated Aug 31, 2026), Designated Areas (22), Open Gate (23) | `scripts/nm_build_land.py` → `data/nm/units.json`, `land.json` |
| owner's PC `Downloads\nm-gis-5070.json` (27 MB, not in repo) | BLM national SMA, 37 features intersecting NM | `scripts/nm_build_land.py` |

Then `scripts/nm_build_hunts.py` → `data/nm/hunts.json`, and `scripts/nm-import.ts` (dry run, then `--apply`).

BLM's own copy of the GMUs (`gis.blm.gov/nmarcgis/.../NMDGF_NM_Game_Management_Units`) needs a token; NMDOW's ArcGIS org (`CjbW1bVhK4dB3WOa`) doesn't.

## 3. Data checks

- **Draw reports:** 8 years, 640–660 deer/elk hunts a year. Column positions differ by year and are read from each year's own headers (2021 repeats the subheader without the pool row). Every row reconciles pool sums to NMDOW's totals except three, recorded in `draws.json.problems` and not "fixed": 2020 ELK-2-372 (a nonresident 1st-choice draw with 0 applicants) and 2024 DER-2-152 (issued-per-pool column disagrees with the choice columns).
- **What looked like per-pool quotas (2024+) are licenses issued per pool**: undersubscribed hunts show fewer than the hunt's licenses. NMDOW does not print pool quotas.
- **Booklet vs draw report:** all 646 hunts in both have identical license counts. The 29 elk codes only in the booklet are 28 Youth Encouragement licenses plus one (all sold, not drawn), left out. The 21 deer codes only in the draw report are the landowner private-land draws in Units 2A, 2B, 2C, 4 and 5A; their season dates come from the public hunt in the same GMU and weapon that ran the same 2025 dates (`datesFrom`; two fall back to the statewide season with those dates).
- **Harvest:** a deer code printed twice in a GMU block is the draw hunt, then the over-the-counter private-land license that reuses the draw code (booklet p. 52); the first row is the draw hunt's. Elk reports print no hunter count, so hunters = estimated harvest ÷ success. 7 rows with no data (1-license hunts and enhancement licenses) are skipped. 672 of 679 hunts have harvest.
- **Hunt codes were renumbered for 2023** (ELK-1-103 Unit 2 → ELK-1-132), so odds history uses 2023–2026 and harvest 2023–24 to 2025–26.
- **Land:** across the 70 GMUs, federal 33.9%, state 11.9%, tribal 10.7%, private 43.6% (published: federal ~34.7%, state trust ~11.6%, tribal ~10%). Every GMU's raster area is within 1% of its polygon, ownership covers ≥ 97% of every GMU. WMA-only hunts count 100% public (State Game Commission land); private-land-only hunts 0%.

## 4. Odds model and backtest

`scripts/nm_backtest.py` → `data/nm/backtest.json`. Brier per first-choice applicant, per pool, each year predicted only from earlier draws with the same hunt code (2020–2022 from 2019+, 2024–2026 from 2023+). In 2020 and 2024 there is only one earlier draw, so every method equals "last" there.

| Pool | Year | last | pool2 | pool3 | shrink |
|---|---|---|---|---|---|
| res | 2021 | 0.12523 | 0.12506 | 0.12506 | 0.12497 |
| res | 2022 | 0.12780 | 0.12757 | 0.12766 | 0.12760 |
| res | 2025 | 0.12334 | 0.12298 | 0.12298 | 0.12311 |
| res | **2026 (held out)** | 0.12195 | **0.12156** | 0.12154 | 0.12163 |
| nr | 2021 | 0.05158 | 0.05048 | 0.05048 | 0.05025 |
| nr | 2022 | 0.04420 | 0.04352 | 0.04382 | 0.04332 |
| nr | 2025 | 0.03712 | 0.03606 | 0.03606 | 0.03616 |
| nr | **2026 (held out)** | 0.03708 | 0.03645 | 0.03615 | **0.03636** |
| out | 2021 | 0.05413 | 0.05405 | 0.05405 | 0.05356 |
| out | 2022 | 0.04879 | 0.04786 | 0.04805 | 0.04762 |
| out | 2025 | 0.04812 | 0.04605 | 0.04605 | 0.04623 |
| out | **2026 (held out)** | 0.04903 | 0.04781 | 0.04729 | **0.04744** |

Rule fixed before 2026 was looked at: pick each pool's method on the sum of 2021, 2022 and 2025; ship it only if it beats "last" on 2026. Picked: residents **pool2** (last 2 draws pooled), nonresidents and outfitter **shrink** (last draw, weight a/(a+20), toward the pooled last 3). All three beat last on 2026. The gains are small (0.3–3%): with no points, a hunt's odds mostly repeat, and pooling only damps noise in small pools. pool3 happened to do slightly better on 2026 for every pool; that was not used, because it was not the pick.

Stored: `oddsByPts.{last,proj}.{res,nr,out} = [odds]`; `resOddsLast/nrOddsLast` (2026 draw), `resOdds5/nrOdds5` (estimate; nonresident fields null where nonresidents can't apply). Labels: "Next draw, estimated" by default, the 2026 draw one click away.

## 5. App

- `src/lib/nmSettings.ts`: residency and pool (`outfitter`), saved under `NM` in the points store. No point balances: New Mexico has none.
- `src/lib/nmHunt.ts`: odds for the hunter's pool, eligibility, license kind, fees.
- Find Hunts: `NmHuntCard`, the "New Mexico Filters" group (`NmSearchFilters`: hunt type `nmLic`, deer species `nmDeer`, license price `nmFee`, special hunts `nmWho`). Hunts nonresidents can't apply for are hidden for nonresidents; mobility-impaired and military-only hunts show only when picked; private-land hunts follow the shared private-land filter.
- Hunt page (`NmHuntPage`): odds for your pool and all three pools' 2026 first choices, odds and applicants by year, applications by choice, success and harvest charts, costs, land bar, season.
- GMU page (`NmUnitPage`), Unit Map (controlled metrics only; no general seasons), How The Draw Works, What Changed, Planner (`NmPages.tsx`), header links, account section.

## 6. Status

- Code merged in #222 (Nov 18, 2026).
- **Imported Nov 18, 2026, 07:42 PT**, gated on the dry run (commit 4fd7fc7: 0 live, 679 added, 0 removed, 0 changed, 70 GMUs, digest `c1adca14c12d9850`): 679 hunts, 70 GMUs, 509 scored, other states unchanged; the re-run showed 679 live and nothing left to change. Maintenance service back to idle. Start command: `sh -c 'npx tsx scripts/nm-import.ts > /tmp/dry.txt 2>&1; grep -qF "\"planDigest\":\"c1adca14c12d9850\"" /tmp/dry.txt && grep -qF "\"live\":0,\"liveUnits\":0,\"added\":679,\"removed\":0,\"changed\":0" /tmp/dry.txt && npx tsx scripts/nm-import.ts --apply ...'`.
- Enabled in the follow-up PR.
- **Open:** map the 2027–28 hunt codes when NMDOW publishes the new booklet; pronghorn, oryx, ibex, bighorn, Barbary sheep and javelina; Open Gate as a scored access program (23 properties, 5 with deer); the outfitter pool after the 2027 legislative session.
