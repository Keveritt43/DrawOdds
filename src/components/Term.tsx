/**
 * A label with a tap-to-read definition (works on phones: no hover needed). Pure HTML <details>, no JS.
 */
export const DEFS = {
  odds: 'Draw odds: of the people who put this hunt as their 1st choice in the latest drawing, the share who got a tag. For your residency.',
  success: 'Hunter success: the share of hunters who killed an animal, from IDFG harvest reports. The latest season is shown; the 5-year number swings less.',
  crowd: 'Hunters per square mile: average hunters per year for this hunt or season, spread over its area. Under 0.5 is uncrowded; over 1.5 is busy.',
  drawfill: 'Draw and fill: your chance to draw the tag AND take an animal in one year (draw odds × success).',
  trophy: 'Trophy share: of the antlered animals taken, the share that were 4+ point mule deer (deer) or 6+ point bulls (elk). Estimated from IDFG’s rounded percentages.',
  tag: 'Elk zones have an A tag and a B tag with different seasons and weapons. You buy (or, as a nonresident, draw) one of them; its seasons are the only ones you can hunt.',
  size: 'Average antler spread (moose) or horn length (bighorn sheep, mountain goat) of the animals hunters took, in inches, from IDFG harvest reports over the last 5 years.',
  smallSample: 'Fewer than 50 hunters over 5 years (10 for moose, sheep and goat): one or two animals swing the success rate a lot.',
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
