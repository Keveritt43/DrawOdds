import Link from 'next/link';
import { db } from '@/lib/db';
import { getResidency } from '@/lib/residency';
import { ResidencySwitch } from '@/components/ResidencySwitch';
import { NR_GENERAL_DRAW, CONTROLLED_DRAW, nextWindow, md } from '@/lib/applyInfo';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { residency } = await getResidency();
  const [hunts, controlled, units, oddsYears, accessYes] = await Promise.all([
    db.huntSummary.count(),
    db.huntSummary.count({ where: { type: 'CONTROLLED' } }),
    db.unit.count({ where: { geometry: { not: undefined } } }),
    db.drawOdds.findMany({ select: { year: true }, distinct: ['year'] }),
    db.accessYesProperty.aggregate({ _sum: { acres: true }, where: { active: true } }),
  ]);
  const yrs = oddsYears.map((y) => y.year);
  const nr = residency === 'NONRESIDENT';
  // the next application window that matters to this visitor
  const nextNr = nextWindow(NR_GENERAL_DRAW.windows);
  const nextCtl = nextWindow(CONTROLLED_DRAW.windows);
  const deadline = [nr && nextNr ? { what: `Nonresident general deer & elk tag draw (${NR_GENERAL_DRAW.season} season)`, ...nextNr } : null, nextCtl ? { what: 'Controlled hunt applications (deer, elk, pronghorn)', ...nextCtl } : null]
    .filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  const span = yrs.length ? `${Math.min(...yrs)}–${Math.max(...yrs)}` : '-';
  const opt = (name: string, value: string, label: string, checked = false) => (
    <label>
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      <span>{label}</span>
    </label>
  );

  return (
    <main>
      <section className="home-hero">
        <div className="inner">
          <div>
            <h1>
              Find Your Idaho Hunt. <em>Know Your Odds.</em>
            </h1>
            <p className="lead">
              Every Idaho deer, elk and pronghorn hunt in one place: draw odds for your residency, hunter success, how
              crowded it gets, public land and Access Yes! acres, on a map. Answer a few questions and we&apos;ll show you
              where to start.
            </p>
            {deadline && (
              <p className="deadline">
                {deadline.open ? 'Open now' : 'Next deadline'}: <b>{deadline.what}</b>, {md(deadline.start.toISOString().slice(0, 10))} – {md(deadline.end.toISOString().slice(0, 10), true)}.
              </p>
            )}
            <div className="ctas">
              <Link className="btn primary big" href="/hunts">Start Filtering</Link>
              <Link className="btn btn-light big" href="/map">Explore The Unit Map</Link>
            </div>
          </div>
          <form className="quick" action="/hunts" method="get">
            <h2>Quick Start</h2>
            <p className="small" style={{ color: '#a9b0a7', margin: 0 }}>Pick a few things. Refine everything else on the next page.</p>
            <label>I&apos;m Applying As</label>
            <ResidencySwitch value={residency} />
            <label>Species</label>
            <div className="opts">{opt('species', 'ELK', 'Elk', true)}{opt('species', 'DEER', 'Deer')}{opt('species', 'PRONGHORN', 'Pronghorn')}{opt('species', '', 'Any')}</div>
            <label>Hunt Type</label>
            <div className="opts">
              {opt('type', 'CONTROLLED', 'Controlled Draw', true)}
              {opt('type', 'GENERAL', nr ? 'General Tag (Draw For Nonresidents)' : 'General (Over The Counter)')}
              {opt('type', '', 'Either')}
            </div>
            <p className="hint">{nr
              ? 'Controlled hunts: limited tags, separate odds. General: since 2026 nonresidents draw for general deer and elk tags too (elk by zone, deer by unit). Pronghorn are controlled only.'
              : 'Controlled hunts: limited tags by draw, often better hunting. General: buy a tag over the counter and hunt the open seasons. Pronghorn are controlled only.'}</p>
            <label>What Are You After?</label>
            <div className="opts">{opt('antler', 'ANTLERED', 'A Buck Or Bull', true)}{opt('antler', '', 'Any Animal (Incl. Does / Cows)')}</div>
            <label>Weapon</label>
            <div className="opts">{opt('weapon', '', 'Any', true)}{opt('weapon', 'ANY', 'Rifle')}{opt('weapon', 'ARCHERY', 'Archery')}{opt('weapon', 'MUZZLELOADER', 'Muzzleloader')}</div>
            <label>I Want</label>
            <div className="opts">{opt('sort', 'best', 'Best Chance To Fill', true)}{opt('sort', 'densityLow', 'Fewer Hunters')}{opt('sort', 'big', 'Trophy Potential')}</div>
            <button className="btn primary" type="submit">Show Me Hunts</button>
          </form>
        </div>
      </section>

      <div className="wrap">
        <div className="tiles">
          <Link className="tile tone-blaze" href="/hunts?type=CONTROLLED&sort=odds">
            <span className="pill blaze">Draw Odds</span>
            <h3>Odds For Your Residency</h3>
            <p>Resident and nonresident first-choice odds, 5-year totals, and applicant trends, followed through IDFG&apos;s hunt renumbering.</p>
            <span className="go">Best odds →</span>
          </Link>
          <Link className="tile tone-sage" href="/hunts?sort=success">
            <span className="pill good">Harvest</span>
            <h3>Hunter Success</h3>
            <p>Five years of harvest per hunt and per unit, compared with the general season in the same ground.</p>
            <span className="go">Highest success →</span>
          </Link>
          <Link className="tile tone-larch" href="/hunts?species=DEER&deerType=MULE&antler=ANTLERED&sort=big">
            <span className="pill">Trophy</span>
            <h3>Mule Deer, Whitetail, Big Bulls</h3>
            <p>Mule deer vs whitetail share, 4+ point mule deer and 6+ point bulls, back-calculated from IDFG harvest reports.</p>
            <span className="go">Trophy hunts →</span>
          </Link>
          <Link className="tile tone-lake" href="/map">
            <span className="pill">Land</span>
            <h3>Public Land & Access Yes!</h3>
            <p>Public land and Access Yes! acres for every unit and hunt area, on a USGS topo or satellite map.</p>
            <span className="go">Open the map →</span>
          </Link>
        </div>
      </div>

      <section className="band dark">
        <div className="inner">
          <div>
            <h2>How To Find A Hunt</h2>
            <ol className="steps">
              <li>Set resident or nonresident. Every odds number on the site follows it.</li>
              <li>Answer Quick Start. You get a short list with the best mix of draw odds and hunter success on top.</li>
              <li>Each hunt says in plain words how its odds, success and crowding compare. Tap any label for what it means.</li>
              <li>Open a hunt for the application code, dates and 10-year trends, then save it to your list.</li>
            </ol>
          </div>
          <div className="bignums">
            <div><b>{hunts.toLocaleString()}</b><span>Hunt and unit combinations</span></div>
            <div><b>{controlled.toLocaleString()}</b><span>Controlled hunts</span></div>
            <div><b>{span}</b><span>Years of draw odds</span></div>
            <div><b>{accessYes._sum.acres ? `${Math.round(accessYes._sum.acres / 1000).toLocaleString()}k` : units}</b><span>{accessYes._sum.acres ? 'Access Yes! acres mapped' : 'Units mapped'}</span></div>
          </div>
        </div>
      </section>
    </main>
  );
}
