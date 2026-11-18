# Nevada onboarding (deer and elk)

Status Nov 17–18, 2026: built by `scripts/nv_build_hunts.py`, imported by `scripts/nv-import.ts`. Nevada follows
`docs/state-adapter-guide.md` and is laid out like Idaho, with Utah's two-pool hunt pages.

## 1. Sources (all fetched in Claude in Chrome from ndow.org, Nov 17, 2026)

Bundled in `data/nv/source/ndow-bundle-2026-11-17.json.gz` (and `nv-land-2026-11-17.json`):

- **Bonus Point and Application Choice Trends** (ndow.org/blog/bonus-point-data), deer and elk, 2022–2025 draws:
  62 PDFs, 2,617 hunt tables (first- to fifth-choice applicants and successes by bonus points). Parsed by column x
  position; every table's columns sum to NDOW's printed Total row (2,617 of 2,617). The 2026 report is not out (NDOW
  posts it in January).
- **CR 26-11**, 2026–2027 big game quotas (approved May 2026): unit groups, seasons, quotas by hunt number. Row sums
  match NDOW's printed totals for every in-scope section.
- **Big Game Hunt Statistics** by hunt: 2025 xlsx; 2022–2024 PDFs (harvest by hunt: hunters afield, successful
  hunters, 4-point-or-better share).
- **2026 Big Game Application FAQ** (rules) and the **2026 application calendar** (main draw Mar 23 – May 13, results
  May 29; second draw Jun 8–15).
- **Hunt units**: NDOW_Hunt_Units FeatureServer (services.arcgis.com/RyxlXSfFi87rAosq), 129 polygons.
- **Land**: BLM SMA (`BLM_Natl_SMA_LimitedScale/MapServer/1`) in EPSG:5070, 100 m centre-sampled cells per unit,
  computed in the browser. First pass used `ADMIN_ST='NV'` only and left 9 units under 97% covered (NW Nevada and Sheldon
  are administered from California and Oregon offices); the CA/OR/ID features now fill those cells. Statewide: BLM
  66.1%, private 13.0%, USFS 8.1%, DOD 5.5%, FWS 2.1%, tribal 1.5%.
- Not usable: the 2026 "Public Draw List" (names of successful applicants; no counts by points). Fees: NDOW's fee page
  was not reached; pages link to NDOW instead of printing fees (open).

## 2. Draw rule (verified)

NDOW FAQ: each application gets (bonus points)² + 1 random numbers and keeps the lowest; first choices are filled
before any second choice; each hunt category has its own points (antlered deer, junior deer, antlered elk, antlerless
elk, spike elk); missing two consecutive years loses them; up to 5 choices.

Checked on the data (`scripts/nv_backtest.py` → `data/nv/backtest.json`): one cut per hunt, fitted to first-choice
results, over 2,061 hunt tables with a partial draw. Log-likelihood: P²+1 −47,893; (P+1)² −48,562; P³+1 −49,005;
P+1 −51,153; flat −60,876. An exponent scan (P^a + 1) peaks at a = 2.0. So NDOW's printed points are the points held
when applying, and the FAQ rule is right. Calibration of the fitted rule, all years pooled, matches actual draws in every
point band.

Odds tables: per hunt and pool, the cut c that reproduces NDOW's 2025 first-choice draws exactly; odds at N points =
1 − (1 − c)^(N² + 1), N = 0…30 (`tests/nevada.test.ts` checks the totals).

## 3. Projection: not shipped

Roll-forward (misses return with a point, winners at zero, applicants and first-choice tags held) against the naive
last draw, Brier over first-choice applicants, each year from earlier years only:

| pool | predicted | last draw | roll-forward | applicants |
|---|---|---|---|---|
| res | 2023 | 0.04916 | 0.04710 | 50,245 |
| res | 2024 | 0.04982 | 0.05046 | 44,482 |
| res | 2025 | 0.05121 | 0.05112 | 46,095 |
| res | 2024 from 2022 | 0.05001 | 0.04974 | 43,363 |
| res | 2025 from 2023 | 0.05384 | 0.05571 | 45,010 |
| nr | 2023 | 0.00958 | 0.00957 | 21,927 |
| nr | 2024 | 0.00988 | 0.00987 | 23,240 |
| nr | 2025 | 0.01036 | 0.01051 | 25,802 |
| nr | 2024 from 2022 | 0.01127 | 0.01084 | 24,633 |
| nr | 2025 from 2023 | 0.00998 | 0.01004 | 24,129 |

It loses in some year for both pools (res 2024 and two-step 2025; nr 2025), so every page shows the 2025 draw,
labelled. Next draw is 2027 (two seasons after the last published table); revisit when NDOW posts the 2026 report.

## 4. Built data

`data/nv/hunts.json`: 350 hunts = CR 26-11 rows for hunt numbers 1331/1332, 1341/1342, 1371/1372 (antlered deer),
1105/1106/1107 (junior deer), 4151/4251, 4156/4256, 4161/4261 (antlered elk), 4651 (spike elk), 4181/4281,
4176/4276, 4111/4211 (antlerless elk). Resident and nonresident rows for the same unit group and season are one hunt
with two pools (Utah's model); junior and spike are residents only. 6 hunts are new or changed for 2026 and carry no
2025 table. Harvest is per hunt (both pools), 2022–2025; junior categories were restructured in 2025, so most have one
season. `huntablePct` leaves out DOD and DOE land (Nellis/NTTR, Hawthorne, Fallon, Nevada National Security Site).

Left out (`OMITTED` in the builder): elk depredation hunts (ranch and ag-land boundaries, not units), nonresident
guided deer (own regulation CR 25-10 and own points), landowner/incentive/private-lands/PIW/Heritage/Dream/Silver State
tags. So no Nevada row is private-land-only; the shared filter still applies.

## 5. App

Finder cards and the "Nevada: Hunt Type" filter (`nvCat`), hunt pages (`NvHuntPage`), unit pages (`NvUnitPage`), Unit
Map (controlled hunts only), account points (five categories, `src/lib/nvPoints.ts`), How The Draw Works, What
Changed and Planner (`src/components/NvPages.tsx`), header links.

## 6. Open

Fees (NDOW fee page not reached); nonresident guided deer; depredation hunts; 2027 dates; the 2026 bonus point report
(Jan 2027) → re-run the backtest with one more year.
