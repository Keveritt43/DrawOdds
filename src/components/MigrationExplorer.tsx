'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle } from '@/lib/basemap';
import { IDAHO_BOUNDS } from '@/lib/mapMetrics';
import { loadUnits } from '@/lib/unitData';
import { md, MIG_SPECIES, STANDARD_CLASSES, SPECIES_NAME, keyNote, type MigClass } from '@/lib/migrationShared';
import { addStudy, setStudyVisible, studyLayers, MigrationKey } from './MigrationLayers';
import { LandToggles } from './LandLayers';

/** What the index needs about a study (no geometry). */
export interface StudyRow {
  slug: string; name: string; species: string; classes: MigClass[]; routes: boolean; units: string[];
  avgMiles: number | null; maxMiles: number | null; individuals: number | null; median: boolean;
  fallStart: string | null; fallEnd: string | null; springStart: string | null; springEnd: string | null; year: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The migration index: pick any mix of species, see every matching study's routes on one map (tap a route to see
 * which study it is), and the list of studies underneath, each linking to its full write-up.
 */
export function MigrationExplorer({ studies, initial }: { studies: StudyRow[]; initial: string[] }) {
  const [species, setSpecies] = useState<string[]>(initial.length ? initial : MIG_SPECIES);
  const [unit, setUnit] = useState('');
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [loading, setLoading] = useState(0);
  const [err, setErr] = useState('');

  const shown = useMemo(() => studies.filter((s) => species.includes(s.species) && (!unit || s.units.includes(unit))), [studies, species, unit]);
  const units = useMemo(() => [...new Set(studies.filter((s) => species.includes(s.species)).flatMap((s) => s.units))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)), [studies, species]);

  // keep the choice in the address so it can be shared and survives Back
  useEffect(() => {
    const u = new URL(window.location.href);
    if (species.length === MIG_SPECIES.length) u.searchParams.delete('species');
    else u.searchParams.set('species', species.join(','));
    if (unit) u.searchParams.set('unit', unit);
    else u.searchParams.delete('unit');
    window.history.replaceState(null, '', u);
  }, [species, unit]);
  useEffect(() => {
    const u = new URL(window.location.href).searchParams.get('unit');
    if (u) setUnit(u);
  }, []);

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('satellite'), bounds: IDAHO_BOUNDS, maxZoom: 15, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(new maplibregl.FullscreenControl({ container: el.current!.parentElement ?? undefined }), 'bottom-right');
    m.on('load', async () => {
      try {
        const { fc, labels } = await loadUnits();
        m.addSource('units', { type: 'geojson', data: fc as never, promoteId: 'name' });
        m.addLayer({ id: 'units-line', type: 'line', source: 'units', paint: { 'line-color': '#ffffff', 'line-width': 1.1, 'line-opacity': 0.8 } });
        if (!m.getSource('unit-labels')) m.addSource('unit-labels', { type: 'geojson', data: labels as never });
        m.addLayer({
          id: 'units-label', type: 'symbol', source: 'unit-labels',
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
          paint: { 'text-color': '#1d1d1b', 'text-halo-color': '#fff', 'text-halo-width': 1.4 },
        });
      } catch {
        /* routes still draw without unit outlines */
      }
      setMap(m);
    });
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);

  // draw the chosen studies, hide the rest, frame what's showing
  useEffect(() => {
    if (!map) return;
    let live = true;
    const want = new Set(shown.filter((s) => s.routes).map((s) => s.slug));
    for (const s of studies) if (!want.has(s.slug)) setStudyVisible(map, s.slug, false);
    const todo = studies.filter((s) => want.has(s.slug));
    setLoading(todo.length);
    Promise.all(
      todo.map((s) =>
        addStudy(map, s, 'units-label', 0.6)
          .then(({ bounds }) => {
            if (live) setStudyVisible(map, s.slug, want.has(s.slug));
            return bounds;
          })
          .catch(() => {
            setErr('Some migration routes did not load.');
            return null;
          })
          .finally(() => live && setLoading((n) => n - 1)),
      ),
    ).then((bs) => {
      if (!live) return;
      const all = new maplibregl.LngLatBounds();
      for (const b of bs) if (b && !b.isEmpty()) all.extend(b);
      if (!all.isEmpty()) map.fitBounds(all, { padding: 40, duration: 400, maxZoom: 10 });
    });
    return () => {
      live = false;
    };
  }, [map, shown, studies]);

  // tap a route: which studies are here
  useEffect(() => {
    if (!map) return;
    const bySlug = new Map(studies.map((s) => [s.slug, s]));
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const layers = shown.filter((s) => s.routes).flatMap((s) => studyLayers(s.slug)).filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');
      if (!layers.length) return;
      const hits = map.queryRenderedFeatures(e.point, { layers });
      const slugs = [...new Set(hits.map((f) => f.layer.id.replace(/^mig-/, '').replace(/-(fill|stop)$/, '')))];
      if (!slugs.length) return;
      const label = (k: string) => STANDARD_CLASSES.find((c) => c.key === k)?.label ?? k;
      const html = slugs
        .map((sl) => {
          const s = bySlug.get(sl);
          if (!s) return '';
          const cls = [...new Set(hits.filter((f) => f.layer.id.startsWith(`mig-${sl}-`)).map((f) => String(f.properties?.cls)))].map(label).join(', ');
          return `<div class="mig-pop"><span class="pill sp-${s.species.toLowerCase()}">${esc(SPECIES_NAME[s.species] ?? s.species)}</span> <a href="/migration/${encodeURIComponent(sl)}"><b>${esc(s.name)}</b></a><div class="small muted">${esc(cls)}${s.fallStart ? ` · fall ${esc(md(s.fallStart))} – ${esc(md(s.fallEnd))}` : ''}</div></div>`;
        })
        .join('');
      new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(html).addTo(map);
    };
    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, [map, shown, studies]);

  const toggle = (sp: string) => setSpecies((cur) => (cur.includes(sp) ? (cur.length > 1 ? cur.filter((x) => x !== sp) : cur) : [...cur, sp].sort((a, b) => MIG_SPECIES.indexOf(a as never) - MIG_SPECIES.indexOf(b as never))));
  const count = (sp: string) => studies.filter((s) => s.species === sp).length;
  const all = species.length === MIG_SPECIES.length;

  return (
    <>
      <div className="mig-filter" role="group" aria-label="Species">
        <button type="button" className={`chip${all ? ' on' : ''}`} aria-pressed={all} onClick={() => setSpecies([...MIG_SPECIES])}>All <span className="muted">{studies.length}</span></button>
        {MIG_SPECIES.map((sp) => (
          <button key={sp} type="button" className={`chip${species.includes(sp) && !all ? ' on' : ''}`} aria-pressed={species.includes(sp)} onClick={() => (all ? setSpecies([sp]) : toggle(sp))}>
            {SPECIES_NAME[sp]} <span className="muted">{count(sp)}</span>
          </button>
        ))}
        <label className="small mig-unit-pick">
          Unit{' '}
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Any</option>
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <span className="small muted">{!all && 'Tap a species to add or remove it. '}{shown.length} {shown.length === 1 ? 'study' : 'studies'}{loading > 0 ? ` · loading ${loading}…` : ''}</span>
      </div>

      <div style={{ position: 'relative', height: 'min(640px, 75vh)' }} className="card">
        <div ref={el} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }} />
        <div className="card mig-panel">
          <MigrationKey classes={STANDARD_CLASSES} />
          <p className="muted" style={{ margin: '4px 0 0' }}>{keyNote(species)} Tap a route for its study. Overlapping studies stack.</p>
          {err && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>{err}</p>}
        </div>
        <div className="card land-float"><LandToggles map={map} before="units-line" /></div>
      </div>

      <div className="mig-studies">
        {shown.map((s) => (
          <Link key={s.slug} href={`/migration/${s.slug}`} className="card mig-study">
            <div className="mig-study-top"><span className={`pill sp-${s.species.toLowerCase()}`}>{SPECIES_NAME[s.species]}</span><span className="small muted">{s.year}</span></div>
            <h3>{s.name.replace(/ Migration$/, '')}</h3>
            <dl>
              <div><dt>Fall move</dt><dd>{s.fallStart ? `${md(s.fallStart)} – ${md(s.fallEnd)}` : '-'}</dd></div>
              <div><dt>{s.median ? 'Median' : 'Avg'} trip</dt><dd>{s.avgMiles !== null ? `${s.avgMiles} mi` : '-'}{s.maxMiles !== null ? <span className="muted"> (max {s.maxMiles})</span> : null}</dd></div>
              <div><dt>Collared</dt><dd>{s.individuals ?? '-'}</dd></div>
              <div><dt>Units</dt><dd>{s.units.length ? s.units.join(', ') : '-'}</dd></div>
            </dl>
            {!s.routes && <p className="small muted" style={{ margin: '6px 0 0' }}>Report stats only; no route map yet.</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
