import { mtMoney, MT_FEES_SOURCE, MT_FEES_YEAR, type MtCost } from '@/lib/mtFees';

/**
 * Montana's version of Idaho's CostLine (src/components/CostLine.tsx): itemised, no single total. Montana takes the
 * license price with the application and refunds it if you don't draw, so the groups are "when you apply", "if you
 * don't draw" and "if you draw", not Idaho's "to apply" and "only if you draw".
 */
export function MtCostLine({ cost, extra }: { cost: MtCost; extra?: string }) {
  return (
    <div className="cost-lines">
      <h4>What It Costs ({MT_FEES_YEAR} Regulations)</h4>
      <dl>
        <dt>When you apply</dt>
        {cost.apply.map((i) => <dd key={i.label}><span>{i.label}</span><b>{i.amount === null ? 'not printed' : mtMoney(i.amount)}</b></dd>)}
        <dt>Once a year, before any license</dt>
        {cost.prereq.map((i) => <dd key={i.label}><span>{i.label}</span><b>{i.amount === null ? '–' : mtMoney(i.amount)}</b></dd>)}
      </dl>
      <p className="small" style={{ margin: '0 0 4px' }}><b>If you don&apos;t draw:</b> {cost.ifNot}</p>
      <p className="small" style={{ margin: '0 0 4px' }}><b>If you draw:</b> {cost.ifDraw}</p>
      <p className="small muted" style={{ margin: 0 }}>
        {extra ? `${extra} ` : ''}<a href={MT_FEES_SOURCE} target="_blank" rel="noreferrer">FWP {MT_FEES_YEAR} regulations</a>, fee charts pp. 12–13, refunds pp. 11 and 18. Confirm before you pay.
      </p>
    </div>
  );
}
