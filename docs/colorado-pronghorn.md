# Colorado pronghorn release

CPW's [pronghorn statistics page](https://cpw.state.co.us/activities/hunting/big-game/hunting-pronghorn/pronghorn-statistics) supplies the 37 links in `data/co-pronghorn-reports.json`: primary, drawn-out and secondary recaps for 2021–2026, harvest and population reports for 2019–2025, and OTC sales for 2019–2023. Chapter W-2 supplies units, restrictions and season dates. These are handled separately from deer and elk.

The six primary reports contain 303, 296, 294, 317, 315 and 313 codes (2026 back to 2021). All balance except the 2022 point-only code `AP99999P`: its nonresident first-choice rows add to 23,198 while the printed total is 23,199. Its complete parsed source is retained as a `draw-exception` report rather than changed or used for hunt odds. The remaining 1,837 validated draw rows are imported. All six secondary recaps balance; they remain separate from primary point odds.

The 2025 harvest report is by hunt code. Earlier reports are unit/season aggregates; they are retained as reports but are not substituted for individual pronghorn hunt-code success or hunter counts. Missing values remain missing. CPW's 2025 population report says pre-hunt in its title and post-hunt in its column header, so the UI calls these population estimates without assigning a season. The 2022 population PDF has a corrupt text layer and was visually transcribed into `data/co-pronghorn-population-2022.json`. Its 28 printed herd values add to 73,442 while CPW prints 73,440; both are retained.

Pronghorn archery (including different buck/either-sex and doe dates), muzzleloader, and first and second rifle dates are extracted from the pronghorn regulations, not deer or elk calendars. A hunt-specific dated exception takes precedence; if no later exception is published, its source year remains visible. The statewide OTC archery list retains CPW's partial-area text. Consult CPW for current availability and restrictions.

## Reviewed one-time import

`scripts/prepare-co-pronghorn.ts` downloads only the pronghorn reports and regulations into ignored `out/pronghorn/` without a database connection. `scripts/finalize-co-pronghorn.cjs` validates and creates the committed, reviewed `data/co-pronghorn-import.json`. SHA-256: `2b2a46f4cc39c379f85cc0fba221aea4be5a650c5aa9cface62f1f49204dccbb`.

`scripts/import-co-pronghorn.ts` defaults to a local, read-only validation. With `--apply`, it makes no network requests and inserts only new Colorado pronghorn recap and report rows. It refuses to proceed if any Colorado pronghorn data already exists. Summary creation uses an insert-only pronghorn path and checks for hunt ID collisions; non-pronghorn summary digests are compared before and after. No schema operation, Idaho agency synchronization, generic sync runner, or cron is involved. Existing historical hunts and summaries are preserved. The loader is a one-time process and is not a startup script.
