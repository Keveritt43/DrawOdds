'use client';
import { BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceLine } from 'recharts';
import { Frame } from './Charts';
import { useState } from 'react';

const grid = 'rgba(128,128,128,.2)';
export function CoSpecialPointCharts({ levels, history, preference, weighted, year, pool, rows, initialPool }: {
  levels: { weighted: number; apps: number; drew: number; odds: number | null }[];
  history: { year: number; odds: number | null }[];
  preference: number; weighted: number; year: number; pool: string;
  rows: number[][]; initialPool: number;
}) {
  const [selectedPool, setSelectedPool] = useState(initialPool);
  const names = ['Resident', 'Nonres', 'Youth res', 'Youth nonres'];
  return <>
    <div className="grid2 co-graph-grid">
    <div>
    <Frame title="Draw odds at each weighted point level"><LineChart data={levels}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="weighted" type="number" domain={[0,'dataMax']} allowDecimals={false} />
      <YAxis width={52} tickFormatter={v => `${(v*100).toFixed(1)}%`} />
      <Tooltip labelFormatter={v => `${preference} preference + ${v} weighted points`} formatter={(v:unknown) => [typeof v === 'number' ? `${(v*100).toFixed(2)}%` : 'No applicants', 'Actual draw odds']} />
      <Line name="Actual draw odds" dataKey="odds" stroke="#2a78d6" strokeWidth={2.5} dot={{r:3}} connectNulls={false} />
      <ReferenceLine x={weighted} stroke="#b8460b" strokeDasharray="4 4" />
    </LineChart></Frame>
    <p className="small muted">{year} · {pool} · {preference} preference points. Dashed line: your {weighted} weighted points. Rates are observed outcomes at each point level; blank levels had no applicants. Random draws can produce uneven rates.</p>
    </div>
    <Frame title="Applicants and drawn by weighted points"><BarChart data={levels}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="weighted" /><YAxis width={44} allowDecimals={false} />
      <Tooltip /><Legend /><Bar name="Applicants" dataKey="apps" fill="#85B7EB" /><Bar name="Drawn" dataKey="drew" fill="#eb6834" />
    </BarChart></Frame>
    <div>
    <Frame title="Historical draw odds at your points"><LineChart data={history}>
      <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="year" /><YAxis width={52} tickFormatter={v => `${(v*100).toFixed(1)}%`} />
      <Tooltip formatter={(v:unknown) => [typeof v === 'number' ? `${(v*100).toFixed(2)}%` : 'No applicants', 'Actual draw odds']} />
      <Line name="Your point level" dataKey="odds" stroke="#eb6834" strokeWidth={2.5} dot={{r:3}} connectNulls={false} />
    </LineChart></Frame>
    <p className="small muted">Each year uses your current {preference} preference and {weighted} weighted points, residency and age pool. This compares historical cohorts; it does not forecast a future lottery.</p>
    </div>
    </div>
    <h2>Odds At Every Point Level</h2>
    <div className="co-oddsbar"><span>{year} actual · first choice</span><div className="seg light" role="group" aria-label="Applicant pool">
      {names.map((name, index) => <button key={name} type="button" aria-pressed={selectedPool === index} onClick={() => setSelectedPool(index)}>{name}</button>)}
    </div></div>
    <div className="htable-wrap"><table><thead><tr><th>Preference points</th><th>Weighted points</th><th>Applied ({year})</th><th>Drew</th><th>Actual odds</th></tr></thead>
      <tbody>{[...rows].sort((a,b) => b[0]-a[0] || b[1]-a[1]).map(row => {
        const apps = row[2 + selectedPool], drew = row[6 + selectedPool];
        const mine = row[0] === preference && row[1] === weighted;
        return <tr key={row[0]+':'+row[1]} style={mine ? {background:'#fff0e8'} : undefined}><td>{row[0]}{mine ? ' · you' : ''}</td><td>{row[1]}</td><td>{apps || '—'}</td><td>{apps ? drew : '—'}</td><td>{apps ? (drew / apps * 100).toFixed(1) + '%' : '—'}</td></tr>;
      })}</tbody>
    </table></div>
    <p className="small muted">Actual first-choice results at each reported regular and weighted point level. A dash means no applicants in that pool, so odds are unavailable. These historical outcomes do not forecast the next weighted draw.</p>
  </>;
}
