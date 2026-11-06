import { test } from "node:test";
import assert from "node:assert/strict";
test(
  "account filters remain isolated by user and state without overwriting points or plans",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    const { db } = await import("../src/lib/db");
    const { setAccountPreference } =
      await import("../src/lib/accountPreferences");
    const prefix = "filter-test-" + Date.now();
    const a = await db.user.create({
        data: {
          email: prefix + "a@example.invalid",
          points: { CO: { DEER: 8, ELK: 4 }, _plan_CO: ["CO:DM070O2R"] },
        },
      }),
      b = await db.user.create({
        data: { email: prefix + "b@example.invalid" },
      });
    try {
      await Promise.all([
        setAccountPreference(a.id, "_filters_ID", "antler=ANTLERLESS"),
        setAccountPreference(
          a.id,
          "_filters_CO",
          "antler=ANTLERED&minPublic=50",
        ),
        setAccountPreference(b.id, "_filters_ID", "antler=ALL"),
      ]);
      const rows = await db.user.findMany({
        where: { id: { in: [a.id, b.id] } },
      });
      const x = rows.find((u) => u.id === a.id)!.points as Record<
          string,
          unknown
        >,
        y = rows.find((u) => u.id === b.id)!.points as Record<string, unknown>;
      assert.equal(x._filters_ID, "antler=ANTLERLESS");
      assert.equal(x._filters_CO, "antler=ANTLERED&minPublic=50");
      assert.deepEqual(x.CO, { DEER: 8, ELK: 4 });
      assert.deepEqual(x._plan_CO, ["CO:DM070O2R"]);
      assert.equal(y._filters_ID, "antler=ALL");
      assert.equal(y._filters_CO, undefined);
    } finally {
      await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      await db.$disconnect();
    }
  },
);
