# Oregon onboarding (OR-1: deer and elk)

Status (Nov 18, 2026): data built and checked, app wired, import pending. Built by `scripts/or_*.py` and imported by
`scripts/or-import.ts`. `STATES.OR.enabled` is switched on after the import is applied and verified.

## 1. Sources

All fetched with Claude in Chrome on Nov 17, 2026 (neither shell can reach myodfw.com, dfw.state.or.us or
nrimp.dfw.state.or.us) and saved through the owner's `Downloads` folder.

| What | Where | Used for |
|---|---|---|
| Controlled hunt draw reports 2021-2026 (Buck Deer, Antlerless Deer, Elk; "Preference Point Draw Report", 2021 "Point Summary Report") | https://myodfw.com/articles/point-summary-reports (Excel) | odds, demand, backtest |
| Applicants by Hunt Choice 2021-2026 | same page | choice counts (kept, not used yet). ODFW's 2024 buck workbook has no readable sheet. ODFW posted no 2022 antlerless report. |
| 2026 Oregon Big Game Hunting Regulations | https://myodfw.com/sites/default/files/2025-11/26_BG_regs.pdf | hunt tables (bag, dates, tags, "*"), boundary descriptions (public %, private-only), general seasons, fees, dates, draw rules |
| Harvest summaries 2021-2025 (buck deer by weapon, antlerless deer, elk by weapon) | https://myodfw.com/articles/big-game-hunting-harvest-statistics (2025) and the dfw.state.or.us `controlled_hunts/docs/hunts_summary_reports/<year>/` files it links | success, hunters, antler classes |
| Wildlife management units | `nrimp.dfw.state.or.us/arcgis/rest/services/ODFW_Admin/WildlifeManagementUnits/FeatureServer/0` | units, map |
| Eastern Oregon deer hunt areas (new 2026) | `.../ORHAM/ODFW_Eastern_Oregon_Deer_Hunt_Areas/FeatureServer/0` (43 areas) | Eastern buck deer hunt units |
| Access & Habitat areas | `.../ORHAM/Access_and_Habitat_Areas/FeatureServer/0` | the Access Yes slot (measured, not scored) |
| Land ownership | BLM `BLM_Natl_SMA_LimitedScale/MapServer/1` | public land |

Parsed, reproducible inputs are in `data/or/source/` (`draws-2021-2026.json`, `harvest-2021-2025.json`). The raw
files are on the owner's PC (`Downloads\or-odfw-bundle1.zip`, `or-harvest-2020-2024.zip`, `or-gis-5070.json`).

## 2. The draw rule, checked against ODFW's own numbers

ODFW's 2026 regulations: each application gets one seven-digit random number; for each hunt 75% of the tags go to
first-choice applicants with the most preference points, the other 25% at random among all first-choice applicants;
leftovers go to second choices and so on, without points. Nonresidents may draw at most 5% of deer and elk tags.

What the reports show (`scripts/or_backtest.py`, 2021-2026):

- **The 75% is of the tags actually drawn, not the printed tag number.** `round(0.75 x drawn)` equals the
  report's preference-phase count in about 95% of hunt-years (`ceil` and `floor` do worse; the printed tags fit
  worse still because landowner preference and guide/outfitter tags come out first). The misses are almost all
  hunts where nonresidents with points stood undrawn: the nonresident maximum.
- **0 points never draw in the preference phase**: 0 cases in six years.
- **The random phase uses the same random number.** The reports print the points held by random-phase winners
  (`Total Points Drawn P2`). If the random phase were a fresh lottery among everyone left, those winners would hold
  far more points than ODFW prints (about 45% more in 2025-2026). With one number per application, applicants who
  lost the tie at the cutoff hold the worst numbers at their level, so they rarely win the random phase. Modelled
  that way (`scripts/or_odds.py`: a level drew u < s in the preference phase and everyone left with u < t in the
  random phase, so its odds are max(s, t)), the model's random-phase points against ODFW's:
  2025 buck 3,138 vs 2,876 (+9%), elk 3,270 vs 3,033 (+8%); 2026 buck 2,876 vs 2,691 (+7%), elk 3,245 vs 3,242
  (0%); antlerless within 3% in every year. Drawn totals per pool are reproduced within 0.1% every year.
  **Correction:** the first message to the owner (Nov 18) said "within 1-6%"; that was an earlier, simpler version
  of the calculation. The figures above are the shipped model's.
- 2021-2024 reports fit worse (the model's random-phase points are 20-35% under ODFW's). Their point columns
  are party averages and don't add up to ODFW's own point totals, so those years can't separate the two readings;
  the rule is the one the 2026 regulations state, and it fits the two years whose columns do add up.
- ODFW's own slips, kept as printed and listed in `scripts/or_parse_draws.py`: buck hunt 158 (2021-2024) has
  point rows summing past its applicants (skipped); 2022 elk 256A and 2021 elk 273A drop a level; 2026 antlerless
  615 prints 0 nonresident applicants above rows holding 51.

Per pool, `t` is solved so the random phase hands out exactly the tags ODFW reports for that residency, which
also carries the nonresident maximum.

## 3. Projection backtest

Each target year predicted from the year before only (same hunt number), Brier score weighted by applicants, truth
= the model fitted to that year's own report. Methods: `last` (last year's odds), `roll` (cohort roll-forward:
losers +1 point at return share r) and `shift` (points creep c a year). Rule, fixed before 2025-2026 were looked at:
pick the method on 2022-2024, ship only if it also beats `last` on 2025-2026 and over all years, per series and
residency.

| Pool | Pick | 2022-24 last / pick | 2025-26 last / pick | Ships |
|---|---|---|---|---|
| buck, resident | shift 0.25 | 0.0836 / 0.0842 | 0.0763 / 0.0765 | no |
| buck, nonresident | shift 0.25 | 0.0718 / 0.0681 | 0.0749 / 0.0709 | **yes** |
| antlerless, resident | roll 1.0 | 0.0779 / 0.0789 | 0.0818 / 0.0856 | no |
| antlerless, nonresident | shift 0.25 | 0.0911 / 0.0913 | 0.0990 / 0.0976 | no |
| elk, resident | shift 0.25 | 0.0733 / 0.0741 | 0.0710 / 0.0715 | no |
| elk, nonresident | shift 0.25 | 0.0848 / 0.0803 | 0.0844 / 0.0769 | **yes** |

Cohort roll-forward lost everywhere: Oregon hunters move between hunts within a series, so a hunt's losers aren't
next year's applicants. A 0.1 creep step was tried after seeing 2025-2026 and is **not** used (that would be
choosing on the held-out years). Everyone else sees the 2026 draw, labelled. 2027 tags aren't published yet, so
the projection uses 2026's.

## 4. Built data

- `data/or/regs-2026.json` (`scripts/or_parse_regs.py`): all 534 controlled 100/200/600 hunts in the 2026 draw
  reports found in the tables with matching tags, a bag limit and dates; 217 boundary descriptions (ODFW's printed
  public %, and "PRIVATE LANDS ONLY" / "0% public lands").
- `data/or/source/harvest-2021-2025.json` (`scripts/or_parse_harvest.py`): every zone total in every report
  reconciles with its rows (within 1%, ODFW rounds row by row). Some reports print a long hunt name over the
  numbers; the parser reads pdfplumber characters in content-stream order to separate them. A hunt spanning units
  has a row per unit; hunters are summed, so a hunter in two units counts twice.
- `data/or/units.json`, `land.json` (`scripts/or_build_land.py`): 67 WMUs + 43 deer hunt areas. Across the WMUs:
  federal 52.6% (BLM 25.7, USFS 25.6), state 2.8%, tribal 0.5% (published: ~53% federal, ~3% state). Each deer
  hunt area lists the WMUs holding >= 5% of it, for the map.
- `data/or/hunts.json` (`scripts/or_build_hunts.py`): 654 hunts: 534 controlled (161 buck, 72 antlerless, 301
  elk) and 120 general-season unit rows (Western Oregon rifle buck and archery deer; West Cascade, Coast 1st and
  2nd, Rocky Mountain spike, Western and Eastern archery elk), hand-coded from regulations pp. 33, 35, 45 and 49.
  - Units: the hunt-number unit (2xx/1xx/6xx -> WMU xx) or hunt area (`DO101` -> `DO-01`), plus any unit holding
    >= 3% of the hunt's reported hunters.
  - Harvest identity: a year counts only when that year's draw report has the hunt number under a matching name.
    Eastern Oregon buck hunts are new in 2026 and have no harvest yet (first report spring 2027).
  - Public land: units' measured share, or ODFW's printed share where the hunt is part of a unit (184 hunts).
  - Private-land-only (49): the boundary text says private lands only / 0% public, or (no description) the name
    ends in "Private". ODFW's "*" (private lands limit access, 226 hunts) is a flag and a filter, not private-only.

## 5. App

`src/lib/orHunt.ts`, `src/lib/orPoints.ts` (balances per series: buck 100, elk 200, antlerless 600), cards,
hunt and unit pages, Oregon filter group (hunt type, series, limited access, points needed), Unit Map branch
(WMUs; Access & Habitat in the Access Yes slot), account points, How The Draw Works / What Changed / Planner,
header links. `tests/oregon.test.ts`.

## 6. Open

- Premium hunts (L/M series, random, no points), pronghorn, sheep, goat: not built.
- Choices after the first aren't modelled (odds assume a first choice).
- Deer hunt area unit pages show the WMU map (the map draws WMUs only).
- Outfitter tag set-aside and landowner preference tags aren't separated; the model works on tags actually drawn.
- Access & Habitat shares are measured but don't score.
