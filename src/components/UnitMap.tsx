'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import Link from 'next/link';

type Props = Record<string, string | number | boolean | null | undefined> & { name: string };

const METRICS = {
  publicPct: { label: 'Public Land %', scale: [0, 25, 50, 75, 100], unit: '%', fmt: (v: number) => `${Math.round(v)}%` },
  accessYesPct: { label: 'Access Yes! % (Private Land Open To Hunting)', scale: [0, 0.5, 2, 5, 10], unit: '%', fmt: (v: number) => `${v}%` },
  huntablePct: { label: 'Huntable % (Public + Access Yes!)', scale: [0, 25, 50, 75, 100], unit: '%', fmt: (v: number) => `${Math.round(v)}%` },
  deerSuccess: { label: 'General Deer Success (Any Weapon)', scale: [0, 0.15, 0.3, 0.45, 0.6], unit: '', fmt: (v: number) => `${Math.round(v * 100)}%` },
  elkSuccess: { label: 'General Elk Success (Any Weapon)', scale: [0, 0.08, 0.16, 0.24, 0.32], unit: '', fmt: (v: number) => `${Math.round(v * 100)}%` },
  elkArchery: { label: 'General Elk Archery Success', scale: [0, 0.05, 0.1, 0.15, 0.2], unit: '', fmt: (v: number) => `${Math.round(v * 100)}%` },
  bestOdds: { label: 'Best Controlled-Hunt Odds (Yours)', scale: [0, 0.05, 0.15, 0.3, 0.6], unit: '', fmt: (v: number) => `${Math.round(v * 100)}%` },
  accessYesAcres: { label: 'Access Yes! Acres', scale: [0, 1000, 5000, 20000, 60000], unit: '', fmt: (v: number) => Math.round(v).toLocaleString() },
} as const;
type Metric = keyof typeof METRICS;
const RAMP = ['#fde7d9', '#f9b98f', '#f48a4f', '#f0641e', '#b8460b'];


export function UnitMap({ nr, focus, height = '100%' }: { nr: boolean; focus?: string; height?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [metric, setMetric] = useState<Metric>('publicPct');
  const [sel, setSel] = useState<Props | null>(null);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<Basemap>('topo');
  useEffect(() => {
    if (map.current?.isStyleLoaded()) setBasemap(map.current, kind);
  }, [kind]);

  const field = metric === 'bestOdds' ? (nr ? 'bestNrOdds' : 'bestResOdds') : metric;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('topo'), center: [-114.6, 45.0], zoom: 5.2, maxZoom: 15, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', async () => {
      try {
        const fc = await (await fetch('/api/units')).json();
        m.addSource('units', { type: 'geojson', data: fc, promoteId: 'name' });
        m.addLayer({ id: 'units-fill', type: 'fill', source: 'units', paint: { 'fill-color': '#ccc', 'fill-opacity': 0.55 } });
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
      if (!m?.getLayer('units-fill')) return;
      const s = METRICS[metric].scale;
      const color: ExpressionSpecification = [
        'case', ['==', ['get', field], null], '#e0ddd5',
        ['step', ['to-number', ['get', field]], RAMP[0], s[1], RAMP[1], s[2], RAMP[2], s[3], RAMP[3], s[4], RAMP[4]],
      ];
      m.setPaintProperty('units-fill', 'fill-color', color);
    };
    apply();
    m?.on('metric', apply);
    return () => void m?.off('metric', apply);
  }, [metric, field]);

  const M = METRICS[metric];
  const v = (k: string) => (sel && sel[k] !== null && sel[k] !== undefined ? Number(sel[k]) : null);

  return (
    <div style={{ position: 'relative', height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="card mappanel">
        <div className="seg light" role="group" aria-label="Base map" style={{ marginBottom: 8 }}>
          <button type="button" aria-pressed={kind === 'topo'} onClick={() => setKind('topo')}>Topo</button>
          <button type="button" aria-pressed={kind === 'satellite'} onClick={() => setKind('satellite')}>Satellite</button>
        </div>
        <label className="small" htmlFor="metric"><b>Color Units By</b></label>
        <select id="metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          {Object.entries(METRICS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <div className="legend">
          {M.scale.slice(0, 4).map((s, i) => <span key={i}><i style={{ background: RAMP[i] }} />{M.fmt(s)}+</span>)}
          <span><i style={{ background: '#e0ddd5' }} />no data</span>
        </div>
        {err && <p className="small" style={{ color: 'var(--bad)' }}>{err}</p>}
        {sel ? (
          <div>
            <h3 style={{ margin: '8px 0 4px' }}>Unit {sel.name}</h3>
            <div className="small muted">{sel.elkZone ? `${sel.elkZone} elk zone` : ''}{sel.acres ? ` · ${Math.round(Number(sel.acres)).toLocaleString()} acres` : ''}</div>
            <table className="small" style={{ width: '100%', marginTop: 6 }}>
              <tbody>
                <tr><td>Public land</td><td style={{ textAlign: 'right' }}>{v('publicPct') !== null ? `${Math.round(v('publicPct')!)}%` : '-'}</td></tr>
                <tr><td>Access Yes!</td><td style={{ textAlign: 'right' }}>{v('accessYesAcres') ? `${Math.round(v('accessYesAcres')!).toLocaleString()} ac (${v('accessYesPct')! < 1 ? '<1' : Math.round(v('accessYesPct')!)}%)` : 'none'}</td></tr>
                <tr><td>Huntable (public + AY!)</td><td style={{ textAlign: 'right' }}>{v('huntablePct') !== null ? `${Math.round(v('huntablePct')!)}%` : '-'}</td></tr>
                <tr><td>General deer success</td><td style={{ textAlign: 'right' }}>{v('deerSuccess') !== null ? `${Math.round(v('deerSuccess')! * 100)}%` : '-'}</td></tr>
                <tr><td>General elk success</td><td style={{ textAlign: 'right' }}>{v('elkSuccess') !== null ? `${Math.round(v('elkSuccess')! * 100)}%` : '-'}</td></tr>
                <tr><td>Controlled hunts</td><td style={{ textAlign: 'right' }}>{v('controlled') ?? 0}</td></tr>
                <tr><td>Best {nr ? 'NR' : 'res'} odds</td><td style={{ textAlign: 'right' }}>{v(nr ? 'bestNrOdds' : 'bestResOdds') !== null ? `${(v(nr ? 'bestNrOdds' : 'bestResOdds')! * 100).toFixed(1)}%` : '-'}</td></tr>
              </tbody>
            </table>
            {sel.boundaryChanged2022 ? <p className="small" style={{ color: 'var(--warn-ink)' }}>Boundary changed in 2022.</p> : null}
            {!focus && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Link className="btn primary" href={`/units/${encodeURIComponent(sel.name)}`}>Unit Details</Link>
                <Link className="btn" href={`/hunts?unit=${encodeURIComponent(sel.name)}`}>Hunts Here</Link>
              </div>
            )}
          </div>
        ) : (
          <p className="small muted">Click a unit to see its numbers.</p>
        )}
      </div>
    </div>
  );
}
