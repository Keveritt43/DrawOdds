import { Term } from './Term';
import { mtBma, mtBmaDistrict, bmaPct, bmaAcres, BMA_FWP_URL, MT_BMA_YEAR, type MtBma } from '@/lib/mtBma';

const SP: Record<string, string> = { DEER: 'deer', ELK: 'elk', PRONGHORN: 'antelope' };

function Rows({ b, publicPct }: { b: MtBma; publicPct: number | null }) {
  return (
    <table className="small mt-bma"><colgroup><col /><col style={{ width: "11em" }} /></colgroup>
      <tbody>
        <tr><td><Term k="bmaType1">Type 1</Term> · sign yourself in</td><td style={{ textAlign: 'right' }}>{b.n1 ? `${bmaAcres(b.t1)} (${bmaPct(b.t1Pct)})` : 'none'}</td></tr>
        {publicPct !== null && <tr><td><b>Public + Type 1</b></td><td style={{ textAlign: 'right' }}><b>{Math.round(Math.min(100, publicPct + b.t1Pct))}%</b></td></tr>}
        <tr><td><Term k="bmaType2">Type 2</Term> · permission or reservation needed</td><td style={{ textAlign: 'right' }}>{b.n2 ? `${bmaAcres(b.t2)} (${bmaPct(b.t2Pct)})` : 'none'}</td></tr>
      </tbody>
    </table>
  );
}

const Note = () => (
  <p className="small muted" style={{ marginTop: 4 }}>
    Enrolled private land only (state and federal parcels inside a BMA are already public), {MT_BMA_YEAR} enrollment, from FWP&apos;s maps and
    guide. Type 2 is never counted as public. Each BMA has its own rules, dates and vehicle limits: read its map at <a href={BMA_FWP_URL}>FWP Block Management</a> or
    turn on the Block Management layer on the map.
  </p>
);

/** Hunt page: Block Management in the hunt's districts, for its species. */
export function MtBmaBlock({ units, species, publicPct }: { units: string[]; species: string; publicPct: number | null }) {
  const b = mtBma(units, species);
  if (!b) return null;
  return (
    <div style={{ margin: '8px 0 12px' }}>
      <p className="small" style={{ marginBottom: 4 }}><b><Term k="bma">Block Management</Term></b> open to {SP[species]}{units.length > 1 ? ` across these ${units.length} districts` : ''}:</p>
      <Rows b={b} publicPct={publicPct} />
      <Note />
    </div>
  );
}

/** District page: one block per species the district is set for. */
export function MtBmaDistrict({ unit, publicPct }: { unit: string; publicPct: number | null }) {
  const list = mtBmaDistrict(unit);
  if (!list.length) return null;
  return (
    <section style={{ margin: '12px 0' }}>
      <h2 style={{ marginBottom: 4 }}><Term k="bma">Block Management</Term></h2>
      <div className="mt-bma-grid">
        {list.map(({ species, bma }) => (
          <div key={species}>
            <p className="small" style={{ margin: '6px 0 2px' }}>Open to <b>{SP[species]}</b>{bma.n1 + bma.n2 ? ` · ${bma.n1} Type 1, ${bma.n2} Type 2 areas` : ''}</p>
            <Rows b={bma} publicPct={publicPct} />
          </div>
        ))}
      </div>
      <Note />
    </section>
  );
}
