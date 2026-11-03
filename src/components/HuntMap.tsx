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
export function HuntMap({ matched, selected, chips, showZones = false, zones = [], areaSpecies = '', matchedAreas = [], selectedArea = '' }: {
  matched: string[]; selected: string; chips: { label: string; href: string }[]; showZones?: boolean; zones?: string[];
  /** a species hunted by its own hunt areas (pronghorn): draw those instead of filling units */
  areaSpecies?: string; matchedAreas?: string[]; selectedArea?: string;
}) {
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
      m.fire('ready'); // units layers exist now: overlays (elk zones) can attach
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

  // elk zone outlines (violet) whenever elk is in the results; the filtered zone is drawn heavier
  const zonesAdded = useRef(false);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = async () => {
      if (!loaded.current) return;
      if (showZones && !zonesAdded.current) {
        zonesAdded.current = true;
        try {
          const z = await (await fetch('/api/zones')).json();
          m.addSource('zones', { type: 'geojson', data: z.zones });
          m.addSource('zone-labels', { type: 'geojson', data: z.labels });
          m.addLayer({ id: 'zones-casing', type: 'line', source: 'zones', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.7 } }, 'units-label');
          m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#6a3fd6', 'line-width': 2.6 } }, 'units-label');
          m.addLayer({
            id: 'zones-label', type: 'symbol', source: 'zone-labels',
            layout: { 'text-field': ['concat', ['get', 'zone'], ' Zone'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.4], 'text-allow-overlap': false },
            paint: { 'text-color': '#4b23a8', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
          });
        } catch (e) {
          zonesAdded.current = false;
          console.error(e);
          return;
        }
      }
      if (!zonesAdded.current || !m.getLayer('zones-line')) return;
      const vis = showZones ? 'visible' : 'none';
      for (const id of ['zones-casing', 'zones-line', 'zones-label']) m.setLayoutProperty(id, 'visibility', vis);
      m.setPaintProperty('zones-line', 'line-width', zones.length ? ['case', ['in', ['get', 'zone'], ['literal', zones]], 4.5, 2] : 2.6);
    };
    apply();
    m.on('ready', apply);
    return () => void m.off('ready', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZones, zones.join(',')]);
  useEffect(() => {
    if (map.current && loaded.current) setBasemap(map.current, kind);
  }, [kind]);

  // hunt-area mode (pronghorn): its areas are filled, units become faint reference lines; click an area to narrow
  const areasLoaded = useRef('');
  const prevAreas = useRef<string[]>([]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = async () => {
      if (!loaded.current) return;
      if (areaSpecies && areasLoaded.current !== areaSpecies) {
        try {
          const fc = await (await fetch(`/api/areas?species=${areaSpecies}`)).json();
          if (m.getSource('areas')) (m.getSource('areas') as maplibregl.GeoJSONSource).setData(fc);
          else {
            m.addSource('areas', { type: 'geojson', data: fc, promoteId: 'name' });
            m.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': '#0f6e56', 'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], false], 0.35, 0.04] } }, 'units-label');
            m.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': '#0b4f3e', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, 1.6] } }, 'units-label');
            m.addLayer({
              id: 'areas-label', type: 'symbol', source: 'areas',
              layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': false },
              paint: { 'text-color': '#0b4f3e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
            });
            m.on('click', 'areas-fill', (e) => {
              const name = String(e.features?.[0]?.properties?.name ?? '');
              if (!name) return;
              const p = new URLSearchParams(spRef.current.toString());
              if (p.get('q') === name) p.delete('q');
              else p.set('q', name);
              p.delete('page');
              router.push(`/hunts${p.size ? `?${p}` : ''}`, { scroll: false });
            });
            m.on('mouseenter', 'areas-fill', () => (m.getCanvas().style.cursor = 'pointer'));
            m.on('mouseleave', 'areas-fill', () => (m.getCanvas().style.cursor = ''));
          }
          areasLoaded.current = areaSpecies;
        } catch (e) {
          console.error(e);
          return;
        }
      }
      const on = !!areaSpecies && !!m.getLayer('areas-fill');
      for (const id of ['areas-fill', 'areas-line', 'areas-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      // units: no fill / no click target while areas are shown
      m.setLayoutProperty('units-fill', 'visibility', on ? 'none' : 'visible');
      m.setPaintProperty('units-line', 'line-opacity', on ? 0.35 : 0.85);
      if (on) {
        for (const a of prevAreas.current) m.setFeatureState({ source: 'areas', id: a }, { match: false, sel: false });
        for (const a of matchedAreas) m.setFeatureState({ source: 'areas', id: a }, { match: true, sel: a === selectedArea });
        prevAreas.current = matchedAreas;
      }
    };
    apply();
    m.on('ready', apply);
    return () => void m.off('ready', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSpecies, matchedAreas.join(','), selectedArea]);

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
