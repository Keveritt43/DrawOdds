'use client';

import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import type { YearPoint } from '@/lib/history';

const RES = '#2a78d6';
const NR = '#eb6834';
const GRID = 'rgba(128,128,128,.2)';
const pctFmt = (v: number) => `${Math.round(v * 100)}%`;
const tip = (v: unknown, name: string) =>
  typeof v === 'number' ? [name.includes('odds') || name.includes('success') ? `${(v * 100).toFixed(1)}%` : v.toLocaleString(), name] : [String(v), name];

function Frame({ title, children, height = 220 }: { title: string; children: React.ReactElement; height?: number }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

/** Resident and nonresident odds; the user's own line is drawn bold. */
export function OddsChart({ data, nr }: { data: YearPoint[]; nr: boolean }) {
  return (
    <Frame title="Draw odds (first choice)">
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis tickFormatter={pctFmt} width={44} tickLine={false} />
        <Tooltip formatter={tip} />
        <Legend />
        <Line name="Resident odds" dataKey="resOdds" stroke={RES} strokeWidth={nr ? 1.5 : 3} strokeOpacity={nr ? 0.5 : 1} dot={{ r: 3 }} connectNulls />
        <Line name="Nonresident odds" dataKey="nrOdds" stroke={NR} strokeDasharray="6 4" strokeWidth={nr ? 3 : 1.5} strokeOpacity={nr ? 1 : 0.5} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </Frame>
  );
}

export function ApplicantsChart({ data }: { data: YearPoint[] }) {
  return (
    <Frame title="First-choice applicants vs tags">
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis width={44} tickLine={false} />
        <Tooltip formatter={tip} />
        <Legend />
        <Bar name="Resident applicants" dataKey="resApps" stackId="a" fill={RES} />
        <Bar name="Nonresident applicants" dataKey="nrApps" stackId="a" fill={NR} />
        <Bar name="Tags" dataKey="permits" fill="#1baf7a" />
      </BarChart>
    </Frame>
  );
}

export function HarvestChart({ data }: { data: YearPoint[] }) {
  return (
    <Frame title="Hunters and harvest">
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis width={44} tickLine={false} />
        <Tooltip formatter={tip} />
        <Legend />
        <Bar name="Hunters" dataKey="hunters" fill="#85B7EB" />
        <Bar name="Harvest" dataKey="harvest" fill="#2a78d6" />
      </BarChart>
    </Frame>
  );
}

export function SuccessChart({ data, compare }: { data: YearPoint[]; compare?: { label: string; data: YearPoint[] } }) {
  const merged = data.map((d) => ({ ...d, other: compare?.data.find((c) => c.year === d.year)?.success ?? null }));
  return (
    <Frame title="Hunter success">
      <LineChart data={merged} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis tickFormatter={pctFmt} width={44} tickLine={false} domain={[0, 1]} />
        <Tooltip formatter={tip} />
        <Legend />
        <Line name="This hunt success" dataKey="success" stroke="#2a78d6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        {compare && <Line name={`${compare.label} success`} dataKey="other" stroke="#6250d6" strokeDasharray="4 4" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
      </LineChart>
    </Frame>
  );
}

export function QualityChart({ data, species }: { data: YearPoint[]; species: 'DEER' | 'ELK' }) {
  return (
    <Frame title={species === 'DEER' ? 'Mule deer vs whitetail, and 4+ point mule deer (est)' : 'Antlered bulls and 6+ point bulls (est)'}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis width={44} tickLine={false} />
        <Tooltip formatter={tip} />
        <Legend />
        {species === 'DEER' ? (
          <>
            <Bar name="Mule deer" dataKey="mule" stackId="s" fill="#2a78d6" />
            <Bar name="Whitetail" dataKey="whitetail" stackId="s" fill="#eda100" />
            <Bar name="Mule 4+ pts" dataKey="big" fill="#0f6e56" />
          </>
        ) : (
          <>
            <Bar name="Antlered" dataKey="antlered" fill="#85B7EB" />
            <Bar name="6+ point bulls" dataKey="big" fill="#0f6e56" />
            <Bar name="Antlerless" dataKey="antlerless" fill="#eda100" />
          </>
        )}
      </BarChart>
    </Frame>
  );
}
