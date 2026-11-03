import { NR_GENERAL_DRAW, CONTROLLED_DRAW, BUY_SITE, md, nextWindow } from '@/lib/applyInfo';

/**
 * "How to apply" for one hunt: the code to enter, when, what you need first, and where. Server component: the
 * dates are worked out at request time against today's date.
 */
export function ApplyChecklist({ kind, code, nr, species, secondChoiceNote }: {
  kind: 'controlled' | 'nrGeneral' | 'otc';
  code: string | null;
  nr: boolean;
  species: string;
  secondChoiceNote?: string;
}) {
  if (kind === 'otc') {
    return (
      <div className="card apply">
        <h3>How To Hunt This</h3>
        <ol>
          <li>Buy an Idaho hunting license and a general {species.toLowerCase()} tag {species === 'ELK' ? '(pick the zone’s A or B tag: their seasons differ)' : ''} at <a href={BUY_SITE} target="_blank" rel="noreferrer">GoOutdoorsIdaho</a> or a license vendor. No draw.</li>
          <li>Check the season dates and boundaries in the current IDFG regulations before you go.</li>
        </ol>
      </div>
    );
  }
  const info = kind === 'nrGeneral' ? NR_GENERAL_DRAW : CONTROLLED_DRAW;
  const next = nextWindow(info.windows);
  return (
    <div className="card apply">
      <h3>How To Apply</h3>
      {next && (
        <p className={`apply-next ${next.open ? 'open' : ''}`}>
          {next.open ? 'Open now: ' : 'Next: '}<b>{next.w.label}</b>, {md(next.start.toISOString().slice(0, 10), true)} – {md(next.end.toISOString().slice(0, 10), true)}.
          {next.w.note ? ` ${next.w.note}` : ''}
        </p>
      )}
      <ol>
        <li><b>Get a license first.</b> {info.license}</li>
        <li><b>Apply with code {code ? <code>{code}</code> : 'shown on the IDFG hunt page'}.</b> {info.choices}{secondChoiceNote ? ` ${secondChoiceNote}` : ''}</li>
        {kind === 'nrGeneral' && <li><b>Fee:</b> {NR_GENERAL_DRAW.fee}.</li>}
        <li><b>Where:</b> <a href={BUY_SITE} target="_blank" rel="noreferrer">GoOutdoorsIdaho</a> (IDFG&apos;s license site), by phone, or at a license vendor.</li>
        {kind === 'controlled' && nr && <li><b>Nonresidents:</b> you&apos;re limited to a share of the tags in each hunt (see the tag numbers above), so your odds can differ a lot from residents&apos;.</li>}
      </ol>
      <p className="small muted" style={{ margin: 0 }}>
        Dates checked {md(info.checked, true)} against <a href={info.source} target="_blank" rel="noreferrer">{info.sourceLabel}</a>. IDFG can change them; confirm before you apply.
      </p>
    </div>
  );
}
