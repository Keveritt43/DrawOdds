'use client';
import { XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LineChart, Line, Legend } from 'recharts';
import { Frame } from './Charts';

const grid = 'rgba(128,128,128,.2)';
const RES = '#2a78d6';
const NR = '#eb6834';
const pctAxis = (v: number) => `${Math.round(v * 100)}%`;

/** Utah: odds at each point level, resident and nonresident, from the last draw (no projection is backtested). */
export function UtOddsPointsChart({ res, nr, myPoints, mine, year, kind }: {
  res: number[]; nr: number[]; myPoints: number | null; mine: 'res' | 'nr'; year: number; kind: 'bonus' | 'preference';
}) {
  const len = Math.max(res.length, nr.length);
  if (!len) return null;
  const max = Math.min(32, Math.max(4, len, (myPoints ?? 0) + 1));
  const at = (a: number[], i: number) => (a.length ? a[Math.min(i, a.length - 1)] : null);
  const data = Array.from({ length: max + 1 }, (_, points) => ({ points, res: at(res, points), nr: at(nr, points) }));
  const word = kind === 'bonus' ? 'bonus' : 'preference';
  return (
    <div>
      <Frame title={`${year} draw: odds at each ${word} point level`}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="points" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 1]} tickFormatter={pctAxis} />
          <Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–', n]} labelFormatter={(v) => `${v} ${word} points`} />
          <Legend />
          {res.length > 0 && <Line name="Resident" dataKey="res" stroke={RES} strokeWidth={mine === 'res' ? 3 : 1.5} strokeOpacity={mine === 'res' ? 1 : 0.5} dot={{ r: 3 }} connectNulls />}
          {nr.length > 0 && <Line name="Nonresident" dataKey="nr" stroke={NR} strokeDasharray="6 4" strokeWidth={mine === 'nr' ? 3 : 1.5} strokeOpacity={mine === 'nr' ? 1 : 0.5} dot={{ r: 3 }} connectNulls />}
          {myPoints !== null && <ReferenceLine x={Math.min(myPoints, max)} stroke="#5b6168" strokeDasharray="4 4" />}
        </LineChart>
      </Frame>
      <p className="small muted">{year} draw, first choice. {myPoints !== null ? `Dashed line: your ${myPoints} points. ` : ''}Odds never fall as points rise.</p>
    </div>
  );
}
