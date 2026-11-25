# Idaho hunt history across area relabels (2026-11-25)

Closes the history items in `docs/idaho-draw-audit-2026-11-23.md`. Production rows read with `scripts/id-audit-read.ts` (read only).

## What was wrong

History (draw odds and harvest for earlier years) is matched by `lineage()` in `src/sync/core/math.ts`. It only looked inside the hunt's current area name, so when IDFG relabelled an area the history stopped there.

- **2026 relabels with the same hunt number and tags in the same parent unit: 14 hunts.** Deer 1028 (38 → 38-1), 1029 (38 → 38-2), 1085 (29-2 → 29-1), 1087 (33 → 33-1), 1090 (51 → 51-1); elk 2075 (32A-2 → 32A-1), 2133 (36A → 36A-3); moose 3050; bighorn 5003, 5020, 5022, 5026; goat 6018, 6019. Earlier years: 2025 6, 2023 3, 2021 2.
- **Deer 1074** is labelled "41-1" in the 2026 regulations and "41-2" in the 2026 draw results, so the sync found no draw row and stored it as a new hunt: no odds, no history, no Quality. IDFG's hunt planner (hunt 82192) gives its lineage: 2025 1074 (41-2), 2021–2024 1076 (41-1), 2019–2020 1078 (41-1). 2021–2025: 95 hunters, 14 deer.
- **Winter antlerless elk 2281 / 2282 (41X):** drawn in even years for a January/February hunt. The 2024 draw's hunts are reported in the 2025 harvest table (61 hunters / 31 elk, 73 / 34), but history only matched harvest to the draw year.
- **Not a problem:** today's deer 1076 (Area 44) does not carry the old Area 41-1 rows; my Nov 24 note suggesting it might was wrong. History never crossed area names.

## The rule now (general, every Idaho hunt)

- Within an area: unchanged (renumbered hunts matched by tag count within 60%, then nearest number).
- Across a relabel, when a year has no match in the current area: an earlier row in another area of the **same parent unit** (`parentArea`: "41-1", "41-2", "41X" → 41; X marks an extra area, never a unit letter) with tags **within 10%**, and either **the same hunt number**, or it is **the only such row and its area name no longer exists the following year** (that is how 41-1 became 41-2 for 1074).
- Same-year label mismatch between regulations and draw results: accept the draw row for the same number and year in the same parent unit.
- Winter hunts: a draw year with no harvest row takes the next year's row for the same number in the same parent unit, only if that number had no drawing of its own that next year.
- Hunt-page charts (`src/lib/history.ts`) use the same rule.

Tests: `tests/lineage-relabel.test.ts` (1074 chain, 1076 untouched, 2133, a still-existing sibling area rejected, the 10% tag rule, winter harvest).

## Applying it

`scripts/id-history-repair.ts` builds the Idaho summaries with the old and new rule, changes only rows where they differ and whose stored values equal the old rule's output, never writes scores or slugs, and applies only on the reviewed digest. Then the usual scores-only update (`docs/idaho-scoring-rollout.md`). Run log is below.

## Also checked

- 2133's 2025 hunt was all of Unit 36A; the 2026 hunt (36A-3) adds Unit 50. Same number and 250 tags, so history follows it, but the 2025 hunters were spread over less ground.
- 1074's area: IDFG's hunt planner gives 2,401,304 acres for Units 41+42; our unit table sums to 2,265,558 (41: 1,408,031; 42: 857,527), 5.7% less. Density uses our unit table's acres, the same as every other hunt.
