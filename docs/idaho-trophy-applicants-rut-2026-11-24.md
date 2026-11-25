# Idaho trophy: applications as demand, same-unit rut ordering (2026-11-24)

Owner decisions in chat, Nov 24, 2026:

- **Demand is the raw application count** at the last draw, not applicants per tag. Reason: in some states every tag is hard to get, so scarcity doesn't separate hunts; how many hunters want a hunt does. Weight 35, as a mid-rank percentile within species among the 236 table hunts.
- **Season timing stays small** (5 of 100 points), but **within the same units and weapon, the deer or elk hunt with more rut days ranks above the earlier one** (November deer over October; September/early-October rifle elk over later October). `orderByRut` in `src/lib/trophyV2Idaho.ts` raises the rut hunt 0.1 above the best earlier hunt; it never lowers a hunt and never compares across units, weapons or deer types.
- Live weights: demand 35, mature-antler share 47, named sources 8, county B&C 5, timing 5 (`LIVE_WEIGHTS`). Tiers are still by rank within species (top 2% / next 8% / next 30%).

Correction to the previous model: the deer timing window was Nov 1–15, so a Nov 10–30 hunt (1010) got fewer rut days than an Oct 17–Nov 9 hunt (1009). The window is now all of November (`LIVE_TIMING_WINDOWS`).

Known cost of raw applications: they rise with tag count. Deer 1057 (Unit 73) had 2,694 applications for 2,293 tags, the 94th percentile of demand, though nearly everyone drew; it stays Standard because its other evidence is weak. Deer 1031 (Unit 40, 200 tags, 6,182 applications) and 1034 (Unit 44, 225 tags, 5,324) move Good → Excellent mostly on volume. If that proves wrong, unsuccessful applicants (applications − tags) count people the same way without rewarding big easy draws.

Result on the retained 2026-11-16 snapshot (`scripts/build-idaho-noquota-tiers.ts`): 236 scored; tiers 5 Elite, 19 Excellent, 70 Good, 142 Standard (was 5 / 20 / 86 / 125). 10 hunts lifted by the rut rule: deer 1010>1009, 1047>1046, 1059>1057, 1055>1056; elk 2026>2027, 2028>2029, 2016>2017, 2021>2022, 2019>2020, 2031>2032. Unit 54: 1043 (Nov) rank 1 and 1042 (Oct) rank 2, both Elite. 1044 (early Area 55, 693 applications) moves Elite → Excellent, rank 6 of 108; its Elite came from the no-quota model, not an owner ruling.

Not changed: other states. They already use raw application counts for demand, but still drop a whole tier for deer/elk outside the preferred season, which is larger than the owner wants. Idaho is the pilot; carry this over once Idaho is settled.

Stored scores need a scores-only update after deploy (`docs/idaho-scoring-rollout.md`).
