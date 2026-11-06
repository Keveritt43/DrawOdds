import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesHuntSeason } from "../src/lib/huntSeasonFilter";
import { parseFilters } from "../src/lib/finder";
import { filterQuery } from "../src/lib/filterPreferences";
import { coLandSummary, coLandUnit } from "../src/lib/coLand";
import data from "../data/co-land.json";
const hunt = {
  openDate: new Date("2027-10-10"),
  closeDate: new Date("2027-10-31"),
  youthOnly: false,
  weapon: "ANY",
  antlerClass: "EITHER",
  tagSeasons: {
    year: 2027,
    seasons: [
      {
        weapon: "ANY",
        sex: "antlered",
        notes: "",
        dates: [{ open: "2027-10-10", close: "2027-10-24" }],
      },
      {
        weapon: "ANY",
        sex: "antlerless (youth hunt only)",
        notes: "",
        dates: [{ open: "2027-10-10", close: "2027-10-31" }],
      },
    ],
  },
};
test("hidden youth extension cannot keep an adult general tag in late date results", () => {
  assert.equal(
    matchesHuntSeason(hunt, parseFilters({ from: "10-30", to: "10-31" })),
    false,
  );
  assert.equal(
    matchesHuntSeason(
      hunt,
      parseFilters({ from: "10-30", to: "10-31", youth: "include" }),
    ),
    true,
  );
  assert.equal(
    matchesHuntSeason(
      hunt,
      parseFilters({ from: "10-30", to: "10-31", youth: "only" }),
    ),
    true,
  );
});
test("end-date matching and weapon constraints use the same eligible season", () => {
  assert.equal(
    matchesHuntSeason(
      hunt,
      parseFilters({ from: "10-24", to: "10-24", dmode: "end" }),
    ),
    true,
  );
  assert.equal(
    matchesHuntSeason(
      hunt,
      parseFilters({ from: "10-31", to: "10-31", dmode: "end" }),
    ),
    false,
  );
  assert.equal(
    matchesHuntSeason(
      hunt,
      parseFilters({
        from: "10-30",
        to: "10-31",
        weapon: "ARCHERY",
        youth: "include",
      }),
    ),
    false,
  );
});
test("new visitors default antlered, explicit antlerless and both survive query persistence", () => {
  assert.deepEqual(parseFilters({}).antler, ["ANTLERED"]);
  assert.deepEqual(parseFilters({ antler: "ANTLERLESS" }).antler, [
    "ANTLERLESS",
  ]);
  assert.deepEqual(parseFilters({ antler: "ALL" }).antler, []);
  assert.equal(
    matchesHuntSeason(hunt, parseFilters({ antler: "ANTLERLESS" })),
    true,
  );
  assert.equal(
    filterQuery("antler=ANTLERLESS&minPublic=50&page=3&reset=1"),
    "antler=ANTLERLESS&minPublic=50",
  );
});
test("all 186 Colorado units have bounded ownership and checked polygon coverage", () => {
  assert.equal(Object.keys(data.units).length, 186);
  for (const d of Object.values(data.units)) {
    assert.ok(d.coverage >= 0.98 && d.coverage <= 1.001);
    for (const k of [
      "publicPct",
      "privatePct",
      "tribalPct",
      "unknownPct",
    ] as const)
      assert.ok(d[k] >= 0 && d[k] <= 100);
    assert.ok(
      Math.abs(d.publicPct + d.privatePct + d.tribalPct + d.unknownPct - 100) <
        0.03,
    );
    assert.ok(d.acres > 0);
  }
  assert.ok(coLandUnit("70")!.publicPct > 0);
  assert.equal(coLandUnit("999"), null);
});
test("multi-unit ownership is acreage weighted, unknown units never become zero-private", () => {
  const a = coLandUnit("70")!,
    b = coLandUnit("71")!,
    m = coLandSummary(["70", "71"])!;
  assert.ok(
    Math.abs(
      m.publicPct -
        (a.publicPct * a.acres + b.publicPct * b.acres) / (a.acres + b.acres),
    ) < 1e-9,
  );
  assert.equal(coLandSummary(["70", "999"]), null);
  assert.equal(coLandSummary(["70", "70"])!.acres, a.acres);
});
