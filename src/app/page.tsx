import { HomeStatePicker } from '@/components/HomeStatePicker';
import { MultiQuickStart } from '@/components/MultiQuickStart';
import { MtQuickStart } from '@/components/MtHome';
import { searchStates } from '@/lib/searchStates';
import { CoQuickStart } from '@/components/CoQuickStart';
import Link from 'next/link';
import { db } from '@/lib/db';
import { getResidency, getDraw, getState } from '@/lib/residency';
import { DrawSwitch } from '@/components/DrawSwitch';
import { Suspense } from 'react';
import { NR_GENERAL_DRAW, CONTROLLED_DRAW, MSG_DRAW, FEES, money, nextWindow, md } from '@/lib/applyInfo';

export const dynamic = 'force-dynamic';

// The layout's default title says Idaho; a Montana, Colorado or Wyoming home page says its own state.
const HOME_TITLE: Record<string, string> = {
  MT: 'DrawOdds Montana: Draw Odds For Deer, Elk And Antelope',
  CO: 'DrawOdds Colorado: Draw Odds For Deer, Elk, Pronghorn, Moose, Sheep And Goat',
  WY: 'DrawOdds Wyoming: Draw Odds For Deer, Elk And Antelope',
  UT: 'DrawOdds Utah: Draw Odds For Deer, Elk, Pronghorn And Bison',
};
export async function generateMetadata() {
  const t = HOME_TITLE[(await getState()).code];
  return t ? { title: { absolute: t } } : {};
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const current = (await getState()).code;
  const states = searchStates(params.states, current);
  if (states.length > 1) return <MultiQuickStart states={states} />;
  // Montana has no hunt rows, so the generic Quick Start would send the hunter to an empty search.
  if (states.length === 1 && states[0] === 'MT') return <MtQuickStart />;
  if ((await getState()).code === "CO") {
    return (
      <main><section className="home-hero"><div className="inner"><div>
        <h1>Find Your <HomeStatePicker selected={["CO"]} /> Hunt. Know Your Odds.</h1><p className="small">Tap the state name above to search one state or several.</p>
        <p>
          Research deer and elk licenses with preference-point scenarios,
          harvest estimates, hunter density and public/private ownership.
        </p>
        <p>
          <Link className="btn primary" href="/hunts">
            Find Colorado Hunts
          </Link>{" "}
          <Link className="btn" href="/hunts?states=CO&draw=msg">Moose, Sheep &amp; Goat</Link>{' '}
          <Link className="btn" href="/map">
            Colorado Unit Map
          </Link>{" "}
          <Link className="btn" href="/planner">
            Plan Choices
          </Link>
        </p>
        <h2>Research A Unit</h2>
        <p>
          Unit pages combine deer and elk draw recaps, drawn-out thresholds,
          secondary draws, harvest, population and OTC sales. Individual hunt
          pages show overlapping elk seasons and unit-season hunter counts.
        </p>
        <p>
          <Link href="/guide">How the Colorado Draw Works</Link> ·{" "}
          <Link href="/about">Data &amp; Methods</Link> ·{" "}
          <Link href="/changes">What Changed</Link>
        </p>
      </div><CoQuickStart /></div></section></main>
    );
  }
  // Idaho and Colorado are the only states with a home page of their own. Everything below queries Idaho rows and
  // says "Idaho" in the headline, so another state (Wyoming today) has to get the state-neutral page instead of
  // Idaho's content under its own name in the header.
  if (current !== 'ID') return <MultiQuickStart states={[current]} />;
  const [{ residency }, draw] = await Promise.all([getResidency(), getDraw()]);
  const msg = draw === 'MSG';
  const [hunts, controlled, units, oddsYears, accessYes] = await Promise.all([
    db.huntSummary.count({ where: { state: 'ID' } }),
    db.huntSummary.count({ where: { state: 'ID', type: 'CONTROLLED' } }),
    db.unit.count({ where: { state: 'ID', geometry: { not: undefined } } }),
    db.drawOdds.findMany({ select: { year: true }, distinct: ['year'] }),
    db.accessYesProperty.aggregate({ _sum: { acres: true }, where: { active: true } }),
  ]);
  const yrs = oddsYears.map((y) => y.year);
  const nr = residency === 'NONRESIDENT';
  const fees = FEES[residency];
  // the next application window that matters to this visitor
  const nextNr = nextWindow(NR_GENERAL_DRAW.windows);
  const nextCtl = nextWindow(CONTROLLED_DRAW.windows);
  const nextMsg = nextWindow(MSG_DRAW.windows);
  const deadline = (msg
    ? [nextMsg ? { what: 'Moose, bighorn sheep & mountain goat applications', ...nextMsg } : null]
    : [nr && nextNr ? { what: `Nonresident general deer & elk tag draw (${NR_GENERAL_DRAW.season} season)`, ...nextNr } : null, nextCtl ? { what: 'Controlled hunt applications (deer, elk, pronghorn)', ...nextCtl } : null])
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
              Find Your <HomeStatePicker selected={["ID"]} /> Hunt. <em>Know Your Odds.</em>
            </h1>
            <p className="small">Tap the state name above to search one state or several.</p><p className="lead">
              Every Idaho deer, elk, pronghorn, moose, bighorn sheep and mountain goat hunt in one place: draw odds for your residency, hunter success, how
              crowded it gets, public land and Access Yes! acres (IDFG\u2019s program that pays private landowners to open their ground to public hunting), on a map. Answer a few questions and we&apos;ll show you
              where to start.
            </p>
            {deadline && (
              <p className="deadline">
                {deadline.open ? 'Open now' : 'Next deadline'}: <b>{deadline.what}</b>, {md(deadline.start.toISOString().slice(0, 10))} – {md(deadline.end.toISOString().slice(0, 10), true)}.
              </p>
            )}
            {/* The first UAT question nobody could answer from this page: what does it cost? Itemised, never totalled -
                the licence is annual and covers every hunt that year. */}
            <p className="small">
              <b>What it costs ({nr ? 'nonresident' : 'resident'}; fee schedule checked {FEES.checked}):</b> {msg
                ? <>licence {money(fees.license)} plus the {money(fees.accessFee)} access fee, {money(fees.msgApp)} to apply, and the full tag fee up front ({money(fees.tag.MOOSE)} for moose, sheep or goat alike), refunded if you don&apos;t draw.</>
                : <>licence {money(fees.license)} plus the {money(fees.accessFee)} access fee, then {money(fees.controlledApp)} an application. Tags are extra{nr ? ' and only if you draw' : ''}: deer {money(fees.tag.DEER)}, elk {money(fees.tag.ELK)}, pronghorn {money(fees.tag.PRONGHORN)}.</>}
              {' '}<Link href="/guide">Fees and deadlines in full</Link>
            </p>
            {/* The one thing a hunter from a points state has to unlearn before the numbers here mean anything. */}
            <p className="small">
              <b>Idaho has no preference or bonus points.</b> Each draw is random; recent odds describe past results, not a guarantee of future odds.{' '}
              <Link href="/guide">How the Idaho draw works</Link>
            </p>
            <div className="ctas">
              <Link className="btn primary big" href="/hunts">Start Filtering</Link>
              <Link className="btn btn-light big" href="/map">Explore The Unit Map</Link>
            </div>
          </div>
          <form className="quick" action="/hunts" method="get">
            <h2>Quick Start</h2>
            <p className="small" style={{ color: '#a9b0a7', margin: 0 }}>Pick a few things. Refine everything else on the next page.</p>
            <p className="hint">Currently searching as <b>{nr ? 'nonresident' : 'resident'}</b>. <Link href="/account#hunting-preferences">Change residency in Account</Link> to see your prices and odds.</p>
            <label>Which Drawing</label>
            <Suspense fallback={null}><DrawSwitch value={draw} /></Suspense>
            <p className="hint">Idaho applicants pick one each year: deer, elk and pronghorn (May 1 – June 5), or one of moose, bighorn sheep or mountain goat (April 1 – 30).</p>
            {!msg && (
              <>
                <label>Hunt Type</label>
                <div className="opts">
                  {opt('type', 'CONTROLLED', 'Controlled Draw', true)}
                  {opt('type', 'GENERAL', nr ? 'General Tag (Draw For Nonresidents)' : 'General (Over The Counter)')}
                  {opt('type', '', 'Either')}
                </div>
                <p className="hint">{nr
                  ? 'Controlled hunts: limited tags, separate odds. General: since 2026 nonresidents draw for general deer and elk tags too (elk by zone, deer by unit). Pronghorn are controlled only.'
                : 'Controlled hunts: limited tags by draw. Residents buy general tags over the counter; nonresidents apply in a separate general deer and elk draw. Pronghorn are controlled only.'}</p>
              </>
            )}
            <label>Species</label>
            {msg
              ? <div className="opts">{opt('species', 'MOOSE', 'Moose', true)}{opt('species', 'BIGHORN', 'Bighorn Sheep')}{opt('species', 'GOAT', 'Mountain Goat')}{opt('species', '', 'Compare All Three')}</div>
              : <div className="opts">{opt('species', 'ELK', 'Elk', true)}{opt('species', 'DEER', 'Deer')}{opt('species', 'PRONGHORN', 'Pronghorn')}{opt('species', '', 'Any')}</div>}
            {!msg && (
              // shown only while Deer is picked (CSS :has), no script needed
              <div className="deer-type">
                <label>Type Of Deer</label>
                <div className="opts">{opt('deerType', '', 'Either', true)}{opt('deerType', 'MULE', 'Mule Deer')}{opt('deerType', 'WHITETAIL', 'Whitetail')}</div>
              </div>
            )}
            <label>What Are You After?</label>
            <div className="opts">
              {opt('antler', 'ANTLERED', msg ? 'Antlered (Bull Or Ram)' : 'A Buck Or Bull (Incl. Either-Sex Hunts)', true)}
              {opt('antler', '', msg ? 'Any (Incl. Cows / Ewes)' : 'Any Animal (Incl. Does / Cows)')}
            </div>
            <label>Weapon</label>
            <div className="opts">{opt('weapon', '', 'Any', true)}{opt('weapon', 'ANY', 'Rifle')}{opt('weapon', 'ARCHERY', 'Archery')}{opt('weapon', 'MUZZLELOADER', 'Muzzleloader')}</div>
            <label>I Want</label>
            <div className="opts">
              {opt('sort', 'odds', 'Best Chance To Get A Tag', true)}
              {opt('sort', 'success', 'Highest Harvest Rate')}
              {opt('sort', 'best', 'Best Mix Of Both')}
              {opt('sort', 'score', 'Best Overall Hunt (DrawOdds Score)')}
              {opt('sort', 'densityLow', 'Fewer Hunters')}
              {opt('sort', 'big', msg ? 'Biggest Antlers / Horns' : 'Trophy Potential')}
            </div>
            <button className="btn primary" type="submit">Show Me Hunts</button>
          </form>
        </div>
      </section>

      <div className="wrap">
        <div className="tiles">
          {/* The beginner's question is "can I just get a tag this year?". Idaho's answer differs by residency:
              residents buy general tags over the counter, nonresidents have drawn for them since 2026. Neither is
              an over-the-counter promise to a nonresident, so the tile never calls one guaranteed. */}
          {!msg && (
            <Link className="tile tone-sage" href="/hunts?type=GENERAL&sort=odds">
              <span className="pill good">General</span>
              <h3>General Deer And Elk Tags</h3>
              <p>{nr
                ? <>General deer and elk tags. Nonresidents apply for these{nextNr ? ` (${md(nextNr.start.toISOString().slice(0, 10))} – ${md(nextNr.end.toISOString().slice(0, 10))})` : ''}, but plenty of them go to everyone who asks. Sorted by the best chance first.</>
                : <>Residents buy general tags over the counter; nonresidents apply for a general tag in a separate draw. Availability can be limited.</>}</p>
              <span className="go">{nr ? 'Best general tag odds →' : 'See general tags →'}</span>
            </Link>
          )}
          <Link className="tile tone-blaze" href="/hunts?type=CONTROLLED&sort=odds">
            <span className="pill blaze">Draw Odds</span>
            <h3>Odds For Your Residency</h3>
            <p>Resident and nonresident first-choice odds, 5-year totals, and applicant trends, followed through even when IDFG changes a hunt&apos;s number.</p>
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
              <li>Set your residency in <Link href="/account#hunting-preferences">Account</Link> to personalize your draw odds.</li>
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
