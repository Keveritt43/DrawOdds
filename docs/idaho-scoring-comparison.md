# Idaho scoring comparison — 2026-11-05

Snapshot: 1303 rows from existing production exports; no agency sync or database writes. Rounded land, density, trophy and odds; CSV omits capped and two-point flags. Baseline is reconstructed from main 263190d, not an exact database dump.

Candidate A: 65/20/15 success/access/density plus bounded trophy adjustment, without harvest ceiling. Candidate B (selected): same weights with observed/sample-adjusted Success + 20 ceiling. Candidate C: 75/10/15 with the same ceiling. Trophy is neutral when unavailable in all three. All candidates use the new fixed conservative prior and absolute Opportunity.

| Model | Scored | Mean Quality | Quality ≥80 | Quality ≥90 |
|---|---:|---:|---:|---:|
| Old (reconstructed) | 1161 | 70.1 | 393 | 194 |
| A: weighted only | 1161 | 58.9 | 228 | 65 |
| B: harvest ceiling (selected) | 1161 | 57.4 | 228 | 65 |
| C: 75% success | 1161 | 55.0 | 212 | 73 |

Among 13 scored controlled elk hunts below 20% observed success: A gives 4 Quality ≥50; B gives 0. B preserves more useful access influence than C, while explicitly stopping compensation for poor harvest.

| Hunt | Context | Harvest success | Quality before → after | Resident Opportunity | NR Opportunity |
|---|---|---:|---:|---:|---:|
| [elk-2129](https://web-production-39e54.up.railway.app/hunts/elk-2129) | CONTROLLED MUZZLELOADER ANTLERLESS | 18.8% | 87 → 48 | 100 → 48 | 99 → 48 |
| [elk-2066](https://web-production-39e54.up.railway.app/hunts/elk-2066) | CONTROLLED ANY ANTLERLESS | 68.5% | 95 → 83 | 28 → 43 | 48 → 48 |
| [elk-2005](https://web-production-39e54.up.railway.app/hunts/elk-2005) | CONTROLLED ANY ANTLERED | 49.7% | 89 → 80 | 93 → 37 | 75 → 21 |
| [elk-unit-20a-general-any-weapon](https://web-production-39e54.up.railway.app/hunts/elk-unit-20a-general-any-weapon) | GENERAL ANY ANTLERED | 19.6% | 74 → 79 | 97 → 79 | 90 → 71 |
| [elk-unit-51-general-any-weapon](https://web-production-39e54.up.railway.app/hunts/elk-unit-51-general-any-weapon) | GENERAL ANY ANTLERLESS | 38.0% | 90 → 90 | 95 → 90 | 45 → 24 |
| [elk-2007](https://web-production-39e54.up.railway.app/hunts/elk-2007) | CONTROLLED ANY ANTLERED | 80.1% | 98 → 94 | 22 → 19 | 20 → 14 |
| [deer-1014](https://web-production-39e54.up.railway.app/hunts/deer-1014) | CONTROLLED ANY ANTLERED | 87.5% | 96 → 100 | 11 → 14 | 12 → 11 |
| [moose-3016](https://web-production-39e54.up.railway.app/hunts/moose-3016) | CONTROLLED ANY ANTLERED | 96.0% | 97 → 97 | 11 → 18 | 19 → 13 |
| [bighorn-sheep-5017](https://web-production-39e54.up.railway.app/hunts/bighorn-sheep-5017) | CONTROLLED ANY ANTLERED | 96.2% | 98 → 94 | 5 → 15 | 43 → 4 |

## Largest Quality decreases (audit for unintended effects)

| Hunt | Context | Harvest success | Quality before → after | Resident Opportunity | NR Opportunity |
|---|---|---:|---:|---:|---:|
| [deer-unit-26-general-archery](https://web-production-39e54.up.railway.app/hunts/deer-unit-26-general-archery) | GENERAL ARCHERY EITHER | 0.0% | 71 → 20 | 77 → 20 | 66 → 17 |
| [deer-unit-27-general-archery](https://web-production-39e54.up.railway.app/hunts/deer-unit-27-general-archery) | GENERAL ARCHERY EITHER | 0.0% | 69 → 20 | 65 → 20 | 19 → 12 |
| [elk-unit-15-general-muzzleloader](https://web-production-39e54.up.railway.app/hunts/elk-unit-15-general-muzzleloader) | GENERAL MUZZLELOADER ANTLERLESS | 0.0% | 69 → 20 | 56 → 20 | 93 → 16 |
| [elk-unit-17-general-archery](https://web-production-39e54.up.railway.app/hunts/elk-unit-17-general-archery) | GENERAL ARCHERY EITHER | 0.0% | 69 → 20 | 74 → 20 | — → — |
| [deer-unit-18-general-archery](https://web-production-39e54.up.railway.app/hunts/deer-unit-18-general-archery) | GENERAL ARCHERY EITHER | 0.0% | 68 → 20 | 61 → 20 | 94 → 20 |
| [elk-unit-61-general-any-weapon](https://web-production-39e54.up.railway.app/hunts/elk-unit-61-general-any-weapon) | GENERAL ANY EITHER | 0.0% | 68 → 20 | 78 → 20 | — → — |
| [deer-unit-9-general-muzzleloader](https://web-production-39e54.up.railway.app/hunts/deer-unit-9-general-muzzleloader) | GENERAL MUZZLELOADER EITHER | 0.0% | 67 → 20 | 44 → 20 | 71 → 20 |
| [deer-unit-9-general-muzzleloader-2](https://web-production-39e54.up.railway.app/hunts/deer-unit-9-general-muzzleloader-2) | GENERAL MUZZLELOADER EITHER | 0.0% | 67 → 20 | 44 → 20 | 71 → 20 |
| [deer-unit-9-general-muzzleloader-3](https://web-production-39e54.up.railway.app/hunts/deer-unit-9-general-muzzleloader-3) | GENERAL MUZZLELOADER EITHER | 0.0% | 67 → 20 | 44 → 20 | 71 → 20 |
| [deer-unit-9-general-muzzleloader-4](https://web-production-39e54.up.railway.app/hunts/deer-unit-9-general-muzzleloader-4) | GENERAL MUZZLELOADER EITHER | 0.0% | 67 → 20 | 44 → 20 | 71 → 20 |

## Limits and review decisions

- The supplied identifier `2-1-2-9` appears to mean hunt 2129. The literal URL is absent; 2129 matches cow/muzzleloader, 18.8% success and live Quality 87. The live resident Opportunity was 100 and reconstructed NR Opportunity 99. Live component bars were Success 80, Access 90, Elbow room 93, trophy omitted.
- Old Quality was 35/35/20 with trophy omitted and remaining weights renormalized. Controlled muzzleloader elk high-success threshold was just 16.5% (30% × 0.55), low 8.25%, top 33%. Peer shrinkage further changed the grade; the final percentile made Opportunity look nearly perfect.
- Selected controlled benchmarks are deliberately stricter and weapon independent: under 20% is poor, 50% strong, 80% exceptional. General elk: under 10% poor, 20% strong, 50% exceptional. No empirical claim is made that these judgment thresholds optimize hunter preferences.
- Sample floor remains 30 hunter-seasons (10 for moose/sheep/goat). Fixed prior = 50 hunter-seasons at the low benchmark (10 for those species); it suppresses tiny perfect samples without depending on peers. Observed-success ceiling prevents upward shrinkage from hiding a poor outcome.
- Trophy adjusts a common base by ±5 at most, shrunk by harvest/(harvest+50). Cow hunts have zero adjustment, not redistributed weights. Bull trophy share is conditional on successful harvest and lacks its own denominator here; total harvest is an upper-bound sample proxy, so its influence stays small.
- Public + Access Yes! acreage is a land proxy, not verified legal or physical access. Density is a whole-area annual average, not public-land crowding; it can flatter private-heavy or very large areas, and overlapping seasons can share hunters. Its weight is reduced to 15%; no invented precision is added.
- General harvest combines sex/season classes, and tag rows aggregate units/weapons. These remain data-granularity limitations. CSV lacks capped and two-point flags, rounds percentages/density, and can mark known capped tags as OTC in this offline comparison; use the exact database dry run before rollout. The production implementation retains capped-tag and two-point exclusions.
- Missing land/density now suppresses overall Quality rather than redistributing their weights. Missing/invalid harvest or odds remains unknown, never zero. Invalid harvest above hunters is rejected rather than clamped. This may reduce score coverage and should be reviewed.
- Absolute Opportunity uses Quality × sqrt(odds). This is a preference index, not expected harvest probability; Draw and Fill already presents draw odds × success. No relative percentile is shown, avoiding new UI controls and schema columns.
- Finder already sorts/filters stored score columns per residency and excludes Quality <50 by default when sorting Opportunity; no finder layout or navigation changes are needed. Recalculation is required before existing stored rows reflect this model.

Reproduce with `npm run scores:compare`. Exact production values must come from the reviewed scores-only dry run documented in `docs/idaho-scoring-rollout.md`.
