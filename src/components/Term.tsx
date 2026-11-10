/**
 * A label with a tap-to-read definition (works on phones: no hover needed). Pure HTML <details>, no JS.
 */
export const DEFS = {
  effort: 'Hunter effort: days hunted (all hunters, 5 years, from IDFG harvest reports) divided by animals taken. Lower = animals come easier. Days per hunter is how long hunters stayed out.',
  odds: 'Draw odds: of the people who put this hunt as their 1st choice, the share who got a tag, for your residency. The big number totals the last 5 drawings (tags ÷ applicants); the latest drawing is underneath. Idaho has no points: every year is a fresh draw, so these are your real odds.',
  success: 'Hunter success: the share of hunters who killed an animal, from IDFG harvest reports. The big number is the 5-year average (what sorting and the verdict use); the latest season is underneath.',
  crowd: 'Hunters per square mile: average hunters per year for this hunt or season, spread over its area. Under 0.5 is uncrowded; over 1.5 is busy.',
  drawfill: 'Draw and fill: your chance to draw the tag AND take an animal in one year (draw odds × success).',
  trophy: 'Trophy share: of the antlered animals taken, the share that were 4+ point mule deer (deer) or 6+ point bulls (elk). Estimated from IDFG’s rounded percentages.',
  tag: 'Elk zones have an A tag and a B tag with different seasons and weapons. You buy (or, as a nonresident, draw) one of them; its seasons are the only ones you can hunt.',
  size: 'Average antler spread (moose) or horn length (bighorn sheep, mountain goat) of the animals hunters took, in inches, from IDFG harvest reports over the last 5 years.',
  smallSample: 'Fewer than 50 hunters over 5 years (10 for moose, sheep and goat): one or two animals swing the success rate a lot.',
  accessYes: 'Access Yes!: IDFG pays private landowners to open their ground to public hunting and fishing, or to let hunters cross it to reach public land. The acres shown are enrolled properties inside the unit or hunt area. Anyone can hunt them, but rules differ by property - check IDFG\u2019s Access Yes! listing and any sign-in box before you go.',
  applicants: '1st-choice applicants in the latest drawing, for your residency. "All" adds residents and nonresidents.',
} as const;

export function Term({ k, children }: { k: keyof typeof DEFS; children: React.ReactNode }) {
  return (
    <details className="term">
      <summary>{children}<span className="q" aria-hidden="true">?</span></summary>
      <span className="def" role="note">{DEFS[k]}</span>
    </details>
  );
}
