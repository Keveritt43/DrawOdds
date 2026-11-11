import Link from 'next/link';
import { HomeStatePicker } from './HomeStatePicker';
import { mtComboOdds, mtCutoff, mtLatestYear, mtPointsToDraw } from '@/lib/mtOdds';

/**
 * Montana's home panel and its Find Hunts notice.
 *
 * Montana is in the state picker for one thing: the nonresident combination draw, which a nonresident has to
 * win before hunting deer or elk there at all. It has no hunt, unit, harvest or land rows yet, so neither of
 * these surfaces pretends otherwise — the point of both is to send the hunter to /montana rather than to an
 * empty result set. See docs/states/mt-onboarding.md.
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

export function MtQuickStart() {
  return (
    <main>
      <section className="home-hero">
        <div className="inner">
          <div>
            <h1>Find Your <HomeStatePicker selected={['MT']} /> Hunt. <em>Know Your Odds.</em></h1>
            <p className="small">Tap the state name above to search one state or several.</p>
            <p>
              Montana works differently from the other states here. A nonresident cannot buy a deer or elk license
              over the counter — you first have to draw a <b>combination license</b>, and that one draw decides
              whether you hunt at all.
            </p>
            <DeadZoneLine />
            <p className="small">
              <Link href="/montana">See the Montana combination draw, six years of it</Link>
            </p>
          </div>
          <div className="quick">
            <h2>What Montana has here so far</h2>
            <ul>
              <li><b>The nonresident combination draw</b> — Big Game / Elk and Deer, with odds at your point balance and what each of the last six draws took.</li>
              <li><b>Not yet:</b> hunting districts, harvest and public land, so Montana has no rows in Find Hunts.</li>
              <li><b>Not yet:</b> permits and B licenses (antelope, Deer B, Elk B), which use a separate bonus-point system.</li>
            </ul>
            <p className="hint">Nothing here is a forecast. Every number is a past draw, labelled with its year.</p>
            <Link className="btn primary" href="/montana">Open the Montana draw</Link>
          </div>
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
        Montana&apos;s hunting districts, harvest estimates and public-land figures are not loaded, so it contributes
        no rows here{only ? '' : ' — the results below are the other states you selected'}. What Montana does have is
        the draw that decides whether a nonresident hunts there at all.
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
        Montana is in DrawOdds for its nonresident combination draw. This page is built on hunt and unit data,
        and Montana&apos;s districts, harvest and public land are not loaded — so rather than show you another
        state&apos;s rules under a Montana heading, there is nothing here.
      </p>
      <p><Link className="btn" href="/montana">Montana: the nonresident combination draw</Link></p>
    </div>
  );
}
