# Idaho Hunt Planner

Find Idaho deer and elk hunts by **draw odds for your residency**, hunter success, season, weapon, antlered vs antlerless, mule deer vs whitetail, trophy share, public land and Access Yes! acres. Every hunt and unit has trend charts, and the map lets you click any unit to see what's available in it.

Next.js 15 (App Router) · Prisma + Postgres · Auth.js email magic links · MapLibre · Recharts · Railway.

## How it works

```
IDFG (public data)                       nightly cron: npm run sync
  odds API ............................> DrawOdds
  harvest stats pages (controlled) ....> ControlledHarvest      (completeness check + retry)
  harvest stats pages (general) .......> GeneralHarvest         (completeness check + retry)
  GIS: units, hunt areas, Access Yes! .> Unit / HuntArea / AccessYesProperty  (overlaps computed with turf)
  unit.aspx / area.aspx pages .........> land ownership (public %, private %, wilderness) - monthly
  huntlist.aspx (per unit) ............> Hunt  (this season: dates, weapon, antler class, tags)
                                           |
                              buildSummaries (no network)
                                           v
                                      HuntSummary  <- the finder, map and pages read this
```

* **Residency** lives on the user's profile (or a cookie for visitors). It decides which odds column every filter, sort, chart highlight and map color uses.
* **Renumbered hunts:** IDFG renumbers controlled hunts every few years. `lineage()` follows a hunt back by matching the same hunt area and closest tag count (tested on Area 49: 2030 -> 2028 -> 2029).
* **Never deletes good data on a bad night:** a failed fetch keeps that year's rows; every step writes to `SyncLog` (see `/admin`).
* The sync identifies itself with `SYNC_USER_AGENT` and waits `SYNC_DELAY_MS` between requests. It is a public agency's server: keep it polite.

## Deploy on Railway

1. **New project -> Deploy from GitHub repo** (this repo). That creates the **web** service.
2. **Add -> Database -> PostgreSQL.**
3. Web service **Variables**:
   * `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   * `AUTH_SECRET` = output of `openssl rand -base64 32`
   * `AUTH_URL` = your public URL (Settings -> Networking -> Generate domain)
   * `AUTH_RESEND_KEY` + `EMAIL_FROM` (optional at first: without a key, sign-in links are printed in the deploy logs)
   * `ADMIN_EMAILS` = your email
   * `SYNC_USER_AGENT` = `IdahoHuntPlanner/0.1 (+mailto:you@example.com)`
4. Deploy. The start command runs `prisma db push` first, so the schema is created and kept in sync automatically.
5. **Sync service:** Add -> GitHub repo (same repo) again, name it `sync`, and in Settings set **Config file path** to `/railway.sync.json`.
   That file sets the start command (`npm run sync`), the cron schedule (`0 10 * * *` = 03:00 Pacific) and no healthcheck.
   Give it `DATABASE_URL`, `SYNC_USER_AGENT` and `SYNC_DELAY_MS`.
6. **First load:** trigger one run of the sync service (Deploy -> Run now). On an empty database a normal run pulls every missing year back to 1998, so it takes 30-60 minutes at a polite request rate. After that, nightly runs only refresh the last two seasons plus anything missing. `npm run sync:full` re-pulls everything.

## Local development

```bash
cp .env.example .env          # point DATABASE_URL at a local Postgres
npm install
npm run db:push
npm run sync -- odds harvest  # or: npm run sync:full
npm run dev
```

Sync steps: `odds harvest general gis land hunts summary` (default: all, in that order). `--full` re-pulls every year.

## Tests

`npm test` runs the parsers and the math (odds, renumbering lineage, harvest estimates, residency-aware filters) against fixtures built from real IDFG pages and real Unit 49 numbers.

## Data, attribution and limits

All data is public IDFG data. The app is not affiliated with or endorsed by IDFG, and says so on every page. Before charging money, confirm IDFG's terms for reuse of Hunt Planner data. Known limits are listed on `/about` (2022 boundary changes, small nonresident samples, estimates from rounded percentages).
