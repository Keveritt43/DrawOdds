import { getResidency } from '@/lib/residency';
import { NR_COSTS, upcomingWindows } from '@/lib/applyInfo';
import { Planner } from '@/components/Planner';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Application Planner', description: 'Plan your Idaho deer, elk and pronghorn applications: your choices in order, your real chance of drawing, cost and deadlines.' };

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { residency, signedIn } = await getResidency((await searchParams).as);
  const nr = residency === 'NONRESIDENT';
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Application Planner</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        Put your choices in order and see your real chance of drawing, what it costs and when to apply. Idaho has <b>no preference or bonus points</b>: every year is a fresh random draw, so last year&apos;s odds are your odds and nothing carries over. {signedIn ? 'Your plan is saved to your account, so it follows you to any device.' : <>Your plan stays in this browser; <a href="/login">sign in</a> to keep it on every device.</>} Planning as a {nr ? 'nonresident' : 'resident'} (switch at the top).
      </p>
      <Planner nr={nr} windows={upcomingWindows().map((w) => ({ ...w, start: w.start.toISOString(), end: w.end.toISOString() }))} costs={NR_COSTS} />
    </main>
  );
}
