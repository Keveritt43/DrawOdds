export const metadata = { title: 'Data & Methods - DrawOdds Idaho' };

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
      </ul>
      <h2>Known Limits</h2>
      <ul>
        <li>Units 38, 39, 41, 45, 46, 49, 50, 53, 56 and 57 changed boundaries in 2022. Trends across that year compare different ground.</li>
        <li>Nonresident odds on small hunts rest on 0-2 tags a year. One tag swings the rate from 0% to 7%+.</li>
        <li>General-season numbers cover the whole unit and every hunter in it, not just one tag type.</li>
      </ul>
      </div>
    </main>
  );
}
