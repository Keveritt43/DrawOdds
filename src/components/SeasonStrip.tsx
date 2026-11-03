import type { TagSeason } from '@/lib/tagSeasons';

const W: Record<string, { label: string; color: string }> = {
  ARCHERY: { label: 'Archery', color: '#2f8f5b' },
  MUZZLELOADER: { label: 'Muzzleloader', color: '#7a4fd0' },
  ANY: { label: 'Any weapon', color: '#f0641e' },
  SHORT_RANGE: { label: 'Short range', color: '#b8860b' },
};
const MONTHS = ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];

/** Calendar strip, Aug 1 - Jan 31: one bar per season, colored by weapon. */
export function SeasonStrip({ seasons, year }: { seasons: TagSeason[]; year: number }) {
  const start = Date.UTC(year, 7, 1);
  const end = Date.UTC(year + 1, 1, 1);
  const pos = (iso: string) => Math.max(0, Math.min(1, (Date.parse(`${iso}T00:00:00Z`) - start) / (end - start))) * 100;
  const bars = seasons.flatMap((s) => s.dates.map((d) => ({ s, d })));
  if (!bars.length) return null;
  const used = [...new Set(seasons.map((s) => s.weapon))];
  return (
    <div className="sstrip" aria-hidden="true">
      <div className="sstrip-months">{MONTHS.map((m) => <span key={m}>{m}</span>)}</div>
      {bars.map(({ s, d }, i) => (
        <div key={i} className="sstrip-row">
          <i style={{ left: `${pos(d.open)}%`, width: `${Math.max(1.2, pos(d.close) - pos(d.open) + 0.55)}%`, background: W[s.weapon]?.color ?? '#888' }}
            title={`${W[s.weapon]?.label ?? s.weapon} · ${s.sex}`} />
        </div>
      ))}
      <div className="sstrip-key">{used.map((w) => <span key={w}><i style={{ background: W[w]?.color ?? '#888' }} />{W[w]?.label ?? w}</span>)}</div>
    </div>
  );
}
