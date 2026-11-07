'use client';
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { Frame } from './Charts';

const grid = 'rgba(128,128,128,.2)';
export function CoSpecialPointCharts({ levels, history, preference, weighted, year, pool }: {
  levels: { weighted: number; apps: number; drew: number; odds: number | null }[];
  history: { year: number; odds: number | null }[];
  preference: number; weighted: number; year: number; pool: string;
}) {
  return <>
    <Frame title="Draw odds at each weighted point level"><LineChart data={levels}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="weighted" type="number" domain={[0,'dataMax']} allowDecimals={false} />
      <YAxis width={52} tickFormatter={v => `${(v*100).toFixed(1)}%`} />
      <Tooltip labelFormatter={v => `${preference} preference + ${v} weighted points`} formatter={(v:unknown) => [typeof v === 'number' ? `${(v*100).toFixed(2)}%` : 'No applicants', 'Actual draw odds']} />
      <Line name="Actual draw odds" dataKey="odds" stroke="#2a78d6" strokeWidth={2.5} dot={{r:3}} connectNulls={false} />
      <ReferenceLine x={weighted} stroke="#b8460b" strokeDasharray="4 4" />
    </LineChart></Frame>
    <p className="small muted">{year} · {pool} · {preference} preference points. Dashed line: your {weighted} weighted points. Rates are observed outcomes at each point level; blank levels had no applicants. Random draws can produce uneven rates.</p>
    <Frame title="Applicants and drawn by weighted points"><BarChart data={levels}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="weighted" /><YAxis width={44} allowDecimals={false} />
      <Tooltip /><Legend /><Bar name="Applicants" dataKey="apps" fill="#85B7EB" /><Bar name="Drawn" dataKey="drew" fill="#eb6834" />
    </BarChart></Frame>
    <Frame title="Historical draw odds at your points"><LineChart data={history}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="year" /><YAxis width={52} tickFormatter={v => `${(v*100).toFixed(1)}%`} />
      <Tooltip formatter={(v:unknown) => [typeof v === 'number' ? `${(v*100).toFixed(2)}%` : 'No applicants', 'Actual draw odds']} />
      <Line name="Your point level" dataKey="odds" stroke="#eb6834" strokeWidth={2.5} dot={{r:3}} connectNulls={false} />
    </LineChart></Frame>
    <p className="small muted">Each year uses your current {preference} preference and {weighted} weighted points, residency and age pool. This compares historical cohorts; it does not forecast a future lottery.</p>
  </>;
}
