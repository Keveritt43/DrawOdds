'use client';
import { useStateConfig } from './StateContext';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { inPageGestures } from '@/lib/mapGestures';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import { MapKey, type KeyItem } from './MapKey';
import { LandToggles } from './LandLayers';
import { divergingClasses, type BreakMode } from '@/lib/breaks';
import { OBJ_SOURCE } from '@/lib/elkObjectives';
import { colorsFor, msgSuccessClasses, scoreClasses, fixedClasses, FIXED_SCALES, OBJECTIVE_LABELS, type FixedScale, fillExpression, fmtNum, IDAHO_BOUNDS, MATCH, ZONE, AREA } from '@/lib/mapMetrics';

export type MatchStat = { score: number | null; odds: number | null; fill: number | null; success: number | null; crowd: number | null; public: number | null; huntable: number | null; objBull: number | null; objCow: number | null };
type ShadeKey = 'match' | 'none' | keyof MatchStat;
const pct1 = (v: number) => `${fmtNum(v * 100)}%`;
type Mode = BreakMode | "score" | FixedScale;
/** What the Filtering map can shade by: always the matching hunts' own numbers, never units without a match. */
const SHADES: Record<Exclude<ShadeKey, 'match' | 'none'>, { label: string; mode: Mode; snap?: number; better: 'high' | 'low'; fmt: (v: number) => string; none: string; note: string; labels?: string[]; scaleNote: string }> = {
  score: { label: 'DrawOdds Score (Best Matching Hunt)', mode: 'score', better: 'high', fmt: (v) => String(Math.round(v)), none: 'Not enough hunters to score', note: 'Highest DrawOdds Score (quality: success, access, elbow room, trophy) among the matching hunts in each unit.', scaleNote: 'Same colors as the score badges.' },
  odds: { label: 'Draw Odds (Best Matching Hunt)', mode: 'odds', better: 'high', fmt: pct1, none: 'No draw data', note: 'Best 5-year first-choice odds, for your residency, among the matching hunts in each unit. Resident general seasons are over the counter (100%).', scaleNote: 'Fixed scale: under 2%, 2-5, 5-10, 10-15 (yellow), 15-30, 30-50, 50-80, 80%+.' },
  fill: { label: 'Draw And Fill (Best Matching Hunt)', mode: 'fill', better: 'high', fmt: pct1, none: 'No draw or too few hunters', note: 'Draw odds × 5-year hunter success: the chance one application ends with an animal, for your residency. Best matching hunt in each unit. Resident general seasons: just success.', scaleNote: 'Fixed scale: 20-30% is yellow.' },
  success: { label: 'Hunter Success (Matching Hunts)', mode: 'sd', snap: 0.05, better: 'high', fmt: pct1, none: 'Too few hunters', note: 'Harvest ÷ hunters over 5 years for the matching hunts in each unit, pooled.', scaleNote: 'Yellow = average for these results, in 5-point steps.' },
  crowd: { label: 'Hunters / Sq Mi (Least Crowded Match)', mode: 'pct', better: 'low', fmt: fmtNum, none: 'No hunter data', note: 'Hunters per square mile of the least crowded matching hunt in each unit. Green = fewer hunters.', scaleNote: 'Yellow = typical for these results.' },
  public: { label: 'Public Land % (Matching Units)', mode: 'land', better: 'high', fmt: (v) => `${fmtNum(v)}%`, none: 'No data', note: 'Federal + state land in each unit with a matching hunt. Does not include Access Yes!.', scaleNote: 'Fixed scale: 50-60% is yellow.' },
  huntable: { label: 'Public + Access Yes! % (Matching Units)', mode: 'land', better: 'high', fmt: (v) => `${fmtNum(v)}%`, none: 'No data', note: 'Public land plus Access Yes! land in each unit with a matching hunt.', scaleNote: 'Fixed scale: 50-60% is yellow.' },
  objBull: { label: 'Elk: Bulls vs Population Objective', mode: 'objective', better: 'high', fmt: String, labels: OBJECTIVE_LABELS, none: 'No numeric objective', note: `Bull elk numbers against IDFG's objective for the unit's elk zone (${OBJ_SOURCE}). Above = more bulls than the target.`, scaleNote: '' },
  objCow: { label: 'Elk: Cows vs Population Objective', mode: 'objective', better: 'high', fmt: String, labels: OBJECTIVE_LABELS, none: 'No numeric objective', note: `Cow elk numbers against IDFG's objective for the unit's elk zone (${OBJ_SOURCE}). Above = more cows than the target; often more antlerless tags.`, scaleNote: '' },
};
import { loadUnits, loadSearchUnits } from "@/lib/unitData";
import { searchBounds } from '@/lib/searchStates';
import { STATES, type StateCode } from '@/lib/states';

/**
 * Filtering map. By default units with a matching hunt are filled blaze orange and the rest are outlines;
 * "Shade" switches the fill to any unit metric (public land, success, crowding, odds) while matching units keep
 * a heavy orange outline. Click a unit to narrow the results to it (click again to clear).
 */
export function HuntMap({ matched, selected, chips, showZones = false, zones = [], areaSpecies = '', matchedAreas = [], selectedArea = '', stats = { units: {}, areas: {} }, states, searchGroup, species }: {
  matched: string[]; selected: string; chips: { label: string; href: string }[]; nr?: boolean; showZones?: boolean; zones?: string[];
  /** species hunted by their own hunt areas (pronghorn, moose, sheep, goat; comma list): draw those instead of filling units.
   *  matchedAreas / selectedArea / stats.areas are keyed "<SPECIES>:<area>" */
  areaSpecies?: string; matchedAreas?: string[]; selectedArea?: string;
  species?: string;
  /** the matching hunts' numbers per unit and per hunt area (Filtering computes them from its results) */
  stats?: { units: Record<string, MatchStat>; areas: Record<string, MatchStat> };
  /** Combined Find Hunts uses namespaced units and fits all selected states. */
  states?: StateCode[];
  searchGroup?: 'DEP' | 'MSG';
}) {
  const el = useRef<HTMLDivElement>(null);
  const keyEl = useRef<HTMLDivElement>(null);
  const st = useStateConfig();
  const stCode = st.code;
  const stBounds = states ? searchBounds(states) : st.code === 'ID' ? IDAHO_BOUNDS : st.bounds;
  const map = useRef<MlMap | null>(null);
  const [mapObj, setMapObj] = useState<MlMap | null>(null);
  const loaded = useRef(false);
  const prevMatched = useRef<string[]>([]);
  const prevSel = useRef("");
  const [kind, setKind] = useState<Basemap>("satellite");
  const [metric, setMetric] = useState<ShadeKey>("match");
  const [err, setErr] = useState("");
  const router = useRouter();
  const sp_ = useSearchParams();
  const spRef = useRef(sp_);
  spRef.current = sp_;

  const areaMode = !!areaSpecies;
  const flat = metric === "match" || metric === "none";
  const S = flat ? null : SHADES[metric as keyof typeof SHADES];
  // classes come from the matching units (or areas) only: the shades spread across these results
  const shownStats = areaMode ? matchedAreas.map((a) => stats.areas[a]).filter(Boolean) : matched.map((u) => stats.units[u]).filter(Boolean);
  const vals = flat ? [] : shownStats.map((x) => x[metric as keyof MatchStat]).filter((v): v is number => typeof v === 'number');
  const statsKey = JSON.stringify(stats).length + ':' + vals.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // moose / sheep / goat success is judged against fixed standards (see MSG_SUCCESS_BREAKS), not against each other
  const msgSuccess = metric === 'success' && areaSpecies.split(',').some((x) => ['MOOSE', 'BIGHORN', 'GOAT'].includes(x));
  const cls = useMemo(() => (flat || !S ? undefined : msgSuccess ? msgSuccessClasses(vals, 0.01) : S.mode === 'score' ? scoreClasses(vals) : S.mode in FIXED_SCALES ? fixedClasses(vals, S.mode as FixedScale) : divergingClasses(vals, S.mode as BreakMode, S.snap ?? 0)), [metric, statsKey, msgSuccess]);
  const colors = useMemo(() => (S && cls ? colorsFor(cls, S.better) : []), [S, cls]);
  const missingN = flat ? 0 : shownStats.length - vals.length + ((areaMode ? matchedAreas.length : matched.length) - shownStats.length);

  const latestPaint = useRef({ matched, selected, stats });
  latestPaint.current = { matched, selected, stats };
  const paint = () => {
    const { matched, selected, stats } = latestPaint.current;
    const m = map.current;
    if (!m || !loaded.current) return;
    for (const u of prevMatched.current) m.setFeatureState({ source: 'units', id: u }, { match: false, score: null, odds: null, fill: null, success: null, crowd: null, public: null, huntable: null, objBull: null, objCow: null });
    for (const u of matched) m.setFeatureState({ source: 'units', id: u }, { match: true, ...(stats.units[u] ?? {}) });
    prevMatched.current = matched;
    if (prevSel.current) m.setFeatureState({ source: 'units', id: prevSel.current }, { sel: false });
    if (selected) m.setFeatureState({ source: 'units', id: selected }, { sel: true });
    prevSel.current = selected;
  };

  useEffect(() => {
    if (!el.current || map.current) return;
    let cancelled = false;
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle("satellite", states ? states.map(s => STATES[s].agency.short).join(' / ') : st.agency.short),
      bounds: stBounds,
      fitBoundsOptions: { padding: { top: 48, bottom: 110, left: 12, right: 12 } },
      minZoom: states ? 2 : 4,
      maxZoom: 15,
      attributionControl: { compact: true },
    });
    // below 1100px the map sits above the list in the page instead of in a side panel
    inPageGestures(m, "(max-width: 1100px)");
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // full screen takes the map's wrapper, so the key and panels come along
    m.addControl(new maplibregl.FullscreenControl({ container: el.current!.parentElement ?? undefined }), 'top-right');
    m.on('load', async () => {
      let fc;
      let labels;
      try {
        if (states) {
          const data = await Promise.all(states.map(s => loadSearchUnits(s, searchGroup, species)));
          fc = { type: 'FeatureCollection', features: data.flatMap(d => d.fc.features) };
          labels = { type: 'FeatureCollection', features: data.flatMap(d => d.labels.features) };
        } else ({ fc, labels } = await loadUnits(stCode));
        if (cancelled) return;
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
      if (!m.getSource('unit-labels')) m.addSource('unit-labels', { type: 'geojson', data: labels as never });
      m.addLayer({
        id: 'units-label', type: 'symbol', source: 'unit-labels',
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12 },
        paint: { 'text-color': '#1d2023', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
      });
      m.on('click', 'units-fill', (e) => {
        if (m.getLayer('areas-fill') && m.getLayoutProperty('areas-fill', 'visibility') === 'visible') return; // areas take the click
        const target = e.features?.find(f => latestPaint.current.matched.includes(String(f.properties?.name))) ?? e.features?.[0];
        const name = String(target?.properties?.name ?? '');
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
      // frame all of Idaho below the chips and folded key (top-left), nudged right of the key's column
      const kh = keyEl.current?.offsetHeight ?? 90;
      const cw = m.getContainer().clientWidth;
      const ch = m.getContainer().clientHeight;
      m.fitBounds(stBounds, { padding: { top: Math.min(kh + 18, ch * 0.4), bottom: 12, left: cw > 700 ? Math.min(160, cw * 0.18) : 12, right: 50 }, duration: 0 });
      paint();
      m.fire('ready'); // units layers exist now: overlays (shading, elk zones, areas) can attach
      setMapObj(m);
    });
    return () => {
      cancelled = true;
      m.remove();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(paint, [matched.join(','), selected, JSON.stringify(stats.units)]);

  // shading: always the matching units only. "match" = flat orange; any other choice colors them by the matching
  // hunts' own numbers (feature-state set in paint), and units without a match stay unfilled outlines
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      if (!loaded.current || !m.getLayer('units-fill')) return;
      const base = kind === 'satellite' ? '#ffffff' : '#1d2023'; // unit outlines must read on imagery too
      const isMatch = (v: unknown, a: unknown) => ['case', ['boolean', ['feature-state', 'match'], false], v, a] as unknown as ExpressionSpecification;
      const color = flat || !cls ? MATCH : (fillExpression(['feature-state', metric], cls, colors) as ExpressionSpecification);
      m.setPaintProperty('units-fill', 'fill-color', color);
      m.setPaintProperty('units-fill', 'fill-opacity', metric === 'none' ? 0 : isMatch(metric === 'match' ? 0.38 : 0.7, 0.02));
      m.setPaintProperty('units-line', 'line-color', isMatch(flat ? '#eb6834' : '#1d2023', base));
      m.setPaintProperty('units-line', 'line-width', isMatch(metric === 'none' ? 2.6 : 1.6, 0.8));
      if (m.getLayer('areas-fill')) {
        m.setPaintProperty('areas-fill', 'fill-color', color);
        m.setPaintProperty('areas-fill', 'fill-opacity', metric === 'none' ? 0 : isMatch(metric === 'match' ? 0.35 : 0.7, 0.04));
      }
    };
    apply();
    m.on('ready', apply);
    return () => void m.off('ready', apply);
  }, [metric, cls, colors, kind]);

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
            m.addSource('areas', { type: 'geojson', data: fc, promoteId: 'key' });
            m.addLayer({ id: 'areas-fill', type: 'fill', source: 'areas', paint: { 'fill-color': AREA, 'fill-opacity': ['case', ['boolean', ['feature-state', 'match'], false], 0.35, 0.04] } }, 'units-label');
            m.addLayer({ id: 'areas-line', type: 'line', source: 'areas', paint: { 'line-color': '#0b4f3e', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, 1.6] } }, 'units-label');
            m.addLayer({
              id: 'areas-label', type: 'symbol', source: 'areas',
              layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': false },
              paint: { 'text-color': '#0b4f3e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
            });
            m.on('click', 'areas-fill', (e) => {
              const name = String(e.features?.[0]?.properties?.name ?? '');
              const species = String(e.features?.[0]?.properties?.species ?? '');
              if (!name) return;
              const p = new URLSearchParams(spRef.current.toString());
              if (p.get('q') === name) p.delete('q');
              else {
                p.set('q', name);
                if (species) p.set('species', species); // area names repeat across species
              }
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
      // units: no fill, faint lines, no unit numbers competing with area names
      m.setLayoutProperty('units-fill', 'visibility', on ? 'none' : 'visible');
      m.setPaintProperty('units-line', 'line-opacity', on ? 0.35 : 0.85);
      m.setLayoutProperty('units-label', 'visibility', on ? 'none' : 'visible');
      if (on) {
        for (const a of prevAreas.current) m.setFeatureState({ source: 'areas', id: a }, { match: false, sel: false, score: null, odds: null, fill: null, success: null, crowd: null, public: null, huntable: null, objBull: null, objCow: null });
        for (const a of matchedAreas) m.setFeatureState({ source: 'areas', id: a }, { match: true, sel: a === selectedArea, ...(stats.areas[a] ?? {}) });
        prevAreas.current = matchedAreas;
      }
    };
    apply();
    m.on('ready', apply);
    return () => void m.off('ready', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSpecies, matchedAreas.join(','), selectedArea, JSON.stringify(stats.areas).length]);

  const matchItems: KeyItem[] = areaMode
    ? [{ color: AREA, label: 'Hunt area with a match' }, { color: '#0b4f3e', label: 'Other hunt areas', line: true }]
    : [{ color: MATCH, label: 'Has matching hunts' }, { color: kind === 'satellite' ? '#9aa0a6' : '#1d2023', label: 'No match', line: true }];
  const extraItems: KeyItem[] = [
    ...(metric !== 'match' ? [{ color: kind === 'satellite' ? '#9aa0a6' : '#1d2023', label: `No match (${areaMode ? 'outline' : 'unfilled'})`, line: true }] : []),
    ...(showZones && !areaMode ? [{ color: ZONE, label: zones.length ? `${zones.join(', ')} zone${zones.length > 1 ? 's' : ''}` : 'Elk zones', line: true }] : []),
    ...(selected ? [{ color: '#ffd400', label: `Unit ${selected} (selected)`, line: true }] : []),
  ];
  const where = areaMode ? "hunt areas" : "units";
  const options = [
    { value: "none", label: "No Shading (outline matches)" },
    { value: 'match', label: areaMode ? 'Matching Hunt Areas' : 'Matching Hunts' },
    ...(Object.keys(SHADES) as (keyof typeof SHADES)[])
      .filter(
        (k) =>
          !(areaMode && k.startsWith("obj")) &&
          (!states && stCode === "ID" ||
            !["objBull", "objCow", "huntable"].includes(k)),
      )
      .map((k) => ({ value: k, label: SHADES[k].label.replace('Units', areaMode ? 'Areas' : 'Units') })),
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {/* top-left: the active filter chips, then the key (folded: just the shade picker and its colors) */}
      <div className="map-topleft" ref={keyEl}>
        {chips.length > 0 && (
          <div className="chipsbar" aria-label="Active filters">
            {chips.map((c) => <a key={c.label} href={c.href} title="Remove filter">{c.label}</a>)}
          </div>
        )}
        <MapKey value={metric} options={options} onChange={(v) => setMetric(v as ShadeKey)}
          ramp={S ? { classes: cls, colors, fmt: S.fmt, none: S.none, missing: missingN, unit: where, labels: S.labels } : undefined}
          items={matchItems} extraItems={extraItems}
          note={states && (metric === 'odds' || metric === 'fill') ? `Uses each matching hunt's personal odds: historical Idaho odds and Colorado odds at your points in the selected mode. Unknown values stay unshaded. ${S?.scaleNote ?? ''}` : S ? `${S.note} ${msgSuccess ? 'Judged against fixed standards: 60-70% is yellow, 70%+ green, under 50% orange.' : S.scaleNote}` : `Pick another shading to color the matching ${where} by draw odds, success, crowding or public land.`}
          kind={kind} onKind={setKind} err={err} layers={<LandToggles map={mapObj} before="units-line" />} folded />
      </div>
    </div>
  );
}
