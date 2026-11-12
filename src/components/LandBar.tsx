// Idaho stores agency names ("Bureau of Land Management"); Montana and Wyoming store codes ("BLM", "USFS",
// "TRIBAL"). Tribal land and land BLM hasn't attributed are not public, so they get their own colours rather
// than falling into "Other public".
const COLORS: [RegExp, string, string][] = [
  [/private/i, '#b4b2a9', 'Private'],
  [/tribal|reservation|indian/i, '#8c6a4f', 'Tribal'],
  [/undetermined|not attributed|unknown/i, '#e3e0d6', 'Not attributed'],
  [/land management|blm/i, '#eda100', 'BLM'],
  [/forest|usfs/i, '#3b6d11', 'Forest Service'],
  [/state|fwp/i, '#2a78d6', 'State'],
  [/.*/, '#6250d6', 'Other public'],
];

export function LandBar({ shares }: { shares: { manager: string; pct: number }[] | null }) {
  if (!shares?.length) return <p className="small muted">Land ownership not available yet.</p>;
  const groups = new Map<string, { pct: number; color: string }>();
  for (const s of shares) {
    const [, color, label] = COLORS.find(([re]) => re.test(s.manager))!;
    const g = groups.get(label) ?? { pct: 0, color };
    g.pct += s.pct;
    groups.set(label, g);
  }
  const list = [...groups.entries()].sort((a, b) => b[1].pct - a[1].pct);
  return (
    <div>
      <div className="bar" role="img" aria-label={list.map(([l, g]) => `${l} ${g.pct.toFixed(0)}%`).join(', ')}>
        {list.map(([l, g]) => <span key={l} style={{ width: `${g.pct}%`, background: g.color }} title={`${l} ${g.pct.toFixed(1)}%`} />)}
      </div>
      <div className="legend">
        {list.map(([l, g]) => <span key={l}><i style={{ background: g.color }} />{l} {g.pct.toFixed(1)}%</span>)}
      </div>
    </div>
  );
}
