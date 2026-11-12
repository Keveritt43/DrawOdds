import Link from 'next/link';
import { MtCombo } from '@/components/MtCombo';
import { getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { MT_SOURCE, mtLicense, mtLatestYear, mtRandomShare, mtYears } from '@/lib/mtOdds';

export const metadata = {
  title: 'Montana: The Nonresident Combination Draw',
  description:
    'Montana nonresident Big Game, Elk and Deer Combination license draw odds by preference point level, from FWP’s published results. Why one point can be worse than none.',
};

export default async function MontanaPage() {
  const mt = readMtPoints((await getPointsStore()).store);
  // only a nonresident's saved combination balance means anything here
  const saved = mt.set && mt.res === 'NONRESIDENT' ? mt.combo : null;
  const year = mtLatestYear('biggame-elk');
  const randomShare = mtRandomShare('biggame-elk');
  const lo = mtLicense('biggame-elk-landowner');
  const years = mtYears('biggame-elk');
  const firstYear = years[years.length - 1];
  const src = MT_SOURCE as { listing: string; retrieved: string; agency: string };

  return (
    <main className="wrap" style={{ maxWidth: 900, margin: '24px auto 48px' }}>
      <h1>Montana: The Nonresident Combination Draw</h1>
      <p className="lead-sum">
        A nonresident cannot buy a Montana deer or elk license over the counter. You first have to draw a{' '}
        <b>combination license</b>, and that draw works unlike any other state here: <b>holding one or two preference points can
        leave you with no chance at all</b>, while holding none gives you better than a coin flip.
      </p>

      <div className="card" style={{ background: 'rgba(235,104,52,.10)' }}>
        <h2 style={{ marginTop: 0 }}>Read this before you buy a point</h2>
        <ol style={{ marginBottom: 0 }}>
          <li>Three quarters of the licenses go to the applicants with the <b>most</b> points, highest first, until they run out.</li>
          <li>The last quarter is drawn at random — but <b>only among applicants holding zero points</b>.</li>
          <li>So if you hold points but not enough to clear the cutoff, you lose twice: you miss the points phase, and you are
            not eligible for the random one. That is a <b>0% chance</b>, not a long shot.</li>
        </ol>
      </div>

      <h2>What it took, and what you have</h2>
      <p className="small muted">Pick your point balance to see where you would have landed in the {year} draw, and what the {years.length} draws before it did.</p>
      <MtCombo saved={saved} />

      {lo && (
        <section style={{ marginBottom: 28 }}>
          <h2>Nonresident landowner priority pool</h2>
          <p className="small">
            Nonresident landowners draw in a separate pool. In {year} every applicant in it drew, at every point level that had
            applicants — {lo.years[String(year)].totalApps} applications in all. There is no cutoff and no dead zone here.
          </p>
        </section>
      )}

      <h2>What this page does not cover</h2>
      <ul>
        <li>
          <b>Permits, antelope and B licenses.</b> They use uncapped, squared <i>bonus</i> points, a different system:
          each hunt&apos;s page shows its odds at your bonus points. <Link href="/hunts?states=MT">Find Montana hunts</Link>.
        </li>
        <li>
          <b>Next year&apos;s odds.</b> This draw is shown as it last drew. We tested forecasts of it against the 2023&ndash;2026
          draws and none beat simply using the year before (docs: mt-onboarding §19). The Fish and Wildlife Commission also
          withheld roughly 2,500 nonresident general deer licenses for the 2026&ndash;2027 seasons, so older draws are not a
          safe guide to the deer combination.
        </li>
      </ul>

      <h2>Where these numbers come from</h2>
      <p className="small muted">
        {src.agency} <a href={src.listing} rel="nofollow">drawing statistics</a>, the {firstYear}&ndash;{year} reports
        (checked {src.retrieved}). Applicant counts are first choices. Each report restates the previous year, and where two
        reports cover the same draw they agree exactly. The share drawn at random comes to{' '}
        {randomShare == null ? 'about a quarter' : `${(randomShare * 100).toFixed(1)}%`} of the licenses, matching the 75/25 rule
        in every draw back to {firstYear}. Two of FWP&apos;s own printed totals do not quite close (2023 big game is 90 applicants
        short, 2021 deer by one) and are shown as published. Licenses and fees change; check FWP before applying.{' '}
        <Link href="/guide">How the Montana draw works</Link> · <Link href="/hunts?states=MT">Find Montana hunts</Link>
      </p>
    </main>
  );
}
