import Link from 'next/link';
import { HomeStatePicker } from './HomeStatePicker';
import { mtComboOdds, mtCutoff, mtLatestYear, mtPointsToDraw } from '@/lib/mtOdds';
import { db } from '@/lib/db';
import { SharedQuickStartForm } from './MultiQuickStart';

/**
 * Montana's home panel and its Find Hunts notice.
 *
 * Both surfaces follow what is actually loaded. Before Montana's hunt rows are imported (scripts/mt-import.ts),
 * they say Montana has only the nonresident combination draw and send the hunter to /montana rather than to an
 * empty result set; once rows exist, the home panel describes them and the Find Hunts notice is not shown
 * (MultiStateFinder checks the state's row count). See docs/states/mt-onboarding.md.
 */

function DeadZoneLine() {
  const year = mtLatestYear('biggame-elk');
  const cut = mtCutoff('biggame-elk');
  const zero = mtComboOdds('biggame-elk', 0)?.odds;
  const needed = mtPointsToDraw('biggame-elk');
  if (!cut || zero == null || needed == null) return null;
  return (
    <p>
      In the {year} draw it took <b>{needed}</b> preference points to be sure of a Big Game / Elk combination.
      Anyone holding <b>some</b> points but fewer than {cut.label} drew <b>nothing</b>, while applicants with
      no points at all drew at <b>{(zero * 100).toFixed(1)}%</b> — the quarter of licenses held back for them.
    </p>
  );
}

export async function MtQuickStart() {
  const hunts = await db.huntSummary.count({ where: { state: 'MT' } }).catch(() => 0);
  return (
    <main>
      <section className="home-hero">
        <div className="inner">
          <div>
            <h1>Find Your <HomeStatePicker selected={['MT']} /> Hunt. <em>Know Your Odds.</em></h1>
            <p className="small">Tap the state name above to search one state or several.</p>
            <p>
              For a general deer or elk hunt, a nonresident first draws a <b>combination license</b>.
              Some additional B licenses are sold over the counter; check their own eligibility and rules.
            </p>
            <DeadZoneLine />
            <p className="small">
              <Link href="/montana">See the Montana combination draw, six years of it</Link> · <Link href="/guide">Draw rules and 2026 fees</Link> · <Link href="/map">Explore the district map</Link>
            </p>
          </div>
          {hunts ? <SharedQuickStartForm states={['MT']} /> : <div className="quick">
            <h2>What Montana has here so far</h2>
            {hunts ? <ul>
              <li><b>Deer, elk and antelope in every hunting district</b> — general licenses, permits, antelope licenses and B licenses ({hunts} in all), with seasons and restrictions from the 2026 regulations.</li>
              <li><b>Odds at your points</b> — drawn licenses at your bonus points for that license type, if you buy a point this year; the combination draw at your preference points. Antelope needs no combination license, even for a nonresident.</li>
              <li><b>Hunter success</b> from FWP&apos;s surveyed seasons, by district.</li>
              <li><b>Public land</b> in every district, from BLM&apos;s ownership map.</li>
              <li><b>Over-the-counter B licenses</b> — the unlimited whitetail and elk B licenses FWP sells from June 15, with their fees.</li>
            </ul> : <ul>
              <li><b>The nonresident combination draw</b> — Big Game / Elk and Deer, with odds at your point balance and what each of the last six draws took.</li>
              <li><b>Not yet:</b> hunting districts, harvest and public land, so Montana has no rows in Find Hunts.</li>
              <li><b>Not yet:</b> permits and B licenses (antelope, Deer B, Elk B), which use a separate bonus-point system.</li>
            </ul>}
            <p className="hint">Permits, antelope and B licenses default to a next-draw projection (FWP&apos;s weighted draw re-run on the last draw, tested on 2024–2026); the combination draw is shown as it last drew.</p>
            {hunts ? <Link className="btn primary" href="/hunts?states=MT&antler=ANTLERED&sort=opp">Find Montana hunts</Link> : null}{' '}
            <Link className={`btn${hunts ? '' : ' primary'}`} href="/montana">Open the Montana draw</Link>
          </div>}
        </div>
      </section>
    </main>
  );
}

/** Shown in Find Hunts whenever Montana is one of the selected states. */
export function MtFinderNotice({ only }: { only: boolean }) {
  return (
    <div className="ucard">
      <h2>Montana is not in Find Hunts yet</h2>
      <p>
        Montana&apos;s district boundaries and harvest estimates are in, but its hunt list isn&apos;t built yet: which
        districts are general and which need a permit, and the permit draw odds from FWP&apos;s reports. Until then it
        contributes no rows here{only ? '' : ' — the results below are the other states you selected'}. What Montana does have now is the draw that decides whether a
        nonresident hunts there at all.
      </p>
      <p><Link className="btn" href="/montana">Montana: the nonresident combination draw</Link></p>
    </div>
  );
}

/**
 * Shown on the pages that are built around Idaho's (or Colorado's) data when the header state is Montana.
 * Without it those pages serve Idaho's draw rules, deadlines and change log under a Montana banner — the
 * same fault PR #57 fixed for Wyoming on the home page.
 */
export function MtElsewhere({ what }: { what: string }) {
  return (
    <div className="ucard">
      <h2>{what} does not cover Montana yet</h2>
      <p>
        This page is built on another state&apos;s draw rules and data and has no Montana version yet, so rather
        than show you that state&apos;s rules under a Montana heading, there is nothing here. Montana&apos;s hunts,
        odds, harvest and public land are in Find Hunts and on each district&apos;s page.
      </p>
      <p><Link className="btn" href="/montana">Montana: the nonresident combination draw</Link></p>
    </div>
  );
}

/** Data & Methods for Montana: where each number comes from (the Idaho page credits IDFG, so it can't be shown). */
export function MtAbout() {
  return (
    <main className="wrap" style={{ maxWidth: 820, margin: '24px auto 48px' }}>
      <div className="card">
        <h1>Where Montana&apos;s Numbers Come From</h1>
        <p>Everything here is public Montana Fish, Wildlife &amp; Parks (FWP) and BLM data. This site is not affiliated with or endorsed by FWP. Seasons and rules change; always confirm in the current FWP regulations before you apply or hunt.</p>
        <ul>
          <li><b>Draw odds:</b> FWP&apos;s drawing statistics, 2021–2026: detailed bonus-point reports for permits, antelope and B licenses, and the nonresident combination reports (2018–2026). Permit, antelope and B license odds default to a next-draw projection: FWP&apos;s weighted draw (points² + 1 chances) re-run on the last draw&apos;s applicants and licenses, which beat the year before&apos;s printed rates on every 2024–2026 draw. The combination draw is the last draw: no forecast of it beat that.</li>
          <li><b>Seasons, quotas and restrictions:</b> the 2026 Deer, Elk &amp; Antelope regulations, district by district.</li>
          <li><b>Harvest, success and crowding:</b> FWP&apos;s harvest estimates by district. FWP surveys deer in odd years and elk and antelope in even years, so only surveyed seasons count, and only when the district had the same boundary as today (FWP&apos;s past-years district maps).</li>
          <li><b>Land:</b> BLM&apos;s Surface Management Agency map, measured over each district on a 100 m equal-area grid. Block Management acres from FWP&apos;s 2026–27 maps and guide.</li>
          <li><b>Districts:</b> FWP&apos;s hunting district maps. Deer and elk share districts; antelope districts are different ground.</li>
        </ul>
        <p className="small muted">Method details: docs/states/mt-onboarding.md in the DrawOdds repository.</p>
        <p><Link className="btn" href="/hunts?states=MT">Find Montana hunts</Link> <Link className="btn" href="/montana">The combination draw</Link></p>
      </div>
    </main>
  );
}
