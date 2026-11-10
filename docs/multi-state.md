# Adding more states: plan

For the current combined Find Hunts implementation and expansion requirements, see [multi-state-search.md](multi-state-search.md). The original planning notes below predate the live Colorado implementation; current state availability is defined in `src/lib/states.ts`.

Status (historical): written when Colorado deer was first loaded. For current state, see `src/lib/states.ts` and docs/state-adapter-guide.md.

## What is in place now

| Piece | Where | What it does |
|---|---|---|
| State registry | `src/lib/states.ts` | One entry per state: name, agency, access program, points system, drawings, species, map bounds and **feature flags**. Only `ID` exists. |
| Current state | `getState()` in `src/lib/residency.ts`; `state` cookie; `?state=` override | Server pages read it. Unknown or disabled codes fall back to Idaho. |
| Client access | `StateProvider` / `useStateConfig()` in `src/components/StateContext.tsx` | Set once in the root layout; any client component can ask "does this state have X?". |
| Picker | `StateSwitch` (the "IDAHO ▾" beside the logo) + `setStateCode` server action | Lists enabled states; sets the cookie. With one state it just says more are coming. |
| Feature-gated UI | `FilterRail`, `UnitMap`, `SiteHeader` | Elk zones, elk objectives, migration studies, leftovers, NR general-tag draw types, the drawing switch (only when a state has 2+ drawings) and the Migration nav link only show when the state has them. |
| `state` column | 13 tables (`DrawOdds`, `ControlledHarvest`, `GeneralHarvest`, `Unit`, `HuntArea`, `AccessYesProperty`, `Hunt`, `HuntSummary`, `NrDraw`, `NrQuota`, `MigrationStudy`, `SavedUnit`, `Application`), default `"ID"` | Existing rows are Idaho with no backfill. `HuntSummary` is indexed on it. |
| Query scoping | `buildWhere(..., state)` in `src/lib/finder.ts` | Find A Hunt and CSV export already filter `HuntSummary` by state (default `ID`). |

## Deliberately not done yet (and why)

1. **State-prefixed URLs** (`/idaho/hunts`, `/montana/units/...`). These are the right end state for sharing and
   search, but they mean moving every route under `app/[state]/` plus redirects. They're worth it only once
   there is a second state to point at. Until then the cookie is enough.
2. **Composite unique keys.** DONE for Unit (state, name) and SavedUnit via prisma/prepush.sql; CO hunt slugs are
   prefixed ("co-dm070o3r") and CO unit URLs too ("/units/co-70"), so the rest below is no longer blocking. `Unit.name` is the primary key ("39") and `HuntSummary.slug` is globally unique
   ("deer-1016"). Both collide once a second state has a unit 39 or a deer hunt 1016. These are migrations, not
   pushes (`prisma db push` would drop and recreate keys), so they belong with state #2:
   - `Unit`: `@@id([state, name])`, and every relation that points at a unit name.
   - `HuntSummary.slug`: `@@unique([state, slug])`.
   - `SavedUnit`: add `state` to its unique key.
   - `HuntSummary.id` ("c:<agency id>"): prefix the state ("ID:c:...") or switch to a cuid.
3. **Filtering every query by state.** Only the Find A Hunt path filters today. Before a second state's data
   lands, every `db.*.findMany` that reads hunt, unit, harvest or migration rows needs `state` in its `where`.
   `grep -rn "db\.\(huntSummary\|unit\|drawOdds\|controlledHarvest\|generalHarvest\|migrationStudy\)" src`
   is the checklist.
4. **Copy.** "IDFG", "Access Yes!", "Idaho has no points", season dates and the deadline calendar
   (`src/lib/applyInfo.ts`) are written for Idaho. Move them behind `StateConfig` (`agency`, `accessProgram`,
   `points`) or per-state files as each page is touched.

## The hard part is points, not the selector

Idaho is a pure random draw: last year's odds are this year's odds. Most western states aren't:

| State | System | What the odds depend on |
|---|---|---|
| Montana | Bonus (squared) for many species + preference for deer/elk combos | Points held |
| Wyoming | Preference (75%) + random (25%) for NR elk/deer/antelope | Points held, and which pool |
| Colorado | Preference (with a hybrid draw for 5+ points) | Points held |
| Nevada | Bonus, squared | Points held |
| Utah | Bonus + preference split | Points held |

That needs:
- **A per-point odds table**: `DrawOddsByPoints { state, year, species, huntCode, residency, points, applicants, drawn }`.
  Most agencies publish exactly this breakdown.
- **A "your points" input** per state/species on the user (and in the cookie for visitors), feeding odds,
  the score and the planner.
- **A planner that projects points**: apply and miss, gain a point; the chance of drawing in N years.
- **Point-creep trends**: how fast the points needed are rising. This is a selling point GoHunt charges for.

Estimate: the points model is most of the work for any second state. The registry and picker are the easy 10%.

## Steps to add state #2

1. **Data inventory** (one checklist per state, kept in `docs/states/<code>.md`):
   - Draw results: format, years available, per-point breakdown?
   - Harvest reports: general and limited/controlled, by unit and weapon
   - Unit / hunt-district GIS boundaries, plus any zone or region groupings
   - Season and tag regulations: dates, weapons, antler rules
   - Nonresident quotas and fees
   - Land ownership; private-land access program, if any
   - Migration studies, if any
2. **Sync modules**: move today's steps to `src/sync/states/id/` and add `src/sync/states/<code>/` with the same
   step names, each writing rows with `state` set. The `summary` step stays shared where the math is the same.
3. **Registry entry** in `src/lib/states.ts` with `enabled: false` while loading data, then `true`.
4. **Keys and query scoping** (sections 2 and 3 above), then state-prefixed routes with redirects from today's
   unprefixed Idaho URLs (`/hunts/...` → `/idaho/hunts/...`), so shared links keep working.
5. **Points model** (above) if the state has points.
6. **UAT** the state end to end, as was done for Idaho.

## Open decisions for later

- Which state is next. Pick by data availability and nonresident demand: Wyoming and Montana are the most common
  "second state" for Idaho applicants. Both have points.
- One combined "all my states" planner and deadline calendar, or per state. A combined view is the stronger
  reason to stay over GoHunt.
- Pricing, if any, once there is more than one state.
