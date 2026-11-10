import { wyAreaLabel } from '@/lib/wyHunt';
import { wyHuntWilderness, wildernessPctLabel, wildernessShort } from '@/lib/wyWilderness';

const RULE_URL = 'https://law.justia.com/codes/wyoming/title-23/chapter-2/article-4/section-23-2-401/';

const share = (pct: number) => (pct >= 95 ? `Nearly all (${wildernessPctLabel(pct)})` : pct >= 50 ? `Most (${wildernessPctLabel(pct)})` : wildernessPctLabel(pct));

/**
 * Wyoming nonresident wilderness guide rule for one hunt area (unit page) or a license's areas (hunt page).
 * Nonresidents get the full warning; residents get one line, since the rule only binds nonresidents.
 */
export function WyWildernessNote({ units, nr }: { units: string[]; nr: boolean }) {
  const hits = wyHuntWilderness(units);
  if (!hits.length) return null;
  const names = [...new Set(hits.flatMap((h) => h.area.wilderness.map((w) => wildernessShort(w.name))))];
  const wild = `${names.join(', ')} Wilderness${names.length > 1 ? 'es' : ''}`;
  const where = units.length === 1
    ? <>{share(hits[0].area.pct)} of this area is federally designated wilderness: the {wild}.</>
    : <>Hunt areas on this license with federally designated wilderness ({wild}): {hits.map((h) => `${wyAreaLabel(h.unit)} ${wildernessPctLabel(h.area.pct)}`).join(', ')}.</>;
  if (!nr) {
    return (
      <p className="small muted" data-testid="wy-wilderness">
        {where} Nonresidents need a licensed or resident guide inside wilderness (W.S. 23-2-401).
      </p>
    );
  }
  return (
    <div className="note" data-testid="wy-wilderness" role="note">
      <b>Nonresidents need a guide in wilderness.</b> {where} Wyoming law (<a href={RULE_URL}>W.S. 23-2-401</a>) bars a
      nonresident from hunting big game inside a designated wilderness unless a licensed professional guide or a resident
      guide is with them, at least one guide for every two nonresident hunters. A resident guide is a Wyoming resident
      friend with a free resident guide license: they can&apos;t be paid and can guide no more than two nonresidents a
      year on national forest or wilderness. Outside the wilderness boundary no guide is needed, so check where the line
      runs on your map before you hunt.
    </div>
  );
}
