import { WaGuide } from "@/components/WaPages";
import { MtGuide } from "@/components/MtPages";
import { UtGuide } from "@/components/UtPages";
import { CoGuide } from "@/components/CoPages";
import { getState } from "@/lib/residency";
import Link from 'next/link';
import { NR_GENERAL_DRAW, CONTROLLED_DRAW, MSG_DRAW, FEES, md, money } from '@/lib/applyInfo';

export const metadata = { title: "How The Draw Works",
  description: 'Idaho deer, elk, pronghorn, moose, sheep and goat draws for residents and nonresidents: no points, choice order, nonresident limits, leftovers and strategy.',
};

export default async function GuidePage() {
  if ((await getState()).code === "CO") return <CoGuide />;
  if ((await getState()).code === "MT") return <MtGuide />;
  if ((await getState()).code === "UT") return <UtGuide />;
  if ((await getState()).code === "WA") return <WaGuide />;
  if ((await getState()).code === 'WY') return <main className="wrap" style={{ maxWidth: 860, margin: '24px auto 48px' }}>
    <h1>How The Wyoming Draw Works</h1>
    <p>For nonresident deer, elk and antelope, choose either the regular or the higher-priced special pool. Each has its own quota and draw odds. Wyoming awards most licenses by preference points and the remaining share in a random draw among eligible applicants who did not draw in the preference round.</p>
    <p>Preference points apply to the first choice. General deer licenses are drawn by nonresidents for a region; residents buy a general license over the counter. Check the current seasons and area restrictions before applying.</p>
    <p>DrawOdds labels the last draw and projections separately. An estimated chance is not a guarantee, and random-draw odds may be estimated when WGFD does not publish the necessary result.</p>
    <h2>Costs And Next Steps</h2><p>Fees depend on species and the regular or special pool. WGFD charges the license price and application fee when you apply; check its refund rules and the conservation stamp requirement. Costs can change, so use the current agency schedule for the complete amount.</p>
    <p><a href="https://wgfd.wyo.gov/licenses-applications/application-process">WGFD application process</a> · <a href="https://wgfd.wyo.gov/licenses-applications/license-fee-list">License fees</a> · <a href="https://wgfd.wyo.gov/licenses-applications/application-dates-deadlines">Application dates</a> · <Link href="/hunts?states=WY">Find Wyoming hunts</Link></p>
  </main>;
  const g = NR_GENERAL_DRAW.windows;
  const c = CONTROLLED_DRAW.windows;
  return (
    <main className="wrap" style={{ maxWidth: 860, margin: '24px auto 48px' }}>
      <h1>How The Idaho Draw Works</h1>
      <p className="lead-sum">The short version: <b>Idaho has no preference or bonus points.</b> Every draw is random. Recent odds describe past results and can change as applications and quotas change; skipping a year does not cost points.</p>

      <h2>The Three Drawings</h2>
      <ol>
        <li><b>Nonresident general deer and elk tags</b> (since 2026): {md(g[0].start, true)} – {md(g[0].end, true)}, second period {md(g[1].start)} – {md(g[1].end)}. Residents buy these over the counter.</li>
        <li><b>Controlled hunts: deer, elk, pronghorn</b>: {md(c[0].start)} – {md(c[0].end)} every year, with a second drawing for leftover tags {md(c[1].start)} – {md(c[1].end)}.</li>
        <li><b>Moose, bighorn sheep, mountain goat</b>: {md(MSG_DRAW.windows[0].start)} – {md(MSG_DRAW.windows[0].end)}. Apply for one of the three only, and that keeps you out of the deer, elk and pronghorn controlled drawings that year (leftovers aside).</li>
      </ol>
      <p className="small"><a href="/api/calendar">Add every deadline to your calendar (.ics)</a> · <Link href="/planner">Plan your applications</Link></p>

      <h2>Nonresident General Tags: How Your 5 Choices Work</h2>
      <ul>
        <li>Buy the year&apos;s Idaho hunting license first ({money(FEES.NONRESIDENT.license)}, nonrefundable), then one elk application and one deer application, each with up to five tag choices in order ({NR_GENERAL_DRAW.fee}).</li>
        <li>Every application gets a random number. IDFG fills <b>all 1st choices first</b>, then 2nd choices for those still without a tag, and so on. A tag that runs out on 1st choices never reaches anyone&apos;s 2nd.</li>
        <li>So a later choice only helps if that tag had tags left after the earlier rounds. Every tag card here says whether it &ldquo;works as a backup pick&rdquo; (tags reached 2nd-5th choices) or &ldquo;filled on 1st choices&rdquo;. Filling your 2-5 slots with tags that fill on 1st choices wastes them.</li>
        <li>Elk tags are by zone (an A or a B tag, each with its own seasons); deer by unit (Regular or White-tailed). Groups of up to 4 draw all-or-nothing.</li>
        <li>Drew in the first period? You can&apos;t apply in the second. Drawing a general tag doesn&apos;t affect your controlled hunt applications in the spring.</li>
        <li>Tags if you draw: elk {money(FEES.NONRESIDENT.tag.ELK)}, deer {money(FEES.NONRESIDENT.tag.DEER)} (IDFG fees, checked {md(FEES.checked, true)}).</li>
      </ul>

      <h2>Controlled Hunts</h2>
      <ul>
        <li>One application per species with a 1st and an optional 2nd choice. Second choices only get tags left over after every 1st choice was drawn, which happens in a minority of hunts: each hunt here shows how many tags reached 2nd choices last time.</li>
        <li><b>Nonresidents</b> are limited to 10% of a hunt&apos;s tags (1 tag in hunts of 10 or fewer), and IDFG sets fixed numbers on some hunts. We read the real limit from the drawing results rather than assume 10%: see the example below.</li>
        <li><b>Leftovers:</b> tags nobody claimed go to the second drawing in August, and the nonresident limit doesn&apos;t apply. <Link href="/changes#leftovers">Hunts that had leftovers</Link>.</li>
      </ul>

      <h2>Strategy That Follows From This</h2>
      <ul>
        <li><b>Apply every year for what you actually want.</b> With no points there&apos;s nothing to build; a 5% hunt is 5% every year.</li>
        <li><b>Use draw and fill, not odds alone.</b> &ldquo;About 1 in 20 a year&rdquo; combines the draw with hunter success: a 40% hunt where 20% of hunters fill can be worse than a 15% hunt where 70% fill.</li>
        <li><b>Nonresident general tags:</b> put the tag you want most 1st, then fill 2-5 only with tags that reached later choices last year. The <Link href="/planner">planner</Link> shows your chance at each slot.</li>
        <li><b>Controlled 2nd choice:</b> use it on a hunt that gave tags to 2nd choices; otherwise it&apos;s decoration.</li>
        <li><b>Watch the trend:</b> odds can fall when applicants jump (each card shows the latest drawing against the 5-year number) or when tags are cut (<Link href="/changes">What Changed</Link>).</li>
      </ul>

      <h2 id="accuracy">Why Our Nonresident Numbers Are Right</h2>
      <p>Deer hunt 1057 (unit 73, any weapon buck) had 2,293 tags in 2026. A tool that assumes Idaho&apos;s 10% rule would give nonresidents up to 229 tags and about 36% odds. The drawing results say IDFG set the nonresident number at <b>240</b> three years running, and 240 of 632 nonresident 1st-choice applicants drew: <b>38.0%</b>. Residents drew at 99.6%. We read every hunt&apos;s nonresident limit this way, from the actual drawing, and fall back to the 10% rule only for hunts with no drawing yet.</p>
      <p className="small muted">Rules here are summarized from IDFG&apos;s seasons and rules, nonresident supplement and drawing announcements (checked {NR_GENERAL_DRAW.checked}). IDFG&apos;s documents are the final word.</p>
    </main>
  );
}
