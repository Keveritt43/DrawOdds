# DrawOdds data dictionary

This describes the current Idaho and Colorado implementation, not a universal definition of every agency's data. Check the cited code and state-specific sources when changing a metric; update this document and the user-facing explanation alongside any calculation change. Values may be unknown, estimated, pooled or based on broader geography than an individual hunt. Show the applicable source, years, population and limitations rather than silently filling gaps.

## Draw odds

- **Meaning and units:** Estimated or observed chance of drawing a specified license, expressed to users as a percentage; calculations use a fraction from 0 to 1. The applicable applicant pool and method determine the meaning.
- **Inputs:** State, species, hunt, residency, eligibility, draw year and choice; points, youth status and draw phase or pool when applicable. Published applicants and successful draws, quotas or point-pool results are evidence—not automatically interchangeable quantities.
- **Idaho:** Combined search uses historical pooled controlled-draw odds and the available general-tag odds appropriate to residency. Capped resident availability can be unknown; it is not automatically guaranteed.
- **Colorado:** Uses the applicable residency, species points and pool with the selected historical or projected model. Point-level results and projections are distinct; a cutoff, general/OTC eligibility or past success does not guarantee a future tag.
- **Limitations:** Results depend on source and reporting years, choices, pool definitions and model assumptions; past outcomes and projections are not promises. An absent pool or unsupported calculation is unknown, not 0% or 100%. See `src/lib/multiStateSearch.ts`, state odds adapters and `docs/multi-state-search.md`.

## Harvest success

- **Meaning and units:** Harvested animals divided by hunters afield in compatible reported data; stored as a fraction and displayed as a percentage. `success5` generally reflects pooled available counts over up to five seasons: total harvest ÷ total hunters, not an unweighted average of annual percentages.
- **Inputs:** Agency hunter and harvest estimates or counts, species, geography, season and available years. `hunters5`, `harvest5` and `harvestYears` describe the underlying window where available.
- **Idaho:** Hunt or area summaries use the applicable IDFG data and historical boundary handling; inspect the summary and harvest implementations for the specific hunt.
- **Colorado:** CPW estimates can be unit/season aggregates rather than exact hunt-code results; overlapping or multi-unit data must retain their reported scope and limitations. Some years may be unavailable or excluded for ambiguity.
- **Limitations:** Survey estimates and sample sizes vary. Tag holders are not automatically hunters afield; pooled windows and different source geographies or years may not be comparable. Missing or invalid evidence is unknown. See `src/sync/steps/summary.ts`, `src/sync/co/harvest.ts` and `docs/colorado-rollout.md`.

## Hunter density and elbow room

- **Meaning and units:** Estimated hunters per square mile per year. Where pooled counts and area are available, density is `(hunters5 / harvestYears) / (acres / 640)`. This is generally an area-wide average, not a count of people encountered or an estimate confined to public land.
- **Inputs:** Compatible hunter counts, number of reported years and acreage. The Quality model transforms density into the 0–100 **Elbow room** component; lower density yields a higher component score.
- **Idaho:** Uses available hunt/area or unit summary counts and acreage; multi-unit or zone metrics may describe broader geography.
- **Colorado:** Uses reported unit/season counts and area estimates. For deer with confirmed overlapping general/OTC elk seasons, the read-time pressure calculation can include elk unit-season participation. CPW's all-license elk count is a proxy, not an exact OTC count or unique-person count; missing or ambiguous evidence must remain visible.
- **Limitations:** Hunter-seasons may count a person more than once, and broad-area counts cannot establish where people hunted. A public-land-only density would be a different, separately labeled metric. See `src/lib/coLand.ts`, `src/lib/coPressure.ts` and `docs/colorado-elk-pressure.md`.

## Public land and access

- **Meaning and units:** `publicPct` is the estimated share of the relevant area classified as public land, on a 0–100 percentage scale. It is not a guarantee of legal access, road access or huntability.
- **Inputs:** Land-ownership classification, geometry and acreage for the unit, hunt area or covered units; data sources, coverage and attribution vary by state. Multi-unit aggregation can be an estimate rather than an exact hunt boundary.
- **Idaho:** `huntablePct` can include public land plus the applicable Access Yes! share, capped at 100%; it is distinct from public land alone. Quality uses `huntablePct` when available, otherwise `publicPct`.
- **Colorado:** Uses validated state/unit ownership information; the adapter checks coverage and shares and gives private-only hunts zero public-access credit for scoring. Colorado does not inherit Idaho's Access Yes! program.
- **Limitations:** Ownership classification and access rights are different, and surface access, private inholdings, seasonal restrictions and reporting coverage matter. See `src/lib/coLand.ts`, `src/lib/coScores.ts` and `src/sync/steps/summary.ts`.

## Quality

- **Meaning and units:** A 0–100 decision index for hunt quality, not a probability of harvest. Current Idaho model v3 uses species-specific absolute success benchmarks and components for success, access and elbow room.
- **Inputs and calculation:** The base is 65% Success, 20% Access and 15% Elbow room. A bounded, sample-adjusted trophy modifier applies only when suitable data exists; success-based ceilings prevent weak observed success from becoming elite through other factors. The model validates counts and minimum samples, and requires usable access and density for a Quality score.
- **Idaho:** Uses the shared model with applicable huntable/public access and eligible trophy evidence.
- **Colorado:** Applies validation and land/pressure handling before the shared model; unsupported trophy data receives no trophy adjustment. Confirmed general/OTC elk overlap can apply an additional Quality reduction to deer hunts, with the pressure context and limitations explained. Scoring is computed on copies at read time in the Colorado adapter.
- **Limitations:** Scores depend on source quality, geography, available years and species calibration; they are not guaranteed predictions. Missing required inputs leave Quality unknown. See `src/lib/score.ts`, `src/lib/coScores.ts` and `docs/colorado-elk-pressure.md`.

## Opportunity

- **Meaning and units:** A 0–100 decision index combining Quality with the applicable hunter's tag odds: `round(Quality × sqrt(odds))`, where odds is a fraction between 0 and 1. It cannot exceed Quality and is not a draw or harvest probability.
- **Inputs:** Valid Quality and applicable personalized odds, including residency and points/pool where relevant. If either is unknown, Opportunity is unknown.
- **State differences:** Idaho uses the applicable Idaho odds basis; Colorado uses the selected point-level historical or projected odds and applicant pool. Do not treat distinct odds bases as identical forecasts.
- **Limitations:** It inherits the uncertainty and coverage of Quality and odds. Personalization must not change cached public facts or another user's data. See `src/lib/score.ts`, `src/lib/multiStateSearch.ts` and `docs/multi-state-search.md`.

## Related metric: draw and fill

Where supported, **draw and fill** is estimated as applicable draw odds × harvest success, displayed as a percentage. It is distinct from Opportunity and inherits both inputs' assumptions, years and geographic limitations. Use compatible populations and periods, explain it as an estimate, and never promise a harvested animal.
