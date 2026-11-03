'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import { MapKey, type KeyItem } from './MapKey';
import { METRICS, pickRamp, fillExpression, IDAHO_BOUNDS, MATCH, ZONE, AREA, type Classes, type Metric, type Sp } from '@/lib/mapMetrics';
import { loadUnits } from '@/lib/unitData';

/**
 * Filtering map. By default units with a matching hunt are filled blaze orange and the rest are outlines;
 * "Shade" switches the fill to any unit metric (public land, success, crowding, odds) while matching units keep
 * a heavy orange outline. Click a unit to narrow the results to it (click again to clear).
 */
export function HuntMap({ matched, selected, chips, nr = false, showZones = false, zones = [], areaSpecies = '', matchedAreas = [], selectedArea = '', species = '' }: {
  matched: string[]; selected: string; chips: { label: string; href: string }[]; nr?: boolean; showZones?: boolean; zones?: string[];
  /** a species hunted by its own hunt areas (pronghorn): draw those instead of filling units */
  areaSpecies?: string; matchedAreas?: string[]; selectedArea?: string;
  /** the species filter: success / crowding shading follows it */
  species?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const keyEl = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const prevMatched = useRef<string[]>([]);
  const prevSel = useRef('');
  const [kind, setKind] = useState<Basemap>('satellite');
  const [metric, setMetric] = useState<Metric | 'match'>('match');
  const [sp, setSp] = useState<Sp>(species === 'DEER' ? 'DEER' : 'ELK');
  useEffect(() => { if (species === 'DEER' || species === 'ELK') setSp(species); }, [species]);
  const [classes, setClasses] = useState<Record<string, Classes>>({});
  const [missing, setMissing] = useState<Record<string, number>>({});
  const [err, setErr] = useState('');
  const router = useRouter();
  const sp_ = useSearchParams();
  const spRef = useRef(sp_);
  spRef.current = sp_;

  const M = metric === 'match' ? null : METRICS[metric];
  const field = M ? M.field(sp, nr) : '';
  const cls = field ? classes[field] : undefined;
  const colors = useMemo(() => (M && cls ? pickRamp(M.ramp, cls.breaks.length + 1) : []), [M, cls]);
  const areaMode = !!areaSpecies;

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
    const m = new maplibregl.Map({
      container: el.current, style: baseStyle('satellite'), bounds: IDAHO_BOUNDS,
      fitBoundsOptions: { padding: { top: 48, bottom: 110, left: 12, right: 12 } }, minZoom: 4, maxZoom: 15, attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', async () => {
      let fc;
      try {
        const d = await loadUnits();
        fc = d.fc;
        setClasses(d.classes);
        setMissing(d.missing);
      } catch (e) {
        setErr('Could not load unit boundaries.');
        console.error(e);
        return;
      }
      m.addSource('units', { type: 'geojson', data: fc as never, promoteId: 'name' });
      m.addLayer({
        id: 'units-fill', type: 'fill', source: 'units',
        paint: { 'fill-color': MATCH, 'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], false], 0.38, 0.02] },
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
        paint: { 'line-color': '#ffd400', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, 0] },
      });
      m.addLayer({
        id: 'units-label', type: 'symbol', source: 'units',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#1d2023', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });
      m.on('click', 'units-fill', (e) => {
        if (m.getLayer('areas-fill') && m.getLayoutProperty('areas-fill', 'visibility') === 'visible') return; // areas take the click
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
      // frame Idaho above the key (its height differs by screen and by what it lists)
      const kh = keyEl.current?.offsetHeight ?? 90;
      m.fitBounds(IDAHO_BOUNDS, { padding: { top: 46, bottom: Math.min(kh + 14, m.getContainer().clientHeight * 0.45), left: 10, right: 46 }, duration: 0 });
      paint();
      m.fire('ready'); // units layers exist now: overlays (shading, elk zones, areas) can attach
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

  // shading: "match" = orange fill on matching units; a metric = that metric's colors on every unit, and the
  // matching units keep a heavy orange outline so the filter result is still visible
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!loaded.current || !m.getLayer('units-fill')) return;
      const base = kind === 'satellite' ? '#ffffff' : '#1d2023'; // unit outlines must read on imagery too
      const isMatch = (v: unknown, a: unknown) => ['case', ['boolean', ['feature-state', 'match'], false], v, a] as unknown as ExpressionSpecification;
      if (metric === 'match' || !cls) {
        m.setPaintProperty('units-fill', 'fill-color', MATCH);
        m.setPaintProperty('units-fill', 'fill-opacity', isMatch(0.38, 0.02));
        m.setPaintProperty('units-line', 'line-color', isMatch('#b8460b', base));
        m.setPaintProperty('units-line', 'line-width', isMatch(1.6, 0.8));
      } else {
        m.setPaintProperty('units-fill', 'fill-color', fillExpression(field, cls, colors) as ExpressionSpecification);
        m.setPaintProperty('units-fill', 'fill-opacity', 0.62);
        m.setPaintProperty('units-line', 'line-color', isMatch(MATCH, '#1d2023'));
        m.setPaintProperty('units-line', 'line-width', isMatch(3, 0.6));
      }
    };
    apply();
    m.on('ready', apply);
    return () => void m.off('ready', apply);
  }, [metric, field, cls, colors, kind]);

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
          m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ZONE, 'line-width': 2.6 } }, 'units-label');
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

  // hunt-area mode (pronghorn): its areas are filled, unit lines and labels fade out of the way; click an area
  // to narrow. With a unit metric picked, the units are shaded and the areas become outlines on top.
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
            m.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': AREA, 'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], false], 0.35, 0.04] } }, 'units-label');
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
      const shadedUnits = metric !== 'match';
      for (const id of ['areas-line', 'areas-label']) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      if (m.getLayer('areas-fill')) m.setLayoutProperty('areas-fill', 'visibility', on ? 'visible' : 'none');
      if (on && m.getLayer('areas-fill')) m.setPaintProperty('areas-fill', 'fill-opacity', shadedUnits ? 0 : ['case', ['boolean', ['feature-state', 'match'], false], 0.35, 0.04]);
      // units: no fill (unless a metric shades them), faint lines, no unit numbers competing with area names
      m.setLayoutProperty('units-fill', 'visibility', on && !shadedUnits ? 'none' : 'visible');
      m.setPaintProperty('units-line', 'line-opacity', on ? 0.35 : 0.85);
      m.setLayoutProperty('units-label', 'visibility', on ? 'none' : 'visible');
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
  }, [areaSpecies, matchedAreas.join(','), selectedArea, metric]);

  const matchItems: KeyItem[] = areaMode
    ? [{ color: AREA, label: 'Hunt area with a match' }, { color: '#0b4f3e', label: 'Other hunt areas', line: true }]
    : [{ color: MATCH, label: 'Has matching hunts' }, { color: kind === 'satellite' ? '#9aa0a6' : '#1d2023', label: 'No match', line: true }];
  const extraItems: KeyItem[] = [
    ...(metric !== 'match' ? [{ color: MATCH, label: areaMode ? 'Hunt areas: outlines' : 'Orange outline: matches', line: true }] : []),
    ...(showZones && !areaMode ? [{ color: ZONE, label: zones.length ? `${zones.join(', ')} zone${zones.length > 1 ? 's' : ''}` : 'Elk zones', line: true }] : []),
    ...(selected ? [{ color: '#ffd400', label: `Unit ${selected} (selected)`, line: true }] : []),
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {chips.length > 0 && (
        <div className="chipsbar" aria-label="Active filters">
          {chips.map((c) => <a key={c.label} href={c.href} title="Remove filter">{c.label}</a>)}
        </div>
      )}
      <div className="mapkey-bottom" ref={keyEl}>
        <MapKey metric={metric} onMetric={setMetric} sp={sp} onSp={setSp} classes={cls} colors={colors} missing={field ? missing[field] ?? 0 : 0}
          matchLabel={areaMode ? 'Matching hunt areas' : 'Matching hunts'} matchItems={matchItems} extraItems={extraItems}
          kind={kind} onKind={setKind} err={err} />
      </div>
    </div>
  );
}
