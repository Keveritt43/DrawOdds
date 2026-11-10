# Advanced metrics backlog

This list comes from the owner's "Advanced Hunting Metrics Implementation Guide" (Nov 2026). It is a backlog, not a commitment, and nothing here is built yet. Each metric needs the same evidence a shipped metric needs (see [data-dictionary.md](data-dictionary.md)): a source, a vintage, a definition, validation against known places, and a label explaining what it does **not** mean.

## How these fit this stack

The guide assumes Snowflake, dbt and Fivetran. This project runs on Postgres with Prisma on Railway, and PostGIS is not assumed. The pattern that already works is the one Colorado public land uses (`scripts/build-co-land.py`):

- an **offline script** fetches the GIS sources and caches them under `out/`;
- it computes in an equal-area projection (EPSG:5070) with shapely;
- it writes one small summary per unit (a percent, an acreage, a category);
- a reviewed state-scoped load puts that summary into the database.

The web app only reads these summaries. Rasters (DEMs, SNODAS, NDVI) get the same treatment: zonal statistics are computed offline, and only per-unit numbers are stored.

## The metrics, ranked by value per effort

| # | Metric | Source | Main validation risk | Effort | Notes |
|---|---|---|---|---|---|
| 1 | Roadless share: % of public land more than 1 or 2 miles from an open motorized route | USFS MVUM / Road Core, BLM GTLF, IRAs | MVUM is seasonal and per forest. Closed roads still appear in Road Core. | Medium | Best next metric: it fits Access and Elbow room directly. Buffer the open routes, subtract the buffers from public land, report the share of what remains. |
| 2 | Terrain ruggedness (TRI) on public land: Rolling / Steep / Extreme | USGS 3DEP 10 m | Unit sizes are large. Use 30 m for a first pass. | Medium | Mask the DEM to public land first. Use it as a label, not as a score input. |
| 3 | Seasonal range mismatch: an early hunt in a unit that is mostly winter range | USGS ungulate migration corridors/ranges; state seasonal range layers | Coverage is patchy: only studied herds. Missing range data does not mean "no animals." | Medium | A warning only, and only where a mapped range exists. Idaho migration studies already exist. |
| 4 | Burn age 3–8 years (acres in a unit) | NIFC historic perimeters, NLCD | Burn severity is unknown, and so is whether the burn was forest or scrub. | Low | Show the acres and the burn year. "Prime regeneration" is a hypothesis, not a fact. |
| 5 | Snowpack access warning (SWE above 9,000 ft vs normal) | NSIDC SNODAS G02158 | Changes daily, so it needs a schedule. Automatic sync is off by policy. | High (ops) | Only with owner approval for a recurring job. Otherwise publish a dated snapshot. |
| 6 | Deepest point from a road (largest inscribed circle in a wilderness) | NWPS wilderness boundaries plus roads | Private inholdings must be holes in the polygon, not deep wilderness. | Low | Very cheap, but it shows only one number per wilderness, not per unit. |
| 7 | Perennial water far from roads (AZ, NM, NV) | USGS NHD (FCode perennial), BLM guzzlers | Guzzler data is incomplete, and NHD "perennial" is often wrong in deserts. | Medium | Only once a desert state is onboarded. |
| 8 | Trailhead reach (1 h / 3 h hiking isochrones, Tobler) | USFS/BLM recreation sites, 3DEP | Trailhead status goes stale, and the cost surface is a modeled guess. | High | It's a model, so label it modeled. Overlaps heavily with #1. |
| 9 | NDVI green-up / drought | Sentinel-2 / Landsat | Needs cloud masks and a summer-range polygon per unit. | High | Research only. The link to hunting success is unproven. |
| 10 | Migration funnels (corridors × saddles) | USGS corridors, DEM | Too precise to publish: it points people at specific ambush points. | High | Don't build without an explicit owner decision. |

## Rules for any of these

- Public, roadless, rugged and remote are each different from **legal access**. Say so in the label.
- A missing layer means unknown, not zero. Coverage varies by state and forest.
- Don't fold a new metric into Quality until it has been checked against harvest or density data and the score explanation (`/score`) is updated with it.
- Record the source, its vintage and the build date with each per-unit value, so the age of the data can be shown.
