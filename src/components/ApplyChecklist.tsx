import { NR_GENERAL_DRAW, CONTROLLED_DRAW, MSG_DRAW, BUY_SITE, md, nextWindow } from '@/lib/applyInfo';

/**
 * "How to apply" for one hunt: the code to enter, when, what you need first, and where. Server component: the
 * dates are worked out at request time against today's date.
 */
export function ApplyChecklist({ kind, code, nr, species, secondChoiceNote }: {
  kind: 'controlled' | 'nrGeneral' | 'otc' | 'msg';
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
  if (kind === 'msg') {
    const next = nextWindow(MSG_DRAW.windows);
    return (
      <div className="card apply">
        <h3>How To Apply</h3>
        {next && (
          <p className={`apply-next ${next.open ? 'open' : ''}`}>
            {next.open ? 'Open now: ' : 'Next: '}<b>{next.w.label}</b>, {md(next.start.toISOString().slice(0, 10), true)} – {md(next.end.toISOString().slice(0, 10), true)}.{next.w.note ? ` ${next.w.note}` : ''}
          </p>
        )}
        <ol>
          <li><b>Pick one species for the year.</b> {MSG_DRAW.oneSpecies}</li>
          <li><b>Get a license first.</b> {MSG_DRAW.license}</li>
          <li><b>Apply with code {code ? <code>{code}</code> : 'shown on the IDFG hunt page'}.</b> {MSG_DRAW.choices}{secondChoiceNote ? ` ${secondChoiceNote}` : ''}</li>
          <li><b>Money up front:</b> {MSG_DRAW.fees}</li>
          <li><b>Once you draw:</b> {MSG_DRAW.waits}</li>
          {nr && <li><b>Nonresidents:</b> {MSG_DRAW.nr}</li>}
          <li><b>Where:</b> <a href={BUY_SITE} target="_blank" rel="noreferrer">GoOutdoorsIdaho</a>, by phone (1-800-554-8685), or at a license vendor or IDFG office.</li>
        </ol>
        <p className="small muted" style={{ margin: 0 }}>
          Checked {md(MSG_DRAW.checked, true)} against <a href={MSG_DRAW.source} target="_blank" rel="noreferrer">{MSG_DRAW.sourceLabel}</a> and IDAPA 13.01.08.257. Fees and rules can change; confirm before you apply.
        </p>
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
