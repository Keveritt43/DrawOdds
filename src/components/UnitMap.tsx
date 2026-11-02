'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { recentBoundaryChanges } from '@/lib/boundaries';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import Link from 'next/link';
import { classBreaks } from '@/lib/breaks';
import { Star } from './Star';

type Props = Record<string, string | number | boolean | null | undefined> & { name: string };

type Sp = 'DEER' | 'ELK';
interface MetricDef {
  label: string;
  field: (sp: Sp, nr: boolean) => string;
  ramp: string[];
  bySpecies?: boolean;
  fmt: (v: number) => string;
  none: string;
  note: string;
}
// light -> dark, single hue per meaning: green = land you can hunt, orange = success / odds, plum = crowding
const GREEN = ['#eef4e6', '#d2e4bf', '#aecd92', '#84b267', '#5b9242', '#346c27'];
const ORANGE = ['#fdeadc', '#fbcaa7', '#f7a474', '#f27c44', '#d85b18', '#9c3d0a'];
const PLUM = ['#f4eaf2', '#e2c6dd', '#cb9ac4', '#af6ca7', '#8b4386', '#5f2260'];
const num = (v: number) => (v >= 10 ? String(Math.round(v)) : v >= 1 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(2))));
const pctOf = (v: number) => `${num(v)}%`;

const METRICS: Record<string, MetricDef> = {
  public: {
    label: 'Public Land %', field: () => 'publicPct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Federal + state land, from IDFG unit pages. Does not include Access Yes!.',
  },
  huntable: {
    label: 'Public + Access Yes! %', field: () => 'huntablePct', ramp: GREEN, fmt: pctOf, none: 'No data',
    note: 'Public land plus private land enrolled in Access Yes! (open to hunting by agreement).',
  },
  success: {
    label: 'General Success %', bySpecies: true, ramp: ORANGE, fmt: pctOf, none: 'No general season / under 50 hunters',
    field: (sp) => (sp === 'ELK' ? 'genSuccessElk' : 'genSuccessDeer'),
    note: 'Harvest ÷ hunters, general seasons, all weapons, last 5 seasons (only seasons after a boundary change).',
  },
  pressure: {
    label: 'General Hunters / Sq Mi', bySpecies: true, ramp: PLUM, fmt: num, none: 'No general season',
    field: (sp) => (sp === 'ELK' ? 'huntersSqMiElk' : 'huntersSqMiDeer'),
    note: 'Average general-season hunters per year (all weapons) ÷ unit square miles. Darker = more crowded.',
  },
  odds: {
    label: 'Best Antlered Draw Odds', ramp: ORANGE, fmt: (v) => pctOf(v * 100), none: 'No antlered controlled hunts',
    field: (_sp, nr) => (nr ? 'bestNrOdds' : 'bestResOdds'),
    note: 'Best 5-year first-choice odds of any adult antlered controlled hunt touching the unit, for your residency (antlerless and youth hunts left out).',
  },
};
type Metric = keyof typeof METRICS;
const NODATA = '#e0ddd5';
interface Classes { breaks: number[]; counts: number[] }
/** Spread n colors across a 6-color ramp, keeping the darkest. */
const pickRamp = (ramp: string[], n: number) => Array.from({ length: n }, (_, i) => ramp[n === 1 ? ramp.length - 1 : Math.round((i * (ramp.length - 1)) / (n - 1))]);

export function UnitMap({ nr, focus, height = '100%', savedUnits = [], signedIn = false }: { nr: boolean; focus?: string; height?: string; savedUnits?: string[]; signedIn?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [metric, setMetric] = useState<Metric>('public');
  const [sp, setSp] = useState<Sp>('ELK');
  const [classes, setClasses] = useState<Record<string, Classes>>({});
  const [missing, setMissing] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Props | null>(null);
  const [open, setOpen] = useState(false);
  type UH = { id: string; type: 'GENERAL' | 'CONTROLLED' | 'NRTAG'; label: string; antler: string; resOdds5: number | null; nrOdds5: number | null; success5: number | null };
  const [uh, setUh] = useState<{ unit: string; rows: UH[] } | null>(null);
  const selName = sel ? String(sel.name) : null;
  useEffect(() => {
    if (!selName || selName === focus) return;
    let live = true;
    fetch(`/api/units/${encodeURIComponent(selName)}/hunts`).then((r) => r.json()).then((rows: UH[]) => live && setUh({ unit: selName, rows })).catch(() => live && setUh({ unit: selName, rows: [] }));
    return () => { live = false; };
  }, [selName, focus]);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<Basemap>('topo');
  useEffect(() => {
    if (map.current?.isStyleLoaded()) setBasemap(map.current, kind);
  }, [kind]);

  const M = METRICS[metric];
  const field = M.field(sp, nr);
  const cls = classes[field];
  const colors = useMemo(() => (cls ? pickRamp(M.ramp, cls.breaks.length + 1) : []), [cls, M.ramp]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('topo'), center: [-114.6, 45.0], zoom: 5.2, maxZoom: 15, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', async () => {
      try {
        // versioned URL: an hour-cached response from before a deploy must not be reused
        const fc = await (await fetch('/api/units?v=3')).json();
        const fields = [...new Set(Object.values(METRICS).flatMap((x) => [x.field('DEER', false), x.field('ELK', false), x.field('DEER', true)]))];
        const vals = (k: string) => fc.features.map((f: { properties: Props }) => f.properties[k]).filter((x: unknown): x is number => typeof x === 'number');
        // breaks normally come from the server; compute them here if they're missing
        const cl: Record<string, Classes> = { ...(fc.classes ?? {}) };
        for (const k of fields) if (!cl[k]) cl[k] = classBreaks(vals(k));
        setClasses(cl);
        const miss: Record<string, number> = {};
        for (const k of fields) miss[k] = fc.features.length - vals(k).length;
        setMissing(miss);
        m.addSource('units', { type: 'geojson', data: fc, promoteId: 'name' });
        m.addLayer({ id: 'units-fill', type: 'fill', source: 'units', paint: { 'fill-color': '#ccc', 'fill-opacity': 0.62 } });
        m.addLayer({ id: 'units-line', type: 'line', source: 'units', paint: { 'line-color': '#1d2023', 'line-width': 0.8 } });
        m.addLayer({
          id: 'units-sel', type: 'line', source: 'units',
          paint: { 'line-color': '#eb6834', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0] },
        });
        m.addLayer({
          id: 'units-label', type: 'symbol', source: 'units',
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': false },
          paint: { 'text-color': '#1d1d1b', 'text-halo-color': '#fff', 'text-halo-width': 1.2 },
        });
        let prev: string | null = null;
        const select = (name: string, props: Props) => {
          if (prev) m.setFeatureState({ source: 'units', id: prev }, { sel: false });
          m.setFeatureState({ source: 'units', id: name }, { sel: true });
          prev = name;
          setSel(props);
        };
        m.on('click', 'units-fill', (e) => {
          const f = e.features?.[0];
          if (f) select(String(f.properties.name), f.properties as Props);
        });
        m.on('mouseenter', 'units-fill', () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', 'units-fill', () => (m.getCanvas().style.cursor = ''));
        if (focus) {
          const f = fc.features.find((x: { properties: Props }) => x.properties.name === focus);
          if (f) {
            select(focus, f.properties);
            setSel(null);
            const b = new maplibregl.LngLatBounds();
            const walk = (c: unknown): void => (Array.isArray(c) && typeof c[0] === 'number' ? void b.extend(c as [number, number]) : (c as unknown[]).forEach(walk));
            walk(f.geometry.coordinates);
            m.fitBounds(b, { padding: 40, duration: 0 });
          }
        }
        m.fire('metric');
      } catch (e) {
        setErr('Could not load unit boundaries.');
        console.error(e);
      }
    });
    return () => {
      m.remove();
      map.current = null;
    };
  }, [focus]);

  // recolor when the metric changes
  useEffect(() => {
    const m = map.current;
    const apply = () => {
      if (!m?.getLayer('units-fill') || !cls) return;
      const steps: (string | number)[] = [colors[0]];
      cls.breaks.forEach((b, i) => steps.push(b, colors[i + 1]));
      const color = (cls.breaks.length
        ? ['case', ['!=', ['typeof', ['get', field]], 'number'], NODATA, ['step', ['get', field], ...steps]]
        : ['case', ['!=', ['typeof', ['get', field]], 'number'], NODATA, colors[0]]) as unknown as ExpressionSpecification;
      m.setPaintProperty('units-fill', 'fill-color', color);
    };
    apply();
    m?.on('metric', apply);
    return () => void m?.off('metric', apply);
  }, [field, cls, colors]);

  const v = (k: string) => (sel && sel[k] !== null && sel[k] !== undefined ? Number(sel[k]) : null);

  return (
    <div style={{ position: 'relative', height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="card mappanel">
        <div className="mp-row">
          <select id="metric" aria-label="Color units by" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {Object.entries(METRICS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
          </select>
          {M.bySpecies && (
            <div className="seg light mp-seg" role="group" aria-label="Species">
              <button type="button" aria-pressed={sp === 'ELK'} onClick={() => setSp('ELK')}>Elk</button>
              <button type="button" aria-pressed={sp === 'DEER'} onClick={() => setSp('DEER')}>Deer</button>
            </div>
          )}
          <button type="button" className="mp-more" aria-expanded={open} aria-label={open ? 'Hide map key details' : 'Show map key details'} onClick={() => setOpen((o) => !o)}>
            {open ? '▴' : '▾'}
          </button>
        </div>
        {cls && (
          <div className="mp-strip" role="list" aria-label="Map key">
            {colors.map((c, i) => {
              const b = cls.breaks;
              const tick = !b.length ? 'All' : i === 0 ? `<${M.fmt(b[0])}` : M.fmt(b[i - 1]);
              const full = !b.length ? 'All units' : i === 0 ? `Under ${M.fmt(b[0])}` : i === b.length ? `${M.fmt(b[i - 1])}+` : `${M.fmt(b[i - 1])} to ${M.fmt(b[i])}`;
              return (
                <div key={i} className="mp-cell" role="listitem" title={`${full}: ${cls.counts[i]} units`}>
                  <i style={{ background: c }} />
                  <span>{tick}</span>
                </div>
              );
            })}
            {missing[field] ? <div className="mp-cell nd" role="listitem" title={`${M.none}: ${missing[field]} units`}><i style={{ background: NODATA }} /><span>n/a</span></div> : null}
          </div>
        )}
        {open && (
          <div className="mp-details">
            {cls && (
              <table className="legend-t small">
                <tbody>
                  {colors.map((c, i) => {
                    const b = cls.breaks;
                    const label = !b.length ? 'All units' : i === 0 ? `Under ${M.fmt(b[0])}` : i === b.length ? `${M.fmt(b[i - 1])}+` : `${M.fmt(b[i - 1])} to ${M.fmt(b[i])}`;
                    return <tr key={i}><td><i style={{ background: c }} /></td><td>{label}</td><td className="n">{cls.counts[i]} units</td></tr>;
                  }).reverse()}
                  {missing[field] ? <tr><td><i style={{ background: NODATA }} /></td><td>{M.none}</td><td className="n">{missing[field]}</td></tr> : null}
                </tbody>
              </table>
            )}
            <p className="small muted" style={{ margin: '4px 0 8px' }}>{M.note} Each shade holds a similar number of units.</p>
            <div className="seg light" role="group" aria-label="Base map">
              <button type="button" aria-pressed={kind === 'topo'} onClick={() => setKind('topo')}>Topo</button>
              <button type="button" aria-pressed={kind === 'satellite'} onClick={() => setKind('satellite')}>Satellite</button>
            </div>
          </div>
        )}
        {err && <p className="small" style={{ color: 'var(--bad)', margin: '6px 0 0' }}>{err}</p>}
      </div>
      {sel && (
        <div className="card mapinfo">
          <button type="button" className="mapinfo-x" aria-label="Close unit details" onClick={() => setSel(null)}>×</button>
          <h3 className="star-head" style={{ margin: '0 0 2px' }}>Unit {sel.name} <Star key={sel.name} kind="unit" id={sel.name} saved={savedUnits.includes(sel.name)} signedIn={signedIn} label /></h3>
          <div className="small muted">{sel.elkZone ? `${sel.elkZone} elk zone` : ''}{sel.acres ? ` · ${Math.round(Number(sel.acres)).toLocaleString()} acres` : ''}</div>
          <table className="small" style={{ width: '100%', marginTop: 6 }}>
            <tbody>
              <tr><td>Public land</td><td style={{ textAlign: 'right' }}>{v('publicPct') !== null ? `${Math.round(v('publicPct')!)}%` : '-'}</td></tr>
              <tr><td>Access Yes!</td><td style={{ textAlign: 'right' }}>{v('accessYesAcres') ? `${Math.round(v('accessYesAcres')!).toLocaleString()} ac (${v('accessYesPct')! < 1 ? '<1' : Math.round(v('accessYesPct')!)}%)` : 'none'}</td></tr>
              <tr><td>Public + Access Yes!</td><td style={{ textAlign: 'right' }}>{v('huntablePct') !== null ? `${Math.round(v('huntablePct')!)}%` : '-'}</td></tr>
              {(['Elk', 'Deer'] as const).map((s) => (
                <tr key={s}>
                  <td>General {s.toLowerCase()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {v(`genSuccessRaw${s}`) !== null ? `${Math.round(v(`genSuccessRaw${s}`)!)}% success` : '-'}
                    {v(`genHunters${s}`) !== null ? ` · ${v(`genHunters${s}`)!.toLocaleString()} hunters/yr (${num(v(`huntersSqMi${s}`) ?? 0)}/sq mi)` : ''}
                  </td>
                </tr>
              ))}
              <tr><td>Controlled hunts</td><td style={{ textAlign: 'right' }}>{v('controlled') ?? 0}</td></tr>
              <tr><td>Best antlered {nr ? 'NR' : 'res'} odds</td><td style={{ textAlign: 'right' }}>{v(nr ? 'bestNrOdds' : 'bestResOdds') !== null ? `${(v(nr ? 'bestNrOdds' : 'bestResOdds')! * 100).toFixed(1)}%` : '-'}</td></tr>
            </tbody>
          </table>
          {recentBoundaryChanges([sel.name]) && <p className="small" style={{ color: 'var(--warn-ink)', margin: '4px 0 0' }}>Boundary changed in {recentBoundaryChanges([sel.name])!.year}.</p>}
          {sel.name !== focus && (
            <div className="mi-hunts">
              <h4>Hunts Available</h4>
              {uh?.unit !== sel.name ? <p className="small muted">Loading…</p> : !uh.rows.length ? <p className="small muted">No deer or elk hunts listed.</p> : (
                <ul>
                  {uh.rows.map((h) => {
                    const o = nr ? h.nrOdds5 : h.resOdds5;
                    return (
                      <li key={h.id}>
                        <Link href={`/hunts/${encodeURIComponent(h.id)}`}>{h.label}</Link>
                        <span className="small muted">
                          {h.antler === 'ANTLERED' ? ' · Antlered' : h.antler === 'ANTLERLESS' ? ' · Antlerless' : ''}
                          {h.type === 'GENERAL' ? (nr ? ' · NR tag required' : ' · OTC') : o !== null ? ` · ${(o * 100).toFixed(o < 0.1 ? 1 : 0)}% ${h.type === 'NRTAG' ? '1st-choice ' : ''}odds` : ''}
                          {h.success5 !== null ? ` · ${Math.round(h.success5 * 100)}% success` : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {sel.name !== focus && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Link className="btn primary" href={`/units/${encodeURIComponent(sel.name)}`}>Unit Details</Link>
              <Link className="btn" href={`/hunts?unit=${encodeURIComponent(sel.name)}`}>Hunts Here</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
