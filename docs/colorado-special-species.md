# Colorado moose, sheep and goat

Find Hunts groups these species separately from deer, elk and pronghorn. Pick Colorado, Idaho, or both; filters, cards, map, comparison, and CSV use the same hunt rows. Colorado sheep includes Rocky Mountain and desert bighorn. The site grouping does not imply Idaho's application restrictions apply to Colorado.

The reviewed 2026 snapshot has 197 moose, 124 Rocky Mountain bighorn, 4 desert bighorn, and 48 mountain goat hunt codes. Point-only entries are omitted. Historical results show the published first-choice applicants and successful applicants by residency and age group. Moose recaps can share one pool across several codes; quota and applicant rates are shared, and each code keeps its own issued count. There is no personal weighted-points projection. Reserved codes are labeled and excluded from public draw-rate calculations.

Official CPW source links (draw recap, drawn out at, harvest, population and brochures) are tracked in `data/co-special-reports.json`. Moose draw recaps cover 2021–2026; the other species cover 2020–2026. Harvest is matched by exact code using the 2025 reports; older unit-level reports are linked without assigning their totals to individual hunts. Population displays the 2025 report estimates, with links to earlier reports. Season dates use the 2026 brochures and retain separate weapon windows, disjoint seasons and published weekday limits. CPW layers 7 and 8 supply 90 distinct sheep and goat GMUs. Moose uses existing Colorado big game GMUs. Land statistics reuse the BLM surface-management overlay method; GMU outlines and ownership do not encode partial-unit hunt restrictions.

## Snapshot and release

`npx tsx scripts/prepare-co-special.ts` builds the hunt and boundary snapshots from a local CPW PDF and GIS cache under `out/special`. The downloader is limited to the source catalog and official GIS layers. `scripts/build-co-special-land.py <BLM-cache>` calculates the sheep/goat land statistics from the EPSG:5070 CPW inputs and the existing BLM cache. These steps never connect to a database.

`node scripts/import-co-special.cjs` validates the exact committed inputs and prints the proposed write scope. The `--apply` run uses a single insert-only transaction. It checks the target, required existing moose units, hunt/slug collisions and absence of previous special-species data, and verifies the existing hunt summaries are unchanged. It refuses unexpected existing rows and recognizes a repeat of the exact completed import. The existing Colorado deer/elk rebuild is scoped to those species so a future maintenance run preserves the reviewed special-species rows. No schema commands, agency requests, generic sync runner or cron are involved.

The production release used Railway’s pre-deploy step for the reviewed import. The release cleanup removes that temporary command; normal web deploys just start Next.js.
