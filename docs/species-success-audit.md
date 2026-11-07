# Species success audit — November 6, 2026

Pronghorn hunt 4038 had Success 100 and Quality 97 despite 40 harvests / 110 hunter-seasons (36.36%). The archery factor of 0.30 reduced the pronghorn benchmarks to 10.5% / 18% / 25.5% for Success 30 / 75 / 100. Both the label and component score used these discounted benchmarks. High access and low density then left Quality close to 100. Success was an index, not a harvest probability, but the underlying standard was too permissive.

The same problem affected deer archery and muzzleloader and pronghorn muzzleloader. Elk already had weapon-independent general/controlled benchmarks. Moose, bighorn sheep and goat had no weapon factors.

## Model v3

Remove weapon discounts from both labels and scores. Preserve the existing species benchmarks, sample prior, sample floors, weights, trophy exclusions, Quality ceilings and Opportunity formula. These benchmarks are explicit product judgments, not claimed agency standards.

| Species / hunt | Success 30 | Success 75 / high label | Success 100 |
|---|---:|---:|---:|
| Pronghorn, every weapon | 35% | 60% | 85% |
| Deer, every weapon | 35% | 55% | 75% |
| General elk, every weapon | 10% | 20% | 50% |
| Controlled elk, every weapon | 20% | 50% | 80% |
| Moose / sheep / goat | 50% | 70% | 90% |

Score values in this table precede sample adjustment. A hunt below its low benchmark still cannot exceed Quality 49; Quality also cannot exceed the lower of observed and adjusted Success plus 20. Weapon restrictions still describe the hunt but cannot lower its species-level scoring standard.

## Offline impact review

Audited the retained Idaho production snapshot from the approved November 5 rollout (`out/idaho-production-after.json`), containing 1,303 exact summary rows. This is an archived snapshot, not a fresh production read. Reproduce with `tsx scripts/audit-species-scores.ts <saved-snapshot.json>`; the script has no database connection or write path.

| Species | Rows checked | Rows with changed score fields | Newly unscored |
|---|---:|---:|---:|
| Pronghorn | 55 | 24 | 0 |
| Deer | 624 | 188 | 0 |
| Elk | 483 | 0 | 0 |
| Moose | 94 | 0 | 0 |
| Bighorn sheep | 28 | 0 | 0 |
| Mountain goat | 19 | 0 | 0 |

Hunt 4038 becomes Success **32**, Quality **52**, resident Opportunity **30** and nonresident Opportunity **11** (previously 100 / 97 / 56 / 21). Access 84 and elbow room 99 are unchanged. The harvest label becomes Typical. At 38% observed pronghorn harvest, even perfect access and density cannot produce Quality 60.

Colorado calculates deer/elk/pronghorn scores at read time using the shared model, so its weapon discounts are corrected too. It needs no stored-score migration. Existing Colorado input validation and overlapping-elk pressure adjustments remain in place.

## Validation and release

Regression tests cover 4038, 38% deer/pronghorn harvest, all six species and five weapons in general/controlled hunts, monotonic Quality, low-harvest ceilings, unchanged elk behavior, Colorado scoring, and rejection of old-model saved plans. The model version changes to idaho-v3 so a v2 plan cannot be applied accidentally.

Before release, follow `docs/idaho-scoring-rollout.md`: obtain a fresh read-only production plan, review exact proposed updates, and obtain specific approval for the production scores-only recalculation. Standing deployment approval explicitly excludes this database write. Coordinate code deployment and the approved seven-column update; deploying only the code would leave Idaho's stored scores inconsistent with labels. Do not synchronize agencies, rebuild summaries, change schemas, or enable automatic sync. No production writes were made during this audit.
