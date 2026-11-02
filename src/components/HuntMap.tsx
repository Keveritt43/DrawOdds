'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, IDAHO_CENTER, type Basemap } from '@/lib/basemap';

/**
 * Filtering map: units with a matching hunt are filled blaze orange, the rest are outlines only.
 * Click a unit to narrow the results to it (click again to clear).
 */
export function HuntMap({ matched, selected, chips }: { matched: string[]; selected: string; chips: { label: string; href: string }[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const prevMatched = useRef<string[]>([]);
  const prevSel = useRef('');
  const [kind, setKind] = useState<Basemap>('topo');
  const router = useRouter();
  const sp = useSearchParams();
  const spRef = useRef(sp);
  spRef.current = sp;

  const paint = () => {
    const m = map.current;
    if (!m || !loaded.current) return;
    for (const u of prevMatched.current) m.setFeatureState({ source: 'units', id: u }, { match: false });
    for (const u of matched) m.setFeatureState({ source: 'units', id: u }, { match: true });
    prevMatched.current = matched;
    if (prevSel.current) m.setFeatureState({ source: 'units', id: prevSel.current }, { sel: false });
    if (selected) m.setFeatureState({ source: 'units', id: selected }, { sel: true });
    prevSel.current = selected;
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('topo'), center: IDAHO_CENTER, zoom: 5.3, minZoom: 4, maxZoom: 15, attributionControl: { compact: true } });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('load', async () => {
      const fc = await (await fetch('/api/units')).json();
      m.addSource('units', { type: 'geojson', data: fc, promoteId: 'name' });
      m.addLayer({
        id: 'units-fill', type: 'fill', source: 'units',
        paint: { 'fill-color': '#f0641e', 'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], false], 0.38, 0.02] },
      });
      m.addLayer({
        id: 'units-line', type: 'line', source: 'units',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'match'], false], '#b8460b', '#1d2023'],
          'line-width': ['case', ['boolean', ['feature-state', 'match'], false], 1.6, 0.8],
          'line-opacity': 0.85,
        },
      });
      m.addLayer({
        id: 'units-sel', type: 'line', source: 'units',
        paint: { 'line-color': '#1d2023', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, 0] },
      });
      m.addLayer({
        id: 'units-label', type: 'symbol', source: 'units',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#1d2023', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });
      m.on('click', 'units-fill', (e) => {
        const name = String(e.features?.[0]?.properties?.name ?? '');
        if (!name) return;
        const p = new URLSearchParams(spRef.current.toString());
        if (p.get('unit') === name) p.delete('unit');
        else p.set('unit', name);
        p.delete('page');
        router.push(`/hunts${p.size ? `?${p}` : ''}`, { scroll: false });
      });
      m.on('mouseenter', 'units-fill', () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', 'units-fill', () => (m.getCanvas().style.cursor = ''));
      loaded.current = true;
      paint();
    });
    return () => {
      m.remove();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(paint, [matched.join(','), selected]);
  useEffect(() => {
    if (map.current && loaded.current) setBasemap(map.current, kind);
  }, [kind]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {chips.length > 0 && (
        <div className="chipsbar" aria-label="Active filters">
          {chips.map((c) => <a key={c.label} href={c.href} title="Remove filter">{c.label}</a>)}
        </div>
      )}
      <div className="basemap-toggle" role="group" aria-label="Base map">
        <button type="button" aria-pressed={kind === 'topo'} onClick={() => setKind('topo')}>Topo</button>
        <button type="button" aria-pressed={kind === 'satellite'} onClick={() => setKind('satellite')}>Satellite</button>
      </div>
    </div>
  );
}
