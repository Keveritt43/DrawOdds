'use client';
import { XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import { Frame } from './Charts';

const grid = 'rgba(128,128,128,.2)';
const pctAxis = (v: number) => `${Math.round(v * 100)}%`;

/** Washington: estimated odds at each point level, one line (residents and nonresidents share one pool), with the
 *  other drawing (projected vs last) faint for comparison. Index = points held before applying. */
export function WaOddsPointsChart({ main, other, myPoints, year, otherYear, projected }: {
  main: number[]; other: number[]; myPoints: number | null; year: number; otherYear: number; projected: boolean;
}) {
  if (!main.length) return null;
  const top = main.findIndex((v) => v >= 0.995);
  const max = Math.min(main.length - 1, Math.max(6, (myPoints ?? 0) + 2, top < 0 ? 20 : top + 1));
  const at = (a: number[], i: number) => (a.length ? a[Math.min(i, a.length - 1)] : null);
  const data = Array.from({ length: max + 1 }, (_, points) => ({ points, main: at(main, points), other: at(other, points) }));
  return (
    <div>
      <Frame title={`${year} ${projected ? 'projected' : 'drawing'} (estimated): odds at each point level`}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="points" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 1]} tickFormatter={pctAxis} />
          <Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–', n]} labelFormatter={(v) => `${v} points held (${(Number(v) + 1) ** 2} entries)`} />
          <Legend />
          <Line name={`${year}${projected ? ' projected' : ''}`} dataKey="main" stroke="#2a78d6" strokeWidth={3} dot={{ r: 3 }} connectNulls />
          {other.length > 0 && <Line name={`${otherYear}${projected ? '' : ' projected'}`} dataKey="other" stroke="#5b6168" strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.6} dot={false} connectNulls />}
          {myPoints !== null && <ReferenceLine x={Math.min(myPoints, max)} stroke="#5b6168" strokeDasharray="4 4" />}
        </LineChart>
      </Frame>
      <p className="small muted">Points held before applying; you draw with that plus this year&apos;s point, squared. {myPoints !== null ? `Dashed line: your ${myPoints} points. ` : ''}Residents and nonresidents are in the same drawing.</p>
    </div>
  );
}
