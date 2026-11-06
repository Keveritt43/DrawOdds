# Colorado pronghorn: initial investigation

CPW's [pronghorn statistics page](https://cpw.state.co.us/activities/hunting/big-game/hunting-pronghorn/pronghorn-statistics) links primary, drawn-out and secondary draw reports for 2021–2026, harvest and population reports for 2019–2025, and OTC sales reports for 2019–2023.

The 2026 primary recap identifies 303 hunt codes. The existing positional primary-draw parser, extended to recognize CPW's `A` species prefix, reads all 303 and reports no point-pool or quota validation errors. The first code, `AE006W1R`, and its continuation page are retained as a regression fixture. These checks do not establish that every field or other report year is correct.

The 2021, 2023, 2024, and 2025 primary recaps also balance (313, 317, 294, and 296 codes). The 2022 report has 315 codes; the point-only code `AP99999P` has 23,198 nonresident first-choice applicants in its printed point rows versus a printed total of 23,199. The parser flags this and the source pages are retained as a fixture. Do not silently adjust either figure or allow this known discrepancy to make other valid hunts disappear; design and review the handling before loading.

The 2026 secondary recap balances for all 130 codes. Source fixtures also cover 2026 drawn-out, 2025 by-code harvest, 2023 OTC sales, and 2026 regulations. The regulations parser still needs pronghorn-specific date and unit-list validation: archery dates vary by license type, and a statewide OTC unit list spans multiple lines. The 2025 population report is labeled pre-hunt in its title while its estimate column says post-hunt; resolve the reporting basis before displaying it as a time series.

This is parser groundwork only. Pronghorn is not yet available in the Colorado application or loaded into production. Before enabling it, validate every report and its species-specific formats, regulations and actual dates; implement pronghorn harvest, population and supplemental report handling, point tracking and UI filtering; and verify that summary generation preserves existing Colorado and Idaho data. Pronghorn seasons and OTC eligibility must come from CPW's regulations, rather than assuming deer or elk seasons apply.

Production agency data sync is prohibited by the repository's working constraints. Prepare and review an exact, non-destructive Colorado-only loading procedure before seeking any required authorization; keep automatic sync disabled.
