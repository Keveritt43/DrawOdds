import { WaPlannerPage } from "@/components/WaPages";
import { MtPlanner, type MtPlanOpt, type MtPlanApp } from "@/components/MtPlanner";
import { UtPlannerPage } from "@/components/UtPages";
import { readMtPoints, mtCombo } from "@/lib/mtPoints";
import { getPointsStore } from "@/lib/points";
import { mtPersonal, mtDistricts, type MtPointOdds } from "@/lib/mtHunt";
import { mtAppOf, mtDay, MT_APPS, MT_CHOICES, MT_DATES_YEAR } from "@/lib/mtPlan";
import { mtComboOdds, mtOddsLabel, mtLatestYear } from "@/lib/mtOdds";
import { huntHref } from "@/lib/huntSlug";
import { MT_COMBO_PRICE, MT_DRAW_PRICE, MT_PREF_POINT, MT_BONUS_POINT, MT_REFUND_MAILED, MT_PREREQ, MT_FEES_YEAR, MT_FEES_SOURCE } from "@/lib/mtFees";
import Link from "next/link";
import { getState } from "@/lib/residency";
import { db } from "@/lib/db";
import { getPoints } from "@/lib/points";
import { poolFor, tableOdds, type OddsTable } from "@/lib/coHunt";
import { CoPlanner } from "@/components/CoPlanner";
import { getResidency } from '@/lib/residency';
import { plannerCosts, upcomingWindows } from '@/lib/applyInfo';
import { Planner } from '@/components/Planner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Application Planner', description: 'Plan your Idaho deer, elk and pronghorn applications: your choices in order, estimated drawing chances, cost and deadlines.' };

export default async function PlannerPage({ searchParams,
}: { searchParams: Promise<{ as?: string }>;
}) {
  const { residency, signedIn } = await getResidency((await searchParams).as);
  if ((await getState()).code === "MT") return <MtPlannerPage signedIn={signedIn} />;
  if ((await getState()).code === "UT") return <UtPlannerPage />;
  if ((await getState()).code === "WA") return <WaPlannerPage />;
  if ((await getState()).code === "CO") {
    const pts = await getPoints("CO"),
      pool = poolFor(pts.res === "NONRESIDENT", pts.youth);
    const rows = await db.huntSummary.findMany({
      where: { state: "CO", type: "CONTROLLED" },
      orderBy: [{ species: "asc" }, { tagCode: "asc" }],
    });
    const hunts = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      species: r.species,
      code: r.tagCode,
      odds: tableOdds(
        r.oddsByPts as unknown as OddsTable,
        "proj",
        pool,
        pts[r.species === 'PRONGHORN' ? 'PRONGHORN' : r.species === 'ELK' ? 'ELK' : 'DEER'],
      ),
      success: r.success5,
      second: r.secondChoice,
    }));
    return (
      <main className="wrap" style={{ margin: "24px auto 48px" }}>
        <h1>Colorado Application Planner</h1>
        <CoPlanner hunts={hunts} signedIn={signedIn} />
      </main>
    );
  }
  const nr = residency === 'NONRESIDENT';
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        Put your choices in order and see estimated drawing chances, costs and deadlines. Idaho has <b>no preference or bonus points</b>: every year is a fresh random draw. Past odds can change as applications and quotas change; they are not a guarantee. {signedIn ? 'Your plan is saved to your account, so it follows you to any device.' : <>Your plan stays in this browser; <a href="/login">sign in</a> to keep it on every device.</>} Planning as a {nr ? 'nonresident' : 'resident'} (switch at the top).
      </p>
      <Planner nr={nr} windows={upcomingWindows().map((w) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() }))} costs={plannerCosts()} />
    </main>
  );
}

/** Montana: every application a hunter files in a year, with their choices and odds at their saved points. */
async function MtPlannerPage({ signedIn }: { signedIn: boolean }) {
  const [store, rows] = await Promise.all([
    getPointsStore(),
    db.huntSummary.findMany({ where: { state: 'MT', type: 'CONTROLLED' }, orderBy: [{ tagCode: 'asc' }] }),
  ]);
  const pts = readMtPoints(store.store as Record<string, unknown>);
  const nr = pts.res === 'NONRESIDENT';
  const opts: MtPlanOpt[] = [];
  for (const r of rows) {
    const po = r.pointOdds as unknown as MtPointOdds | null;
    const app = mtAppOf(po);
    if (!app || !r.tagCode) continue;
    const m = mtPersonal(r, pts, nr);
    opts.push({
      id: r.id, href: huntHref(r), name: r.name, code: r.tagCode, where: mtDistricts(r.units, 3), app,
      odds: m.parts ? m.parts.permit : m.odds, both: m.parts ? m.odds : null,
      second: r.secondDrewLast, secondApps: r.secondAppsLast, basis: m.basis,
    });
  }
  const apps: MtPlanApp[] = MT_APPS.filter((a) => nr || !a.nrOnly).map((a) => ({
    key: a.key, label: a.label, deadline: a.deadline, day: mtDay(a.deadline), results: a.results, what: a.what,
    points: a.key === 'COMBO' ? pts.combo : pts.bonus[a.key], buying: a.key === 'COMBO' ? true : pts.buying[a.key],
    nrNeedsCombo: a.key === 'DEER_PERMIT' || a.key === 'ELK_PERMIT',
    price: a.key === 'COMBO' ? MT_COMBO_PRICE[pts.comboType] : (nr ? MT_DRAW_PRICE[a.key].nr : MT_DRAW_PRICE[a.key].res),
    pointFee: a.key === 'COMBO' ? MT_PREF_POINT : MT_BONUS_POINT[nr ? 'nr' : 'res'],
    refunded: a.key === 'COMBO' ? true : MT_DRAW_PRICE[a.key].refundable,
    refundMailed: MT_REFUND_MAILED[a.key],
  }));
  const c = mtCombo(pts.comboType);
  const co = nr ? mtComboOdds(c.draw, Math.min(3, pts.combo)) : null;
  const year = Math.max(...rows.map((r) => r.oddsLastYear ?? 0)) || MT_DATES_YEAR;
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Montana Application Planner</h1>
      <MtPlanner opts={opts} apps={apps} nr={nr} signedIn={signedIn} set={pts.set} year={year} choices={MT_CHOICES}
        fees={{ prereq: [...MT_PREREQ[nr ? 'nr' : 'res']], year: MT_FEES_YEAR, source: MT_FEES_SOURCE }}
        combo={nr ? { name: c.label, points: pts.combo, odds: co?.odds ?? null, label: mtOddsLabel(co), year: co?.year ?? mtLatestYear(c.draw) } : null} />
      <p className="small muted">Deadlines are FWP&apos;s {MT_DATES_YEAR} dates; FWP hadn&apos;t posted {MT_DATES_YEAR + 1} dates yet. <Link href="/guide">How the Montana draw works</Link> · <Link href="/changes">What changed since last year</Link></p>
    </main>
  );
}
