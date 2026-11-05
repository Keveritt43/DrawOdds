export const metadata = { title: 'Data & Methods' };

export default function About() {
  return (
    <main className="wrap" style={{ maxWidth: 820, margin: '24px auto 48px' }}>
      <div className="card">
      <h1>Where The Numbers Come From</h1>
      <p>Everything here is public Idaho Department of Fish and Game data, refreshed nightly. This site is not affiliated with or endorsed by IDFG. Seasons and rules change; always confirm in the current IDFG regulations before you apply or hunt.</p>
      <h2>Sources</h2>
      <ul>
        <li><b>Draw odds:</b> IDFG Hunt Planner drawing-odds data, 1998 to present, first and second drawings.</li>
        <li><b>Harvest:</b> IDFG controlled-hunt and general-season harvest statistics, from mandatory hunter reports. These are expanded estimates, not head counts.</li>
        <li><b>This season&apos;s hunts:</b> IDFG Hunt Planner hunt lists for every unit.</li>
        <li><b>Unit and hunt boundaries, Access Yes! properties:</b> IDFG GIS map services.</li>
        <li><b>Land ownership:</b> IDFG Hunt Planner unit and hunt-area pages (surface management, from Inside Idaho).</li>
      </ul>
      <h2>How We Calculate</h2>
      <ul>
        <li><b>Odds</b> = permits / first-choice applicants, for your residency. The 5-year figure is total permits over total applicants, not an average of yearly percentages, so small years don&apos;t get overweighted.</li>
        <li><b>Success</b> = harvest / hunters. 5-year figure is totals over totals.</li>
        <li><b>Draw + fill</b> = 5-yr odds x 5-yr success: your chance of drawing and filling a tag in one application year. It&apos;s the default sort.</li>
        <li><b>Renumbered hunts:</b> IDFG renumbers controlled hunts every few years. We follow a hunt back in time by matching the same hunt area and the closest tag count.</li>
        <li><b>Mule deer vs whitetail, 4+ and 6+ point counts</b> are back-calculated from IDFG&apos;s rounded percentages. Since 2016 IDFG calculates %4+ on mule deer only and %5+ on whitetails only, and we follow that. Treat these as direction, not precision.</li>
        <li><b>Deer type:</b> 60%+ whitetail over 5 years = Whitetail; 40% or less = Mule deer; otherwise Mixed.</li>
        <li><b>Public land</b> counts federal and state-managed land. State land is mostly open to hunting but check access on the ground.</li>
        <li><b>Access Yes!</b> is reported separately: it is mostly private land IDFG leases for hunter access, so it is not part of public land. <b>Huntable</b> = public + Access Yes!, capped at 100%.</li>
        <li><b>Access Yes! acres</b> are measured from IDFG&apos;s property boundaries that overlap each unit or hunt area.</li>
        <li><b>Nonresident tags in a controlled hunt:</b> from the latest drawing. If more nonresidents applied than drew, the number that drew is the nonresident limit in practice (IDFG sets fixed numbers on some hunts). If everyone drew, the limit wasn&apos;t reached. With no drawing yet we show Idaho&apos;s rule: up to 10% of the tags, or 1 tag in hunts of 10 or fewer (IDAPA 13.01.08.255).</li>
        <li><b>2nd-choice tags:</b> tags IDFG gave to second-choice applicants in the latest drawing, meaning first choices didn&apos;t use them all. For nonresidents they only help when the nonresident limit wasn&apos;t already full.</li>
        <li><b>Residents and general seasons:</b> general tags are over the counter (no draw), so draw + fill is just the success rate. Elk zones that are capped are left out of that.</li>
        <li><b>Plain-English labels:</b> odds of 50%+ are &ldquo;good&rdquo;, 15-50% &ldquo;fair&rdquo;, 5-15% a &ldquo;long shot&rdquo;. Success is judged per species (general elk: 20%+ high, under 10% low; controlled elk: 50%+ high, under 20% low; deer: 55%+ high, under 35% low; pronghorn: 60%+ high, under 35% low). Under 0.5 hunters per square mile is uncrowded; over 1.5 is crowded.</li>
        <li><b>Trophy share</b> is left blank when fewer than 20 antlered animals were reported over 5 years, and never shown over 100% (rounded source percentages can add up past it).</li>
      </ul>
      <h2>Known Limits</h2>
      <ul>
        <li>When IDFG redraws a unit, map numbers only use seasons after the change. Changes from this year or last year are flagged on the unit and its hunts.</li>
        <li>Nonresident odds on small hunts rest on 0-2 tags a year. One tag swings the rate from 0% to 7%+.</li>
        <li>General-season numbers cover the whole unit and every hunter in it, not just one tag type. Elk A and B tag numbers use the general-season harvest for the weapons each tag can hunt, so tags that share a weapon share those numbers.</li>
        <li>Controlled-hunt crowding counts only that hunt&apos;s hunters, not general-season hunters in the same area.</li>
      </ul>
      </div>
    </main>
  );
}
