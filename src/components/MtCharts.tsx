'use client';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Frame } from './Charts';
import { mtLevels, mtCutoff, type MtLevel } from '@/lib/mtOdds';

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
  const data = levels
    .slice()
    .sort((a, b) => a.min - b.min)
    .map((l) => {
      const zone = zoneOf(l, cutoffMin);
      return { label: l.label === '0' ? '0 pts' : l.label, pct: l.pct ?? 0, apps: l.apps, drawn: l.drawn, zone, note: ZONE_NOTE[zone] };
    });

  const myBand = myPoints == null ? null : data.find((d, i) => {
    const l = levels.slice().sort((a, b) => a.min - b.min)[i];
    return myPoints >= l.min && myPoints <= l.max;
  });

  return (
    <div>
      <Frame title={title} height={250}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="label" tickLine={false} />
          <YAxis width={44} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            formatter={(v: unknown, _n, item) => {
              const p = item?.payload as { apps: number; drawn: number; note: string } | undefined;
              return [`${typeof v === 'number' ? v.toFixed(2) : '–'}% — ${p ? `${p.drawn.toLocaleString()} of ${p.apps.toLocaleString()} drew` : ''}`, p?.note ?? 'Drew'];
            }}
            labelFormatter={(v) => `${v} preference points`}
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
