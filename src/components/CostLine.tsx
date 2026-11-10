import { costLines, money, md, type CostKind, type Residency } from '@/lib/applyInfo';

/**
 * What a hunt costs, itemised into what you pay to apply and what you pay only if you draw.
 *
 * Deliberately shows no total. The licence is annual and covers every hunt you apply for that year, so adding it
 * to one hunt's tag would overstate what a second application costs, and IDFG's fee pages carry no season year,
 * so the figures are labelled with the date they were read rather than a year we cannot source.
 */
export function CostLine({ kind, residency, species }: { kind: CostKind; residency: Residency; species: string }) {
  const c = costLines(kind, residency, species);
  return (
    <div className="cost-lines">
      <h4>What It Costs</h4>
      <dl>
        <dt>{c.upFrontLabel}</dt>
        {c.upFront.map((i) => <dd key={i.label}><span>{i.label}</span><b>{money(i.amount)}</b></dd>)}
        {c.ifYouDraw.length > 0 && <dt>Only if you draw</dt>}
        {c.ifYouDraw.map((i) => <dd key={i.label}><span>{i.label}</span><b>{money(i.amount)}</b></dd>)}
      </dl>
      <p className="small muted" style={{ margin: 0 }}>
        {c.notes.join(' ')}{' '}
        <a href={c.source} target="_blank" rel="noreferrer">IDFG fee schedule</a>, checked {md(c.checked, true)}. Confirm before you pay.
      </p>
    </div>
  );
}
