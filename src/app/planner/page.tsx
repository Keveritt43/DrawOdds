import { getState } from "@/lib/residency";
import { db } from "@/lib/db";
import { getPoints } from "@/lib/points";
import { poolFor, tableOdds, type OddsTable } from "@/lib/coHunt";
import { CoPlanner } from "@/components/CoPlanner";
import { getResidency } from '@/lib/residency';
import { plannerCosts, upcomingWindows } from '@/lib/applyInfo';
import { Planner } from '@/components/Planner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Application Planner', description: 'Plan your Idaho deer, elk and pronghorn applications: your choices in order, your real chance of drawing, cost and deadlines.' };

export default async function PlannerPage({ searchParams,
}: { searchParams: Promise<{ as?: string }>;
}) {
  const { residency, signedIn } = await getResidency((await searchParams).as);
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
        Put your choices in order and see your real chance of drawing, what it costs and when to apply. Idaho has <b>no preference or bonus points</b>: every year is a fresh random draw, so last year&apos;s odds are your odds and nothing carries over. {signedIn ? 'Your plan is saved to your account, so it follows you to any device.' : <>Your plan stays in this browser; <a href="/login">sign in</a> to keep it on every device.</>} Planning as a {nr ? 'nonresident' : 'resident'} (switch at the top).
      </p>
      <Planner nr={nr} windows={upcomingWindows().map((w) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() }))} costs={plannerCosts()} />
    </main>
  );
}
