import Link from 'next/link';
import { MtCombo } from '@/components/MtCombo';
import { MT_SOURCE, mtLicense, mtLatestYear, mtRandomShare } from '@/lib/mtOdds';

export const metadata = {
  title: 'Montana: The Nonresident Combination Draw',
  description:
    'Montana nonresident Big Game, Elk and Deer Combination license draw odds by preference point level, from FWP’s published results. Why one point can be worse than none.',
};

export default function MontanaPage() {
  const year = mtLatestYear('biggame-elk');
  const randomShare = mtRandomShare('biggame-elk');
  const lo = mtLicense('biggame-elk-landowner');
  const src = MT_SOURCE as { title: string; url: string; retrieved: string; agency: string };

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
      <p className="small muted">Pick your point balance to see where you would have landed in the {year} draw.</p>
      <MtCombo />

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
          <b>Montana permits and B licenses</b> — antelope, Deer B, Elk B, and the deer and elk permits that restrict where you
          may use a general license. Those use a completely different system: uncapped <i>bonus</i> points that are squared. They
          are not modelled yet.
        </li>
        <li>
          <b>Next year&apos;s odds.</b> Everything here is the last draw, not a forecast. The Fish and Wildlife Commission withheld
          roughly 2,500 nonresident general deer licenses for the 2026&ndash;2027 seasons, so the recent trend is not a safe guide,
          and no projection has been backtested.
        </li>
        <li>
          <b>Hunt-by-hunt odds, harvest and units.</b> A combination license is statewide; it is the ticket to hunt, not a
          particular hunt. Montana districts are not in Find Hunts yet.
        </li>
      </ul>

      <h2>Where these numbers come from</h2>
      <p className="small muted">
        {src.agency}, <a href={src.url} rel="nofollow">{src.title}</a> (checked {src.retrieved}). Applicant counts are first choices.
        Every level&apos;s applicants sum to the total the report prints, and the share drawn at random comes to{' '}
        {randomShare == null ? 'about a quarter' : `${(randomShare * 100).toFixed(1)}%`} of the licenses, matching the 75/25 rule.
        Licenses and fees change; check FWP before applying. <Link href="/guide">How Idaho&apos;s draw works</Link> ·{' '}
        <Link href="/hunts">Find Hunts</Link>
      </p>
    </main>
  );
}
