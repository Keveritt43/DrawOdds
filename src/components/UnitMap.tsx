'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { recentBoundaryChanges } from '@/lib/boundaries';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import Link from 'next/link';
import { Star } from './Star';
import { MapKey, KeySeg } from './MapKey';
import { MigrationControls, type StudyLite } from './MigrationLayers';
import { METRICS, METRIC_KEYS, colorsFor, isMsgSuccess, fixedScale, fillExpression, fmtNum as num, IDAHO_BOUNDS, type Classes, type Metric, type Sp } from '@/lib/mapMetrics';
import { loadUnits } from '@/lib/unitData';
import { antlerLabel } from '@/lib/format';

type Props = Record<string, string | number | boolean | null | undefined> & { name: string };

const SCALE_NOTE: Record<string, string> = { odds: ' Fixed scale: under 2%, 2-5, 5-10, 10-15 (yellow), 15-30, 30-50, 50-80, 80%+.', fill: ' Fixed scale: 20-30% is yellow.', land: ' Fixed scale: 50-60% is yellow.', objective: '' };

/** `bare`: just the unit on the map (unit pages), no shading or key. */
export function UnitMap({ nr, focus, height = '100%', savedUnits = [], signedIn = false, draw = 'DEP', bare = false, migrations = [] }: { nr: boolean; focus?: string; height?: string; savedUnits?: string[]; signedIn?: boolean; draw?: 'DEP' | 'MSG'; bare?: boolean; migrations?: StudyLite[] }) {
  const [mapObj, setMapObj] = useState<MlMap | null>(null);
  const msg = draw === 'MSG';
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [metric, setMetric] = useState<Metric>('public');
  // basic filters: which animal and which kind of hunt the shading (and the unit's hunt list) is about
  const [sp, setSpRaw] = useState<Sp>(msg ? 'MOOSE' : 'ELK');
  const [htype, setHtypeRaw] = useState<'GENERAL' | 'CONTROLLED'>(msg ? 'CONTROLLED' : 'GENERAL');
  // the header's drawing switch: start over on that drawing's species
  useEffect(() => {
    setSpRaw(msg ? 'MOOSE' : 'ELK');
    setHtypeRaw(msg ? 'CONTROLLED' : 'GENERAL');
    setMetric((m) => (METRICS[m].kind === 'land' ? m : msg ? 'ctlOdds' : 'success'));
  }, [msg]);
  const setSp = (x: Sp) => {
    setSpRaw(x);
    // pronghorn, moose, sheep and goat are controlled only
    if (x !== 'DEER' && x !== 'ELK') setHtype('CONTROLLED');
  };
  const setHtype = (t: 'GENERAL' | 'CONTROLLED') => {
    setHtypeRaw(t);
    // keep a land shading; otherwise switch to the same kind of number for the new hunt type
    setMetric((m) => (METRICS[m].kind === 'land' ? m : t === 'CONTROLLED' ? (m === 'pressure' ? 'ctlSuccess' : 'ctlOdds') : 'success'));
  };
  const options = METRIC_KEYS.filter((k) => METRICS[k].kind === 'land' || METRICS[k].kind === (htype === 'CONTROLLED' ? 'controlled' : 'general'))
    .map((k) => ({ value: k, label: METRICS[k].label }));
  const [classes, setClasses] = useState<Record<string, Classes>>({});
  const [missing, setMissing] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Props | null>(null);
  type UH = { id: string; type: 'GENERAL' | 'CONTROLLED' | 'NRTAG'; label: string; species: string; antler: string; resOdds5: number | null; nrOdds5: number | null; success5: number | null };
  const [uh, setUh] = useState<{ unit: string; rows: UH[] } | null>(null);
  const selName = sel ? String(sel.name) : null;
  useEffect(() => {
    if (!selName || selName === focus) return;
    let live = true;
    fetch(`/api/units/${encodeURIComponent(selName)}/hunts`).then((r) => r.json()).then((rows: UH[]) => live && setUh({ unit: selName, rows })).catch(() => live && setUh({ unit: selName, rows: [] }));
    return () => { live = false; };
  }, [selName, focus]);
  const [err, setErr] = useState('');
  const [kind, setKind] = useState<Basemap>('satellite');
  useEffect(() => {
    if (map.current?.isStyleLoaded()) setBasemap(map.current, kind);
  }, [kind]);

  const M = METRICS[metric];
  const field = M.field(sp, nr);
  const cls = classes[field];
  const colors = useMemo(() => (cls ? colorsFor(cls, M.better) : []), [cls, M.better]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('satellite'), bounds: IDAHO_BOUNDS, fitBoundsOptions: { padding: { top: 96, bottom: 16, left: 16, right: 16 } }, maxZoom: 15, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('load', async () => {
      try {
        const { fc, classes: cl, missing: miss } = await loadUnits();
        setClasses(cl);
        setMissing(miss);
        m.addSource('units', { type: 'geojson', data: fc as never, promoteId: 'name' });
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
          const f = fc.features.find((x) => x.properties.name === focus);
          if (f) {
            select(focus, f.properties as Props);
            setSel(null);
            const b = new maplibregl.LngLatBounds();
            const walk = (c: unknown): void => (Array.isArray(c) && typeof c[0] === 'number' ? void b.extend(c as [number, number]) : (c as unknown[]).forEach(walk));
            walk(f.geometry.coordinates);
            m.fitBounds(b, { padding: { top: 96, bottom: 30, left: 30, right: 30 }, duration: 0 });
          }
        }
        if (!focus) {
          // frame Idaho below the key in the top-left corner
          const kh = (el.current?.parentElement?.querySelector('.mappanel') as HTMLElement | null)?.offsetHeight ?? 80;
          m.fitBounds(IDAHO_BOUNDS, { padding: { top: Math.min(kh + 14, m.getContainer().clientHeight * 0.4), bottom: 16, left: 16, right: 16 }, duration: 0 });
        }
        m.fire('metric');
        setMapObj(m);
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
      if (bare) {
        // the unit itself, lightly tinted; neighbours just outlined
        m.setPaintProperty('units-fill', 'fill-color', ['case', ['==', ['get', 'name'], focus ?? ''], '#eb6834', '#ffffff'] as ExpressionSpecification);
        m.setPaintProperty('units-fill', 'fill-opacity', ['case', ['==', ['get', 'name'], focus ?? ''], 0.18, 0.02] as ExpressionSpecification);
        m.setPaintProperty('units-line', 'line-color', '#ffffff');
        return;
      }
      if (!cls) return;
      m.setPaintProperty('units-fill', 'fill-color', fillExpression(field, cls, colors) as ExpressionSpecification);
    };
    apply();
    m?.on('metric', apply);
    return () => void m?.off('metric', apply);
  }, [field, cls, colors, bare, focus]);

  // the selected unit's hunts, narrowed to the key's animal and hunt type (zone / NR tags count as general)
  const shownHunts = (uh?.rows ?? []).filter((h) => (!h.species || h.species === sp) && (htype === 'CONTROLLED' ? h.type === 'CONTROLLED' : h.type !== 'CONTROLLED'));
  const v = (k: string) => (sel && sel[k] !== null && sel[k] !== undefined ? Number(sel[k]) : null);

  return (
    <div style={{ position: 'relative', height }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {bare && migrations.length > 0 && <MigrationControls map={mapObj} studies={migrations} before="units-label" />}
      {bare ? (
        <Link className="card bare-link small" href={`/map`}>Shade by odds, success, land or elk objectives on the Unit Map →</Link>
      ) : <MapKey
        filters={<>
          <KeySeg label="Animal" value={sp} onChange={setSp} options={msg ? [['MOOSE', 'Moose'], ['BIGHORN', 'Sheep'], ['GOAT', 'Goat']] : [['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn']]} />
          {!msg && <KeySeg label="Hunts" value={htype} onChange={setHtype} options={[['GENERAL', 'General', sp === 'PRONGHORN'], ['CONTROLLED', 'Controlled']]} />}
        </>}
        value={metric} options={options} onChange={(x) => setMetric(x as Metric)}
        ramp={{ classes: cls, colors, fmt: M.fmt, none: M.none, missing: missing[field] ?? 0, unit: 'units', labels: M.labels }}
        note={`${M.note}${M.bySpecies ? ` Showing ${({ ELK: 'elk', DEER: 'deer', PRONGHORN: 'pronghorn', MOOSE: 'moose', BIGHORN: 'bighorn sheep', GOAT: 'mountain goat' })[sp]}${M.kind === 'controlled' ? `, ${nr ? 'nonresident' : 'resident'} odds` : ''}.` : ''}${isMsgSuccess(field) ? ' Judged against fixed standards: 60-70% is yellow, 70%+ green, under 50% orange.' : SCALE_NOTE[fixedScale(field) ?? ''] ?? ' Yellow = normal for Idaho; red and green = well below or above it.'}`}
        extraItems={focus ? [{ color: '#eb6834', label: `Unit ${focus}`, line: true }] : []} kind={kind} onKind={setKind} err={err} />}
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
              {((msg ? [] : ['Elk', 'Deer']) as ('Elk' | 'Deer')[]).map((s) => (
                <tr key={s}>
                  <td>General {s.toLowerCase()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {v(`genSuccessRaw${s}`) !== null ? `${Math.round(v(`genSuccessRaw${s}`)!)}% success` : '-'}
                    {v(`genHunters${s}`) !== null ? ` · ${v(`genHunters${s}`)!.toLocaleString()} hunters/yr (${num(v(`huntersSqMi${s}`) ?? 0)}/sq mi)` : ''}
                  </td>
                </tr>
              ))}
              <tr><td>Controlled hunts</td><td style={{ textAlign: 'right' }}>{v('controlled') ?? 0}</td></tr>
              {((msg ? ['Moose', 'Bighorn', 'Goat'] : ['Elk', 'Deer', 'Pronghorn']) as string[]).map((s) => (
                <tr key={`c${s}`}>
                  <td>Controlled {s === 'Bighorn' ? 'sheep' : s.toLowerCase()}</td>
                  <td style={{ textAlign: 'right' }}>
                    {v(`ctlCount${s}`) ? `${v(`ctlCount${s}`)} ${msg ? '' : 'buck/bull '}hunt${v(`ctlCount${s}`) === 1 ? '' : 's'}` : '-'}
                    {v(`ctlOdds${nr ? 'Nr' : 'Res'}${s}`) !== null ? ` · best ${nr ? 'NR' : 'res'} odds ${(v(`ctlOdds${nr ? 'Nr' : 'Res'}${s}`)! * 100).toFixed(1)}%` : ''}
                    {v(`ctlSuccess${s}`) !== null ? ` · ${Math.round(v(`ctlSuccess${s}`)!)}% success` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recentBoundaryChanges([sel.name]) && <p className="small" style={{ color: 'var(--warn-ink)', margin: '4px 0 0' }}>Boundary changed in {recentBoundaryChanges([sel.name])!.year}.</p>}
          {sel.name !== focus && (
            <div className="mi-hunts">
              <h4>{({ ELK: 'Elk', DEER: 'Deer', PRONGHORN: 'Pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn Sheep', GOAT: 'Mountain Goat' })[sp]} {htype === 'CONTROLLED' ? 'Controlled' : 'General'} Hunts</h4>
              {uh?.unit !== sel.name ? <p className="small muted">Loading…</p> : !shownHunts.length ? <p className="small muted">No {htype === 'CONTROLLED' ? 'controlled' : 'general'} {sp.toLowerCase()} hunts here.</p> : (
                <ul>
                  {shownHunts.map((h) => {
                    const o = nr ? h.nrOdds5 : h.resOdds5;
                    return (
                      <li key={h.id}>
                        <Link href={`/hunts/${encodeURIComponent(h.id)}`}>{h.label}</Link>
                        <span className="small muted">
                          {h.antler && h.antler !== 'EITHER' ? ` · ${antlerLabel(h.species, h.antler)}` : ''}
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
