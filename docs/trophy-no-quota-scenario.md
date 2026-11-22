# Trophy scoring: no-quota scenario

This is an offline experiment, not the production model. The owner clarified that fewer tags must not improve trophy score, timing should have little weight, private land must not reduce trophy scores, and ordinary timing must be the same across weapons. Early any-weapon deer dates are only a candidate velvet exception, not verified velvet condition.

Production at `aa6998f` uses Idaho applicants per tag (35 points) and rut timing (15 points); production Idaho table and stored scores therefore still require a coordinated correction. The scripts below do not update them. Replacing the table without the fresh protected score-only database plan would leave the site inconsistent.

## Reproducible scenarios

- `node --import tsx scripts/audit-id-trophy-no-quota.ts out/id-no-quota-shadow.json`: exactly the 236 hunts in the existing Idaho v2 table, using the retained November 16 snapshot. Demand is held constant; the herd weight is 47, publications 8, B&C 5 and timing at most 5. These weights are a test, not calibrated. It intentionally refuses to write a production table. Idaho source data supplies outer season dates, so split-season gaps are not resolved.
- `node --import tsx scripts/audit-ut-trophy-no-quota.ts out/ut-no-quota-shadow.json`: Utah retained snapshot and crosswalk; demand is constant, timing has at most a two-point spread, and actual reported season segments are inspected separately. It does not deduce a season across gaps. Results duplicate resident and nonresident scenarios for the same hunt; a scenario does not establish pool availability.

## Results and remaining work

On the pinned Idaho table population, 84 of 236 hunts changed tier in this scenario. The tier cutoffs are rank-based; even a five-point timing adjustment can change a displayed tier by much more than five because ranks and tier boundaries are discrete. The mature-animal unit proxy uses the maximum observed hunt share and can favour units with more hunts. The current weights, rank thresholds and missing-animal assumptions require review before use. The fixed-demand scenario does not prove the other inputs are unaffected by tag management, nor does it remove quota effects from production models in other states.

Utah produced 450 stable score rows and 138 county-basis scenario rows out of 1,234 hunt/pool rows; 376 lack a supplied crosswalk match, 90 have incomplete geometry, 78 ambiguous supplied matches and four conflict. Other rows have unverified timing, season, unit, county or eligibility inputs. Paunsaugunt DB1001, DB1004, DB1006 and DB1008 yield 75.5 Excellent in this provisional scenario against 100 Elite in the prior live classification. This reflects uncalibrated formula assumptions, including constant demand and missing harvest evidence; it is not evidence that the live rating should be lowered. The live source mapping and all unit-specific data must be verified before any such move.

Remaining: inspect differences and state sources, identify verified early velvet hunts, resolve crosswalk and season ambiguities, assess other states and retained pinned exceptions, design and test a consistent model and presentation, recalculate stored Idaho scores only through the protected workflow, deploy and verify. The owner's western v5 spreadsheet remains an audit reference and is not modified.
