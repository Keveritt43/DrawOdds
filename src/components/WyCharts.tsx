'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, ErrorBar } from 'recharts';
import { Frame, HarvestChart, SuccessChart } from './Charts';
import { wyTableOdds, WY_POOL_LABEL, type WyOddsTable, type WyPointOdds, type WyPool, type WyHarvestYear } from '@/lib/wyHunt';

const grid = 'rgba(128,128,128,.2)';
const colors = { regular: '#eb6834', special: '#2a78d6' };

/** Nonresident preference cutoff by year (regular and special), with the projection range when there is one. */
export function WyCreepChart({ po }: { po: WyPointOdds }) {
  const years = [...new Set([...(po.pools.regular?.history ?? []), ...(po.pools.special?.history ?? [])].map((h) => h.year))].sort();
  const proj = (k: 'regular' | 'special') => (po.projected ? po.pools[k]?.proj ?? null : null);
  const rows = [...years.map((year) => ({
    year,
    regular: po.pools.regular?.history.find((h) => h.year === year)?.eff ?? null,
    special: po.pools.special?.history.find((h) => h.year === year)?.eff ?? null,
  })), ...(proj('regular') || proj('special') ? [{ year: po.projYear, regular: proj('regular')?.eff ?? null, special: proj('special')?.eff ?? null }] : [])]
    .map((r) => ({
      ...r,
      regularRange: r.year === po.projYear && proj('regular') && r.regular !== null ? [r.regular - proj('regular')!.lo, proj('regular')!.hi - r.regular] : [0, 0],
      specialRange: r.year === po.projYear && proj('special') && r.special !== null ? [r.special - proj('special')!.lo, proj('special')!.hi - r.special] : [0, 0],
    }));
  if (!rows.length) return null;
  return <div><Frame title="Point creep (nonresident)"><LineChart data={rows} margin={{ top: 5, right: 16, left: 0, bottom: 0 }}><CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="year" tickLine={false} tickFormatter={(y) => (y === po.projYear ? `${y}*` : String(y))} /><YAxis width={44} tickLine={false} domain={[0, 'auto']} allowDecimals={false} /><Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? v.toFixed(1) : 'Everyone drew', n]} /><Legend />
    {(['regular', 'special'] as const).filter((k) => po.pools[k]).map((k) => <Line key={k} name={k === 'regular' ? 'Regular' : 'Special'} dataKey={k} stroke={colors[k]} strokeWidth={2.5} strokeDasharray={k === 'special' ? '6 4' : undefined} dot={{ r: 3 }} connectNulls={false}><ErrorBar dataKey={`${k}Range`} width={5} strokeWidth={2} /></Line>)}
  </LineChart></Frame><p className="small muted">{po.projected ? `*${po.projYear} projected range. ` : 'No projection for this species. '}Effective points: 3 points with 16% drawing = 3.8. A blank year means everyone who applied drew.</p></div>;
}

export function WyOddsPointsChart({ table, po, pool, mode, myPoints }: { table: WyOddsTable | null; po: WyPointOdds; pool: Exclude<WyPool, 'res'>; mode: 'proj' | 'last'; myPoints: number | null }) {
  const len = Math.max(table?.last?.[pool]?.length ?? 0, table?.proj?.[pool]?.length ?? 0);
  if (!len) return null;
  const max = Math.min(30, Math.max(4, len + 1, (myPoints ?? 0) + 1));
  const data = Array.from({ length: max + 1 }, (_, points) => ({ points, odds: wyTableOdds(table, mode, pool, points) }));
  return <div><Frame title="Draw odds at each point level"><LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}><CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="points" tickLine={false} /><YAxis width={44} tickLine={false} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} /><Tooltip formatter={(v: unknown) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–', 'Draw odds']} labelFormatter={(v) => `${v} preference points`} /><Legend /><Line name={WY_POOL_LABEL[pool]} dataKey="odds" stroke={colors[pool === 'nr' ? 'regular' : 'special']} strokeWidth={2.5} dot={{ r: 3 }} />{myPoints !== null && <ReferenceLine x={myPoints} stroke="#5b6168" strokeDasharray="4 4" />}</LineChart></Frame>
    <p className="small muted">{mode === 'proj' && po.projected ? `${po.projYear} projected` : `${po.year} draw`} · preference draw plus the random draw among those who missed (random part estimated). {myPoints !== null ? `Dashed line: your ${myPoints} points.` : ''}</p></div>;
}

export function WyHarvestCharts({ rows }: { rows: WyHarvestYear[] }) {
  const data = rows.slice().sort((a, b) => a.year - b.year).map((r) => ({ ...r, success: r.hunters > 0 && r.harvest <= r.hunters ? r.harvest / r.hunters : null }));
  return <><SuccessChart data={data} /><HarvestChart data={data} /></>;
}
