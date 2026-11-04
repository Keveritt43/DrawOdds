'use client';

import { useEffect, useState } from 'react';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import { STANDARD_CLASSES, SPECIES_NAME, keyNote, type MigClass } from '@/lib/migrationShared';


export interface StudyLite { slug: string; name: string; species: string; classes: MigClass[]; routes?: boolean }


const HATCH = 'mig-hatch';
/** Diagonal black lines on transparent: the study map's stopover crosshatch. */
function ensureHatch(m: MlMap) {
  if (m.hasImage(HATCH)) return;
  const n = 10;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const on = (x + y) % n < 2;
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 17;
      data[i + 3] = on ? 230 : 0;
    }
  }
  m.addImage(HATCH, { width: n, height: n, data });
}

const loaded = new WeakMap<MlMap, Map<string, Promise<{ bounds: maplibregl.LngLatBounds }>>>();

/** Fill layer ids of a study (for click queries). */
export const studyLayers = (slug: string) => [`mig-${slug}-fill`, `mig-${slug}-stop`];

/** Adds a study's corridor and stopover layers (once per map) under the unit labels. */
export function addStudy(m: MlMap, s: StudyLite, before?: string, opacity = 0.72): Promise<{ bounds: maplibregl.LngLatBounds }> {
  const mine = loaded.get(m) ?? loaded.set(m, new Map()).get(m)!;
  const existing = mine.get(s.slug);
  if (existing) return existing;
  const p = fetch(`/api/migrations/${encodeURIComponent(s.slug)}`)
    .then((r) => {
      if (!r.ok) throw new Error(`migration ${r.status}`);
      return r.json();
    })
    .then((fc) => {
      ensureHatch(m);
      const src = `mig-${s.slug}`;
      if (!m.getSource(src)) m.addSource(src, { type: 'geojson', data: fc });
      const corridor = s.classes.filter((c) => !c.pattern);
      const color: unknown[] = ['match', ['get', 'cls']];
      for (const c of corridor) color.push(c.key, c.color);
      color.push('#999');
      const b4 = before && m.getLayer(before) ? before : undefined;
      if (!m.getLayer(`${src}-fill`)) {
        m.addLayer({ id: `${src}-fill`, type: 'fill', source: src, filter: ['!=', ['get', 'cls'], 'STOPOVER'], paint: { 'fill-color': color as ExpressionSpecification, 'fill-opacity': opacity } }, b4);
        m.addLayer({ id: `${src}-stop`, type: 'fill', source: src, filter: ['==', ['get', 'cls'], 'STOPOVER'], paint: { 'fill-pattern': HATCH } }, b4);
        m.addLayer({ id: `${src}-stop-line`, type: 'line', source: src, filter: ['==', ['get', 'cls'], 'STOPOVER'], paint: { 'line-color': '#111', 'line-width': 1 } }, b4);
      }
      const bounds = new maplibregl.LngLatBounds();
      const walk = (c: unknown): void => (Array.isArray(c) && typeof c[0] === 'number' ? void bounds.extend(c as [number, number]) : (c as unknown[]).forEach(walk));
      for (const f of fc.features) walk(f.geometry.coordinates);
      return { bounds };
    });
  mine.set(s.slug, p);
  p.catch(() => mine.delete(s.slug));
  return p;
}

export function setStudyVisible(m: MlMap, slug: string, on: boolean) {
  for (const id of [`mig-${slug}-fill`, `mig-${slug}-stop`, `mig-${slug}-stop-line`]) {
    if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
}

/** Legend for a study's use classes, in the study map's colors. */
export function MigrationKey({ classes }: { classes: MigClass[] }) {
  return (
    <div className="mig-key" aria-label="Migration route use">
      {classes.map((c) => (
        <span key={c.key}>
          <i className={c.pattern ? 'hatch' : ''} style={c.pattern ? undefined : { background: c.color }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

/**
 * On / off switches for the studies on a map (grouped by species), with one shared key. `map` is the live MapLibre
 * map (null until it loads). Studies start off unless `defaultOn`. Studies without route polygons are listed with a
 * link only.
 */
export function MigrationControls({ map, studies, defaultOn = false, fit = false, before }: { map: MlMap | null; studies: StudyLite[]; defaultOn?: boolean; fit?: boolean; before?: string }) {
  const drawable = studies.filter((s) => s.routes !== false);
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(drawable.map((s) => [s.slug, defaultOn])));
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!map) return;
    for (const s of drawable) {
      if (!on[s.slug]) {
        setStudyVisible(map, s.slug, false);
        continue;
      }
      addStudy(map, s, before)
        .then(({ bounds }) => {
          setStudyVisible(map, s.slug, true);
          if (fit) map.fitBounds(bounds, { padding: 40, duration: 0 });
        })
        .catch(() => setErr('Could not load the migration routes.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, on, studies, fit, before]);
  if (!studies.length) return null;
  const groups = Object.keys(SPECIES_NAME).map((sp) => [sp, studies.filter((s) => s.species === sp)] as const).filter(([, g]) => g.length);
  const shown = drawable.filter((s) => on[s.slug]);
  return (
    <div className="card mig-panel">
      {groups.map(([sp, g]) => (
        <div key={sp} className="mig-row">
          <div className="mig-sp">{SPECIES_NAME[sp]}</div>
          {g.map((s) => (
            <div key={s.slug}>
              {s.routes === false ? (
                <span className="muted"><a href={`/migration/${s.slug}`}>{s.name}</a> (no map)</span>
              ) : (
                <label>
                  <input type="checkbox" checked={!!on[s.slug]} onChange={() => setOn((o) => ({ ...o, [s.slug]: !o[s.slug] }))} /> <b>{s.name.replace(/ Migration$/, '')}</b>
                </label>
              )}
            </div>
          ))}
        </div>
      ))}
      {shown.length > 0 && (
        <>
          <MigrationKey classes={STANDARD_CLASSES.filter((c) => shown.some((s) => s.classes.some((k) => k.key === c.key && !k.notMapped)))} />
          <p className="muted" style={{ margin: '4px 0 0' }}>{keyNote(shown.map((s) => s.species))}</p>
        </>
      )}
      {err && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>{err}</p>}
    </div>
  );
}
