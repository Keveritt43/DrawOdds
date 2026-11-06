import Link from 'next/link';
import type { HerdSeries } from '@/lib/coHerds';
import { unitKey } from '@/lib/states';

const int = (n: number) => n.toLocaleString('en-US');

/** CPW post-hunt population estimates for one or more herds (DAUs), with bucks per 100 does. */
export function CoHerds({
  herds,
  highlight = [],
  species = 'DEER',
}: {
  herds: HerdSeries[];
  highlight?: string[];
  species?: 'DEER' | 'ELK' | 'PRONGHORN';
}) {
  if (!herds.length) return <p className="muted">No population estimate covers these units.</p>;
  return (
    <div className="co-herds">
      {herds.map((h) => (
        <Herd key={h.dau} h={h} highlight={highlight} species={species} />
      ))}
      <p className="small muted" style={{ margin: 0 }}>
        CPW population and sex ratio estimates. One estimate covers the whole herd (data analysis unit), so it spans every unit
        listed. Missing report years are left blank rather than interpolated. The 2022 reports were transcribed from the original PDFs
        because their text layers were corrupt.
      </p>
    </div>
  );
}

function Herd({ h, highlight, species }: { h: HerdSeries; highlight: string[]; species: 'DEER' | 'ELK' | 'PRONGHORN' }) {
  const s = h.series;
  const last = s[s.length - 1],
    first = s[0];
  const change = first && last && first !== last ? (last.estimate - first.estimate) / first.estimate : null;
  const W = 360,
    H = 90,
    L = 4,
    R = 4,
    T = 8,
    B = 16;
  const years = s.map((x) => x.year);
  const y0 = Math.min(...years),
    y1 = Math.max(...years);
  const max = Math.max(...s.map((x) => x.estimate)) * 1.08;
  const xs = (y: number) => L + ((y - y0) / Math.max(1, y1 - y0)) * (W - L - R);
  const ys = (v: number) => T + (H - T - B) * (1 - v / max);
  const pts = s.map((x) => `${xs(x.year)},${ys(x.estimate)}`).join(' ');
  return (
    <section className="card co-herd">
      <div className="co-herd-head">
        <div>
          <div className="k">
            {species === 'ELK' ? 'Elk herd E-' : species === 'DEER' ? 'Deer herd D-' : 'Pronghorn herd PH-'}
            {h.dau}
            {h.name ? ` · ${h.name}` : ''}
          </div>
          <div className="small muted">
            Units{' '}
            {h.units.map((u, i) => (
              <span key={u}>
                {i ? ', ' : ''}
                {highlight.includes(u) ? <b>{u}</b> : <Link href={`/units/${encodeURIComponent(unitKey('CO', u))}`}>{u}</Link>}
              </span>
            ))}
          </div>
        </div>
        {last && (
          <div className="co-herd-now">
            <b>{int(last.estimate)}</b>
            <span className="small muted">
              {species.toLowerCase()}, {last.year} estimate
              {change !== null ? (
                <>
                  {' '}
                  ·{' '}
                  <span className={change >= 0 ? 'up' : 'down'}>
                    {change >= 0 ? '▲' : '▼'} {Math.abs(Math.round(change * 100))}%
                  </span>{' '}
                  since {first.year}
                </>
              ) : null}
            </span>
          </div>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Herd ${species === 'ELK' ? 'E' : species === 'DEER' ? 'D' : 'PH'}-${h.dau} population estimates ${y0} to ${y1}`}
        preserveAspectRatio="none"
        style={{ height: 90 }}
      >
        <polygon points={`${xs(y0)},${ys(0)} ${pts} ${xs(y1)},${ys(0)}`} fill="var(--blaze)" fillOpacity=".12" />
        <polyline points={pts} fill="none" stroke="var(--blaze)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {s.map((x) => (
          <circle key={x.year} cx={xs(x.year)} cy={ys(x.estimate)} r="3" fill="var(--blaze)" />
        ))}
      </svg>
      <div className="htable-wrap">
        <table className="co-herd-table">
          <thead>
            <tr>
              <th></th>
              {s.map((x) => (
                <th key={x.year} className="num">
                  {x.year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>{species === 'ELK' ? 'Elk' : species === 'DEER' ? 'Deer' : 'Pronghorn'}</th>
              {s.map((x) => (
                <td key={x.year} className="num">
                  {int(x.estimate)}
                </td>
              ))}
            </tr>
            <tr>
              <th>{species === 'ELK' ? 'Bulls / 100 cows' : 'Bucks / 100 does'}</th>
              {s.map((x) => (
                <td key={x.year} className="num">
                  {x.ratio ?? '–'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
