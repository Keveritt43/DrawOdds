'use client';
import { XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LineChart, Line, Legend, BarChart, Bar } from 'recharts';
import { Frame } from './Charts';

const grid = 'rgba(128,128,128,.2)';
const pctAxis = (v: number) => `${Math.round(v * 100)}%`;

/** Oregon: odds at each preference point level for the hunter's residency, with the other drawing (projected vs
 *  last) faint for comparison. Index = points held when applying. */
export function OrOddsPointsChart({ main, other, myPoints, year, otherYear, projected, pool }: {
  main: number[]; other: number[]; myPoints: number | null; year: number; otherYear: number; projected: boolean; pool: 'res' | 'nr';
}) {
  if (!main.length) return null;
  const top = main.findIndex((v) => v >= 0.995);
  const max = Math.min(main.length - 1, Math.max(6, (myPoints ?? 0) + 2, top < 0 ? 20 : top + 1));
  const at = (a: number[], i: number) => (a.length ? a[Math.min(i, a.length - 1)] : null);
  const data = Array.from({ length: max + 1 }, (_, points) => ({ points, main: at(main, points), other: at(other, points) }));
  return (
    <div>
      <Frame title={`${year} ${projected ? 'projected' : 'draw'}: ${pool === 'nr' ? 'nonresident' : 'resident'} odds at each point level`}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="points" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 1]} tickFormatter={pctAxis} />
          <Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–', n]} labelFormatter={(v) => `${v} preference points`} />
          <Legend />
          <Line name={`${year}${projected ? ' projected' : ''}`} dataKey="main" stroke="#2a78d6" strokeWidth={3} dot={{ r: 3 }} connectNulls type="stepAfter" />
          {other.length > 0 && <Line name={`${otherYear}${projected ? '' : ' projected'}`} dataKey="other" stroke="#5b6168" strokeDasharray="6 4" strokeWidth={1.5} strokeOpacity={0.6} dot={false} connectNulls type="stepAfter" />}
          {myPoints !== null && <ReferenceLine x={Math.min(myPoints, max)} stroke="#5b6168" strokeDasharray="4 4" />}
        </LineChart>
      </Frame>
      <p className="small muted">Points you hold when you apply. {myPoints !== null ? `Dashed line: your ${myPoints} points. ` : ''}Below the point cutoff only the random 25% is left, so the line is flat there.</p>
    </div>
  );
}

/** Oregon draw history: first-choice applicants and tags drawn by year, and the fewest points that drew in the
 *  preference phase. */
export function OrDrawHistory({ data }: { data: { year: number; apps: number | null; drawn: number | null; cutoff: number | null }[] }) {
  const tip = (v: unknown, n: string) => [typeof v === 'number' ? Math.round(v).toLocaleString('en-US') : '–', n];
  return <div className="grid2">
    <Frame title="Points that drew by preference (fewest)">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis width={44} tickLine={false} allowDecimals={false} />
        <Tooltip formatter={tip} />
        <Line name="Point cutoff" dataKey="cutoff" stroke="#2a78d6" strokeWidth={3} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </Frame>
    <Frame title="First-choice applicants vs tags drawn">
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis width={44} tickLine={false} />
        <Tooltip formatter={tip} />
        <Legend />
        <Bar name="Applicants" dataKey="apps" fill="#2a78d6" />
        <Bar name="Drawn" dataKey="drawn" fill="#1baf7a" />
      </BarChart>
    </Frame>
  </div>;
}
