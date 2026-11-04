import Link from 'next/link';
import { md, ym, ANIMAL, SPECIES_NAME, type MigStats, type MigTiming, type MigClass, type StudyInfo } from '@/lib/migrations';
import { MigrationKey } from './MigrationLayers';

const int = (n: number) => Math.round(n).toLocaleString('en-US');
const mi = (n: number | null) => (n === null ? '-' : `${n} mi`);
const days = (n: number | null | undefined) => (n === null || n === undefined ? '-' : `${Math.round(n)} days`);

/** A hunt season that overlaps the herd's average fall migration window. */
export interface SeasonOverlap { label: string; href: string; open: Date; close: Date }

/**
 * Everything the study's report gives: summary, distances, collared animals, timing, route use and the units
 * it crosses. `unit`: the unit page it's shown on (adds that unit's acres).
 */
export function StudyCard({ s, unit, overlaps = [] }: { s: StudyInfo; unit?: string; overlaps?: SeasonOverlap[] }) {
  const st = s.stats as unknown as MigStats;
  const t = s.timing as unknown as { spring: MigTiming; fall: MigTiming } | null;
  const classes = s.classes as unknown as MigClass[];
  const ua = (s.unitAcres as Record<string, Record<string, number>>)[unit ?? ''];
  const animal = ANIMAL[s.species] ?? 'animals';
  const avg = st.median ? 'median' : 'avg';
  const notMapped = classes.filter((c) => c.notMapped);
  return (
    <section className="card mig-card" aria-label={s.name}>
      <p className="mig-eyebrow"><span className={`pill sp-${s.species.toLowerCase()}`}>{SPECIES_NAME[s.species] ?? s.species}</span> {s.preparedBy ? <span className="muted small">Analyzed by {s.preparedBy}{s.preparedDate ? `, ${ym(s.preparedDate)}` : ''}</span> : null}</p>
      <h2 style={{ marginTop: 0 }}>{s.name}</h2>
      <p>{s.summary}</p>
      {s.caveat && <p className="note small"><b>From the report:</b> {s.caveat}</p>}
      <div className="mig-grid">
        {t && <div className="stat"><div className="k">Fall migration ({avg})</div><div className="v" style={{ fontSize: 20 }}>{md(t.fall.startAvg)} – {md(t.fall.endAvg)}</div><div className="small muted">about {days(t.fall.durationAvgDays)}</div></div>}
        {t && <div className="stat"><div className="k">Spring migration ({avg})</div><div className="v" style={{ fontSize: 20 }}>{md(t.spring.startAvg)} – {md(t.spring.endAvg)}</div><div className="small muted">about {days(t.spring.durationAvgDays)}</div></div>}
        <div className="stat"><div className="k">{st.median ? 'Median' : 'Average'} trip</div><div className="v">{mi(st.avgMiles)}</div><div className="small muted">{st.minMiles !== null ? `${st.minMiles} – ` : 'up to '}{mi(st.maxMiles)}</div></div>
        {s.winterCount && <div className="stat"><div className="k">On winter range</div><div className="v" style={{ fontSize: 20 }}>{s.winterCount.split(' (')[0]}</div><div className="small muted">{s.winterCount.includes('(') ? s.winterCount.slice(s.winterCount.indexOf('(') + 1, -1) : ''}</div></div>}
        <div className="stat"><div className="k">Collared {animal}</div><div className="v">{st.individuals ?? '-'}</div><div className="small muted">{st.migrations ?? '-'} migrations ({st.springMigrations ?? '-'} spring, {st.fallMigrations ?? '-'} fall)</div></div>
        <div className="stat"><div className="k">Study period</div><div className="v" style={{ fontSize: 20 }}>{s.studyStart ? new Date(s.studyStart).getUTCFullYear() : '?'}–{s.studyEnd ? new Date(s.studyEnd).getUTCFullYear() : '?'}</div><div className="small muted">{s.studyStart && s.studyEnd ? `${new Date(s.studyStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} – ${new Date(s.studyEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}</div></div>
      </div>

      {overlaps.length > 0 && t && (
        <div className="note">
          <b>{SPECIES_NAME[s.species]} seasons here during the {avg} fall migration ({md(t.fall.startAvg)} – {md(t.fall.endAvg)}):</b>{' '}
          {overlaps.map((o, i) => <span key={o.href}>{i ? ', ' : ''}<Link href={o.href}>{o.label}</Link></span>)}.
          {' '}{animal[0].toUpperCase() + animal.slice(1)} from this herd can be moving through or stopping over in this unit then.
        </div>
      )}

      {t && (
        <>
          <h3>Timing</h3>
          <div className="htable-wrap">
            <table>
              <thead><tr><th></th><th>Starts ({avg})</th><th>Earliest start</th><th>Latest start</th><th>Ends ({avg})</th><th>Earliest end</th><th>Latest end</th><th>Length ({avg})</th><th>Shortest – longest</th></tr></thead>
              <tbody>
                {(['fall', 'spring'] as const).map((k) => (
                  <tr key={k}>
                    <th>{k === 'fall' ? 'Fall' : 'Spring'}</th>
                    <td>{md(t[k].startAvg)}</td><td>{md(t[k].startMin)}</td><td>{md(t[k].startMax)}</td>
                    <td>{md(t[k].endAvg)}</td><td>{md(t[k].endMin)}</td><td>{md(t[k].endMax)}</td>
                    <td>{days(t[k].durationAvgDays)}</td><td>{t[k].durationMinDays} – {days(t[k].durationMaxDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3>Route Use</h3>
      {s.mapNote ? (
        <p className="small muted">Route polygons aren&apos;t on the map yet for this study ({s.mapNote}). The acreages below are from the report.</p>
      ) : (
        <MigrationKey classes={classes.filter((c) => !c.notMapped)} />
      )}
      <table style={{ marginTop: 8 }}>
        <thead><tr><th>Use class</th><th>Whole study (report)</th>{ua && <th>In unit {unit} (approx.)</th>}</tr></thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.key}>
              <td><i className={`mig-swatch${c.pattern ? ' hatch' : ''}`} style={c.pattern ? undefined : { background: c.color }} /> {c.label}</td>
              <td>{c.acres ? `${int(c.acres)} ac` : '-'}</td>
              {ua && <td>{ua[c.key] ? `${int(ua[c.key])} ac` : '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {notMapped.length > 0 && <p className="small muted">The report lists {notMapped.map((c) => c.label).join(' and ')} acreage, but that layer isn&apos;t in the mapped routes.</p>}
      <p className="small muted" style={{ marginBottom: 0 }}>
        {s.units.length ? <>Units crossed: {s.units.map((u, i) => <span key={u}>{i ? ', ' : ''}<Link href={`/units/${encodeURIComponent(u)}`}>{u}</Link></span>)}. </> : <>Units crossed: not mapped yet. </>}
        Use classes are the share of collared {animal} that used each route{ua ? '; unit acres are estimated from the route polygons' : ''}. {s.methods ? `${s.methods} ` : ''}Source: {s.source}.
      </p>
    </section>
  );
}
