'use client';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, LineChart, Line, Legend, ComposedChart } from 'recharts';
import { Frame } from './Charts';
import { mtLevels, mtCutoff, mtCutoffHistory, type MtLevel } from '@/lib/mtOdds';

const grid = 'rgba(128,128,128,.2)';
// Drew in full / the level it ran out at / drew nothing / the separate random draw at zero points.
const ZONE_COLOR = { full: '#2f8f4e', cutoff: '#eb6834', dead: '#9aa0a6', zero: '#2a78d6' } as const;
type Zone = keyof typeof ZONE_COLOR;

const zoneOf = (l: MtLevel, cutoffMin: number | null): Zone => {
  if (l.min === 0 && l.max === 0) return 'zero';
  if (cutoffMin !== null && l.min === cutoffMin) return 'cutoff';
  if (cutoffMin !== null && l.max < cutoffMin) return 'dead';
  return 'full';
};

const ZONE_NOTE: Record<Zone, string> = {
  full: 'Everyone at this level drew',
  cutoff: 'The level the licenses ran out at',
  dead: 'Nobody at this level drew',
  zero: 'The separate random draw for 0 points',
};

/**
 * Montana's ladder is not a rising curve like Colorado's: it dips to zero between the cutoff and zero points,
 * because the random quarter of the licenses is reserved for applicants holding no points at all. The dip is
 * the thing a hunter needs to see, so each band is drawn in its own colour with the reason spelled out.
 */
export function MtComboPointsChart({ licenseKey, year, title, myPoints }: { licenseKey: string; year?: number; title: string; myPoints?: number | null }) {
  const levels = mtLevels(licenseKey, year);
  if (!levels.length) return null;
  const cut = mtCutoff(licenseKey, year);
  const cutoffMin = cut?.min ?? null;

  // Lowest points on the left, so the axis reads the way a hunter accumulates them.
  const ordered = levels.slice().sort((a, b) => a.min - b.min);
  const data = ordered.map((l) => {
    const zone = zoneOf(l, cutoffMin);
    return { label: l.label === '0' ? '0 pts' : l.label, pct: l.pct ?? 0, apps: l.apps, drawn: l.drawn, zone, note: ZONE_NOTE[zone] };
  });

  // Only marks the hunter's balance when it falls inside a printed band; a party average between bands
  // has no bar to sit on, and the verdict card above the chart already states where it lands.
  const myIndex = myPoints == null ? -1 : ordered.findIndex((l) => myPoints >= l.min && myPoints <= l.max);
  const myBand = myIndex >= 0 ? data[myIndex] : null;

  return (
    <div>
      <Frame title={title} height={250}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            formatter={(v: unknown, _name: unknown, item: unknown) => {
              const p = (item as { payload?: { apps: number; drawn: number; note: string } } | undefined)?.payload;
              const pct = typeof v === 'number' ? v.toFixed(2) : '–';
              return [p ? `${pct}% — ${p.drawn.toLocaleString()} of ${p.apps.toLocaleString()} drew` : `${pct}%`, p?.note ?? 'Drew'];
            }}
            labelFormatter={(v: unknown) => `${v} preference points`}
          />
          <Bar dataKey="pct" name="Drew" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.label} fill={ZONE_COLOR[d.zone as Zone]} />)}
          </Bar>
          {myBand && <ReferenceLine x={myBand.label} stroke="#5b6168" strokeDasharray="4 4" />}
        </BarChart>
      </Frame>
      <p className="small muted">
        Last draw, not a forecast. {cut
          ? <>Licenses ran out partway through the <b>{cut.label}</b>-point level. Above it everyone drew; below it, down to but not including zero, <b>nobody drew</b> — those applicants miss the points phase and are not eligible for the random draw. </>
          : <>Everyone who applied drew, at every point level. </>}
        {myBand ? `Dashed line: your ${myPoints} points.` : ''}
      </p>
    </div>
  );
}

/**
 * What each year's draw actually did, 2021 onward. Two lines that matter to a hunter deciding whether a
 * point is worth buying: the chance at the cutoff level, and the chance with no points at all. They cross
 * and re-cross, which is the honest picture — this is history, not a trend to extrapolate.
 */
export function MtCutoffHistoryChart({ licenseKey, title }: { licenseKey: string; title: string }) {
  const rows = mtCutoffHistory(licenseKey).map((h) => ({
    year: h.year,
    cutoff: h.cutoffPct,
    zero: h.zeroPct,
    level: h.cutoff,
    drawn: h.drawn,
  }));
  if (rows.length < 2) return null;
  const levels = [...new Set(rows.map((r) => r.level).filter((l): l is number => l != null))];
  return (
    <div>
      <Frame title={title} height={230}>
        <LineChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="year" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 100]} tickFormatter={(v: unknown) => `${v}%`} />
          <Tooltip
            formatter={(v: unknown, n: string) => [typeof v === 'number' ? `${v.toFixed(2)}%` : 'Everyone drew', n]}
            labelFormatter={(v: unknown) => `${v} draw`}
          />
          <Legend />
          <Line name="At the cutoff level" dataKey="cutoff" stroke={ZONE_COLOR.cutoff} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
          <Line name="With 0 points" dataKey="zero" stroke={ZONE_COLOR.zero} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </Frame>
      <p className="small muted">
        Last {rows.length} draws. {levels.length === 1
          ? <>The cutoff has sat at the <b>{levels[0]}</b>-point level in every one, so what moves year to year is how much of that level got through, not how many points put you in the running. </>
          : <>The cutoff moved from the <b>{Math.min(...levels)}</b>-point level to the <b>{Math.max(...levels)}</b>-point level, and the share drawn at it has swung as well — both can change. </>}
        No projection: see the page notes.
      </p>
    </div>
  );
}

const RES = '#2a78d6';
const NR = '#eb6834';
const pctAxis = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Bonus-point odds as Colorado's and Wyoming's "Draw odds at each point level" chart: resident and nonresident,
 * your own line bold and your points marked. x is the points you hold if you buy a point this year (FWP's row is
 * one higher); the not-buying chance is drawn as a flat dashed line, since banked points don't count then.
 */
export function MtOddsPointsChart({ res, nr, noBuy, myPoints, mine, year }: {
  res: number[]; nr: number[]; noBuy?: { res: number | null; nr: number | null }; myPoints: number | null; mine: 'res' | 'nr'; year: number;
}) {
  const len = Math.max(res.length, nr.length);
  if (!len) return null;
  const max = Math.min(30, Math.max(4, len, (myPoints ?? 0) + 1));
  const at = (a: number[], i: number) => (a.length ? a[Math.min(i, a.length - 1)] : null);
  const data = Array.from({ length: max + 1 }, (_, points) => ({ points, res: at(res, points), nr: at(nr, points) }));
  const nb = noBuy?.[mine] ?? null;
  return (
    <div>
      <Frame title="Draw odds at each bonus point level">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="points" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 1]} tickFormatter={pctAxis} />
          <Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '–', n]} labelFormatter={(v) => `${v} bonus points + buying one`} />
          <Legend />
          <Line name="Resident" dataKey="res" stroke={RES} strokeWidth={mine === 'res' ? 3 : 1.5} strokeOpacity={mine === 'res' ? 1 : 0.5} dot={{ r: 3 }} connectNulls />
          <Line name="Nonresident" dataKey="nr" stroke={NR} strokeDasharray="6 4" strokeWidth={mine === 'nr' ? 3 : 1.5} strokeOpacity={mine === 'nr' ? 1 : 0.5} dot={{ r: 3 }} connectNulls />
          {nb !== null && <ReferenceLine y={nb} stroke="#5b6168" strokeDasharray="2 4" label={{ value: `Not buying a point: ${Math.round(nb * 100)}%`, position: 'insideTopRight', fontSize: 11, fill: '#5b6168' }} />}
          {myPoints !== null && <ReferenceLine x={Math.min(myPoints, max)} stroke="#5b6168" strokeDasharray="4 4" />}
        </LineChart>
      </Frame>
      <p className="small muted">{year} draw, first choice. {myPoints !== null ? `Dashed line: your ${myPoints} points. ` : ''}Odds never fall as points rise (see the table below).</p>
    </div>
  );
}

/**
 * Idaho's deer quality chart with Montana's numbers: mule deer and whitetail harvest stacked, and the 4+ point
 * share of FWP's antlered deer. Montana's "4 or more points" counts bucks of both species, so the line is labelled
 * as the share of all antlered bucks, not of mule deer as Idaho's is.
 */
export function MtDeerQualityChart({ data }: { data: { year: number; mule?: number | null; whitetail?: number | null; antlered?: number | null; big?: number | null; harvest?: number | null }[] }) {
  const rows = data.map((d) => ({ ...d, share: d.antlered ? Math.min(1, (d.big ?? 0) / d.antlered) : null }));
  const split = rows.some((d) => d.mule != null);
  return (
    <Frame title={split ? 'Mule deer vs whitetail, and 4+ point buck share (est)' : 'Harvest and 4+ point buck share (est)'}>
      <ComposedChart data={rows} margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={grid} vertical={false} />
        <XAxis dataKey="year" tickLine={false} />
        <YAxis yAxisId="n" width={44} tickLine={false} />
        <YAxis yAxisId="p" orientation="right" domain={[0, 1]} tickFormatter={pctAxis} width={48} tickLine={false} />
        <Tooltip formatter={(v: unknown, n: string) => [typeof v === 'number' ? (n.includes('share') ? `${(v * 100).toFixed(1)}%` : v.toLocaleString()) : '–', n]} />
        <Legend />
        {split ? <>
          <Bar yAxisId="n" name="Mule deer" dataKey="mule" stackId="s" fill="#2a78d6" />
          <Bar yAxisId="n" name="Whitetail" dataKey="whitetail" stackId="s" fill="#eda100" />
        </> : <Bar yAxisId="n" name="Harvest" dataKey="harvest" fill="#2a78d6" />}
        <Line yAxisId="p" name="4+ point buck share" dataKey="share" stroke="#0f6e56" strokeWidth={3} dot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </Frame>
  );
}
