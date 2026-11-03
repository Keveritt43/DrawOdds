import Link from 'next/link';
import { md, type MigStats, type MigTiming, type MigClass, type StudyInfo } from '@/lib/migrations';
import { MigrationKey } from './MigrationLayers';

const int = (n: number) => Math.round(n).toLocaleString('en-US');

/** A hunt season that overlaps the herd's average fall migration window. */
export interface SeasonOverlap { label: string; href: string; open: Date; close: Date }

/** Key facts and timing of one migration study. `unit`: the unit page it's shown on (adds that unit's acres). */
export function StudyCard({ s, unit, overlaps = [] }: { s: StudyInfo; unit?: string; overlaps?: SeasonOverlap[] }) {
  const st = s.stats as unknown as MigStats;
  const t = s.timing as unknown as { spring: MigTiming; fall: MigTiming };
  const classes = s.classes as unknown as MigClass[];
  const ua = (s.unitAcres as Record<string, Record<string, number>>)[unit ?? ''];
  const label = (k: string) => classes.find((c) => c.key === k)?.label ?? k;
  return (
    <section className="card mig-card" aria-label={s.name}>
      <h2 style={{ marginTop: 0 }}>{s.name}</h2>
      <p>{s.summary}</p>
      <div className="mig-grid">
        <div className="stat"><div className="k">Fall migration (avg)</div><div className="v" style={{ fontSize: 20 }}>{md(t.fall.startAvg)} – {md(t.fall.endAvg)}</div><div className="small muted">about {Math.round(t.fall.durationAvgDays)} days</div></div>
        <div className="stat"><div className="k">Spring migration (avg)</div><div className="v" style={{ fontSize: 20 }}>{md(t.spring.startAvg)} – {md(t.spring.endAvg)}</div><div className="small muted">about {Math.round(t.spring.durationAvgDays)} days</div></div>
        <div className="stat"><div className="k">Average trip</div><div className="v">{st.avgMiles} mi</div><div className="small muted">longest {st.maxMiles} mi</div></div>
        {s.winterCount && <div className="stat"><div className="k">On winter range</div><div className="v" style={{ fontSize: 20 }}>{s.winterCount.split(' (')[0]}</div><div className="small muted">{s.winterCount.includes('(') ? s.winterCount.slice(s.winterCount.indexOf('(') + 1, -1) : ''}</div></div>}
        <div className="stat"><div className="k">Collared deer</div><div className="v">{st.individuals}</div><div className="small muted">{st.migrations} migrations ({st.springMigrations} spring, {st.fallMigrations} fall)</div></div>
      </div>

      {overlaps.length > 0 && (
        <div className="note">
          <b>Deer seasons here during the average fall migration ({md(t.fall.startAvg)} – {md(t.fall.endAvg)}):</b>{' '}
          {overlaps.map((o, i) => <span key={o.href}>{i ? ', ' : ''}<Link href={o.href}>{o.label}</Link></span>)}.
          Deer from this herd can be moving through or stopping over in this unit then.
        </div>
      )}

      <h3>Timing</h3>
      <table>
        <thead><tr><th></th><th>Starts (avg)</th><th>Earliest start</th><th>Ends (avg)</th><th>Latest end</th><th>Length (avg)</th></tr></thead>
        <tbody>
          {(['fall', 'spring'] as const).map((k) => (
            <tr key={k}>
              <th>{k === 'fall' ? 'Fall' : 'Spring'}</th>
              <td>{md(t[k].startAvg)}</td><td>{md(t[k].startMin)}</td><td>{md(t[k].endAvg)}</td><td>{md(t[k].endMax)}</td><td>{t[k].durationAvgDays} days</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Route Use</h3>
      <MigrationKey classes={classes} />
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>Use class</th><th>Whole study</th>{ua && <th>In unit {unit} (approx.)</th>}</tr></thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.key}><td>{label(c.key)}</td><td>{c.acres ? `${int(c.acres)} ac` : '-'}</td>{ua && <td>{ua[c.key] ? `${int(ua[c.key])} ac` : '-'}</td>}</tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Units crossed: {s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<Link href={`/units/${encodeURIComponent(u)}`}>{u}</Link></span>)}.
        Study {s.studyStart ? new Date(s.studyStart).getUTCFullYear() : ''}–{s.studyEnd ? new Date(s.studyEnd).getUTCFullYear() : ''}. Source: {s.source}. Use classes are the share of collared deer that used each route; unit acres are estimated from the route polygons.
      </p>
    </section>
  );
}
