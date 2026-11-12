'use client';
import { CO_METHODS, CO_SEASONS, matchesCoMapFilters } from '@/lib/coMapFilters';

import { useEffect, useMemo, useRef, useState } from 'react';
import { huntHref } from '@/lib/huntSlug';
import { recentBoundaryChanges } from '@/lib/boundaries';
import maplibregl, { type ExpressionSpecification, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle, setBasemap, type Basemap } from '@/lib/basemap';
import Link from 'next/link';
import { Star } from './Star';
import { MapKey, KeySeg } from './MapKey';
import { MigrationControls, type StudyLite } from './MigrationLayers';
import { LandToggles } from './LandLayers';
import { METRICS, METRIC_KEYS, colorsFor, isMsgSuccess, fixedScale, fillExpression, fmtNum as num, IDAHO_BOUNDS, type Classes, type Metric, type Sp } from '@/lib/mapMetrics';
import { inPageGestures } from '@/lib/mapGestures';
import { loadUnits } from '@/lib/unitData';
import { antlerLabel } from '@/lib/format';
import { ELK_ZONES } from '@/lib/elkZones';
import { unitKey } from "@/lib/states";
import { useStateConfig } from './StateContext';

type Props = Record<string, string | number | boolean | null | undefined> & { name: string };

const SCALE_NOTE: Record<string, string> = { odds: ' Fixed scale: under 2%, 2-5, 5-10, 10-15 (yellow), 15-30, 30-50, 50-80, 80%+.', fill: ' Fixed scale: 20-30% is yellow.', land: ' Fixed scale: 50-60% is yellow.', objective: '' };

/** `bare`: just the unit on the map (unit pages), no shading or key. `unitSet`: Montana's deer/elk and antelope
 *  districts are different ground stored side by side ("261" and "A320"); draw only the set the page is about. */
export function UnitMap({ nr, focus, height = '100%', savedUnits = [], signedIn = false, draw = 'DEP', bare = false, migrations = [], coPointsKey = '', unitSet }: { coPointsKey?: string; nr: boolean; focus?: string; height?: string; savedUnits?: string[]; signedIn?: boolean; draw?: 'DEP' | 'MSG'; bare?: boolean; migrations?: StudyLite[]; unitSet?: 'deer-elk' | 'antelope' }) {
  const [mapObj, setMapObj] = useState<MlMap | null>(null);
  const st = useStateConfig();
  const msg = draw === "MSG" && st.code === "ID";
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [metric, setMetric] = useState<Metric>('public');
  // basic filters: which animal and which kind of hunt the shading (and the unit's hunt list) is about
  const [sp, setSpRaw] = useState<Sp>(msg ? 'MOOSE' : 'ELK');
  const [htype, setHtypeRaw] = useState<'GENERAL' | 'CONTROLLED'>(msg || st.code === 'CO' ? 'CONTROLLED' : 'GENERAL');
  // first visit: start on the animal last used in Find A Hunt (its remembered filters)
  useEffect(() => {
    try {
      const last = decodeURIComponent(document.cookie.match(/(?:^|; )lastHunts=([^;]*)/)?.[1] ?? '');
      const want = new URLSearchParams(last).get('species') as Sp | null;
      const ok = msg ? ['MOOSE', 'BIGHORN', 'GOAT'] : ['ELK', 'DEER', 'PRONGHORN'];
      if (want && ok.includes(want)) setSp(want);
    } catch { /* keep the default */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // the header's drawing switch: start over on that drawing's species
  useEffect(() => {
    setSpRaw(msg ? 'MOOSE' : 'ELK');
    setHtypeRaw(msg || st.code === 'CO' ? 'CONTROLLED' : 'GENERAL');
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
    setMetric((m) => (METRICS[m].kind === 'land' ? m : t === 'CONTROLLED' ? (m === 'pressure' ? 'ctlSuccess' : st.code==='CO' ? 'ctlQuality' : 'ctlOdds') : 'success'));
  };
  // "No Shading": just the unit outlines over the basemap
  const [noShade, setNoShade] = useState(false);
  const options = [{ value: 'none', label: 'No Shading' }, ...METRIC_KEYS.filter((k) => st.code === "ID" ? !["ctlQuality", "ctlPressure", "ctlPoints", "ctlCreep"].includes(k) : !["huntable", "objBull", "objCow"].includes(k))
      .filter(
        (k) => METRICS[k].kind === 'land' || METRICS[k].kind === (htype === 'CONTROLLED' ? 'controlled' : 'general'),
      )
    .map((k) => ({ value: k, label: st.code==='CO' && (k==='ctlSuccess' || k==='success') ? 'Harvest Success %' : st.code==='CO' && k==='ctlPoints' ? 'Points Needed' : st.code==='CO' && k==='ctlOdds' ? 'Draw Odds At My Points (Best Antlered Hunt)' : st.code==='CO' && k==='ctlFill' ? 'Draw And Fill At My Points (Best Antlered Hunt)' : METRICS[k].label })),
  ];
  const [methods, setMethods] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const coFilters = new URLSearchParams({method: methods.join(','), season: seasons.join(',')}).toString();
  const checks = (label: string, options: readonly (readonly [string, string])[], selected: string[], update: (v: string[]) => void) => (
    <fieldset style={{border: 0, padding: 0, margin: '4px 0', width: '100%'}}><legend className="mk-lab">{label}</legend><div className="checks2">
      {options.map(([v, text]) => <label key={v}><input type="checkbox" checked={selected.includes(v)} onChange={() => update(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])} /> {text}</label>)}
    </div></fieldset>
  );
  const [classes, setClasses] = useState<Record<string, Classes>>({});
  const [missing, setMissing] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<Props | null>(null);
  // outline units or elk zones (elk zones only exist on the deer/elk/pronghorn drawing)
  const [bounds, setBoundsRaw] = useState<'units' | 'zones'>('units');
  const [zoneSel, setZoneSel] = useState<string | null>(null);
  const boundsRef = useRef<'units' | 'zones'>('units');
  const setBounds = (b: 'units' | 'zones') => {
    setBoundsRaw(b);
    boundsRef.current = b;
    setSel(null);
    setZoneSel(null);
    try { localStorage.setItem('unitMapBounds', b); } catch { /* not remembered */ }
  };
  useEffect(() => {
    try { if (!bare && !msg && st.features.elkZones && localStorage.getItem('unitMapBounds') === 'zones') { setBoundsRaw('zones'); boundsRef.current = 'zones'; } } catch { /* default */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (msg && bounds === 'zones') setBounds('units'); /* no elk zones on that drawing */ }, [msg]); // eslint-disable-line react-hooks/exhaustive-deps
  type UH = { tagCode?: string | null; id: string; slug?: string | null; type: 'GENERAL' | 'CONTROLLED' | 'NRTAG'; label: string; species: string; antler: string; resOdds5: number | null; nrOdds5: number | null; success5: number | null };
  const [uh, setUh] = useState<{ unit: string; rows: UH[] } | null>(null);
  const selName = sel ? String(sel.name) : null;
  useEffect(() => {
    if (!selName || selName === focus) return;
    let live = true;
    fetch(`/api/units/${encodeURIComponent(unitKey(st.code, selName))}/hunts`)
      .then((r) => r.json())
      .then((rows: UH[]) => live && setUh({ unit: selName, rows }))
      .catch(() => live && setUh({ unit: selName, rows: [] }));
    return () => {
      live = false;
    };
  }, [selName, focus]);
  const [err, setErr] = useState("");
  const [kind, setKind] = useState<Basemap>("satellite");
  useEffect(() => {
    if (map.current?.isStyleLoaded()) setBasemap(map.current, kind);
  }, [kind]);

  const M = METRICS[metric];
  const field = M.field(sp, nr);
  const cls = classes[field];
  const colors = useMemo(() => (cls ? colorsFor(cls, M.better) : []), [cls, M.better]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: baseStyle("satellite", st.agency.short),
      bounds: st.bounds,
      fitBoundsOptions: { padding: { top: 96, bottom: 16, left: 16, right: 16 } },
      maxZoom: 15,
      attributionControl: { compact: true },
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // unit pages: the map sits in the page; the Unit Map page is the map itself
    if (bare) inPageGestures(m);
    // full screen takes the map's wrapper, so the key and panels come along
    m.addControl(new maplibregl.FullscreenControl({ container: el.current!.parentElement ?? undefined }), 'bottom-right');
    m.on("load", async () => {
      try {
        const {
          fc,
          classes: cl,
          missing: miss,
          labels,
        } = await loadUnits(st.code,coPointsKey).then((d) => {
          if (!unitSet) return d;
          const keep = (n: unknown) => (unitSet === 'antelope') === /^A\d/.test(String(n));
          const fc0 = { ...d.fc, features: d.fc.features.filter((f) => keep(f.properties.name)) };
          // antelope districts read as plain numbers ("A320" -> "320"), as on the finder map
          const lab = { ...d.labels, features: d.labels.features.filter((f) => keep(f.properties.name))
            .map((f) => ({ ...f, properties: { ...f.properties, name: f.properties.name.replace(/^A(?=\d)/, '') } })) };
          return { ...d, fc: fc0, labels: lab };
        });
        setClasses(cl);
        setMissing(miss);
        m.addSource('units', { type: 'geojson', data: fc as never, promoteId: 'name' });
        m.addLayer({ id: 'units-fill', type: 'fill', source: 'units', paint: { 'fill-color': '#ccc', 'fill-opacity': 0.62 } });
        m.addLayer({ id: 'units-line', type: 'line', source: 'units', paint: { 'line-color': '#1d2023', 'line-width': 0.8 } });
        m.addLayer({
          id: 'units-sel', type: 'line', source: 'units',
          paint: { 'line-color': '#eb6834', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, 0] },
        });
        if (!m.getSource('unit-labels')) m.addSource('unit-labels', { type: 'geojson', data: labels as never });
        m.addLayer({
          id: 'units-label', type: 'symbol', source: 'unit-labels',
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
          if (boundsRef.current === 'zones') return;
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
          m.fitBounds(st.bounds, { padding: { top: Math.min(kh + 14, m.getContainer().clientHeight * 0.4), bottom: 16, left: 16, right: 16 }, duration: 0 });
        }
        m.fire("metric");
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

  useEffect(() => {
    if (st.code !== 'CO' || bare || !mapObj) return;
    let live = true;
    setErr('');
    loadUnits('CO', coPointsKey, coFilters).then(data => {
      if (!live) return;
      (mapObj.getSource('units') as maplibregl.GeoJSONSource).setData(data.fc as never);
      setClasses(data.classes);
      setMissing(data.missing);
      setSel(null);
    }).catch(() => { if (live) setErr('Could not update map filters. Please try again.'); });
    return () => { live = false; };
  }, [mapObj, coPointsKey, coFilters, st.code, bare]);

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
      if (noShade) {
        m.setPaintProperty('units-fill', 'fill-opacity', 0);
        return;
      }
      m.setPaintProperty('units-fill', 'fill-opacity', 0.62);
      if (!cls) return;
      m.setPaintProperty('units-fill', 'fill-color', fillExpression(field, cls, colors) as ExpressionSpecification);
    };
    apply();
    m?.on('metric', apply);
    return () => void m?.off('metric', apply);
  }, [field, cls, colors, bare, focus, noShade]);

  // elk zone outlines and names (fetched once); unit numbers step back while zones are shown
  const zonesAdded = useRef(false);
  useEffect(() => {
    const m = mapObj;
    if (!m) return;
    let live = true;
    const show = bounds === 'zones';
    const apply = () => {
      if (!m.getLayer('zones-line')) return;
      for (const id of ['zones-fill', 'zones-casing', 'zones-line', 'zones-label']) m.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none');
      m.setLayoutProperty('units-label', 'visibility', show ? 'none' : 'visible');
      m.setPaintProperty('units-line', 'line-opacity', show ? 0.35 : 1);
      if (show) m.setFeatureState({ source: 'units', id: String(sel?.name ?? '') }, { sel: false });
    };
    if (show && !zonesAdded.current) {
      zonesAdded.current = true;
      fetch('/api/zones').then((r) => r.json()).then((z) => {
        if (!m.getStyle()) return;
        m.addSource('zones', { type: 'geojson', data: z.zones, promoteId: 'zone' });
        m.addSource('zone-labels', { type: 'geojson', data: z.labels });
        m.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones', paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, 'units-label');
        m.addLayer({ id: 'zones-casing', type: 'line', source: 'zones', paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.75 } }, 'units-label');
        m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#eb6834', '#4b23a8'], 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 4, 2.4] } }, 'units-label');
        m.addLayer({
          id: 'zones-label', type: 'symbol', source: 'zone-labels',
          layout: { 'text-field': ['get', 'zone'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': false },
          paint: { 'text-color': '#2b1366', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        });
        let prev: string | null = null;
        m.on('click', 'zones-fill', (e) => {
          if (boundsRef.current !== 'zones') return;
          const z = String(e.features?.[0]?.properties?.zone ?? '');
          if (!z) return;
          if (prev) m.setFeatureState({ source: 'zones', id: prev }, { sel: false });
          m.setFeatureState({ source: 'zones', id: z }, { sel: true });
          prev = z;
          setZoneSel(z);
        });
        apply();
      }).catch(() => { zonesAdded.current = false; setErr('Could not load elk zones.'); });
    } else apply();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, mapObj]);

  // the selected unit's hunts, narrowed to the key's animal and hunt type (zone / NR tags count as general)
  const v = (k: string) => (sel && sel[k] !== null && sel[k] !== undefined ? Number(sel[k]) : null);

  return (
    <div style={{ position: "relative", height }}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {bare && migrations.length > 0 && <MigrationControls map={mapObj} studies={migrations} before="units-label" collapsible />}
      {bare && <div className="card land-float"><LandToggles map={mapObj} before="units-line" /></div>}
      {bare ? null : (
        <MapKey
          filters={
            <>
              <KeySeg
                label="Animal"
                value={sp}
                onChange={setSp}
                options={
                  msg
                    ? [
                        ["MOOSE", "Moose"],
                        ["BIGHORN", "Sheep"],
                        ["GOAT", "Goat"],
                      ]
                    : st.code === "CO"
                      ? [
                          ["ELK", "Elk"],
                          ["DEER", "Deer"],
                          ["PRONGHORN", "Pronghorn"],
                        ]
                      : [['ELK', 'Elk'], ['DEER', 'Deer'], ['PRONGHORN', 'Pronghorn']]
                }
              />
              {!msg && <KeySeg label="Hunts" value={htype} onChange={setHtype} options={[['GENERAL', 'General', sp === 'PRONGHORN'], ['CONTROLLED', 'Controlled']]} />}
              {st.code === 'CO' && <>{checks('Weapon', CO_METHODS, methods, setMethods)}{checks('Season type (select any)', CO_SEASONS, seasons, setSeasons)}</>}
              {!msg && st.features.elkZones && <KeySeg label="Outline" value={bounds} onChange={setBounds} options={[['units', 'Units'], ['zones', 'Elk Zones']]} />}
            </>
          }
          value={noShade ? "none" : metric}
          options={options}
          onChange={(x) => { if (x === 'none') setNoShade(true); else { setNoShade(false); setMetric(x as Metric); } }}
          ramp={noShade ? undefined : { classes: cls, colors, fmt: M.fmt, none: M.none, missing: missing[field] ?? 0, unit: 'units', labels: M.labels }}
          note={`${st.code === 'CO' && metric === 'public' ? 'BLM Colorado public surface ownership intersected with CPW GMUs; ownership does not establish hunting permission.' : st.code === 'CO' && metric === 'ctlSuccess' ? 'Harvest divided by hunters over up to five seasons, pooled across matching adult antlered hunts touching the unit. Multi-unit hunt totals count in each unit; at least 50 hunters are required.' : st.code === 'CO' && metric === 'success' ? 'Harvest divided by hunters over up to five seasons, pooled across matching general hunts touching the unit. Multi-unit hunt totals count in each unit; at least 50 hunters are required.' : st.code==='CO' && ['ctlOdds','ctlFill'].includes(metric) ? 'Conservative next-draw scenario at your saved species points and youth/adult pool. Best adult buck/bull hunt touching the unit. Draw-and-fill multiplies those odds by observed success; it is not a calibrated forecast.' : M.note}${M.bySpecies ? ` Showing ${({ ELK: 'elk', DEER: 'deer', PRONGHORN: 'pronghorn', MOOSE: 'moose', BIGHORN: 'bighorn sheep', GOAT: 'mountain goat' })[sp]}${['ctlOdds','ctlFill','ctlPoints','ctlCreep'].includes(metric) ? `, ${nr ? 'nonresident' : 'resident'}` : ''}.` : ''}${isMsgSuccess(field) ? ' Judged against fixed standards: 60-70% is yellow, 70%+ green, under 50% orange.' : ((st.code === 'CO' && metric === 'ctlPoints' ? ' Yellow = your saved species points; greener = fewer points needed, redder = more. Bands use whole points; 3 fewer or lower and 3 more or higher share the end colors.' : metric==='ctlQuality' ? ' Fixed 0–100 scale, matching the Quality badges.' : SCALE_NOTE[fixedScale(field) ?? '']) ?? " Yellow = typical for this state; red and green = well below or above it.")}`}
          extraItems={focus ? [{ color: '#eb6834', label: `Unit ${focus}`, line: true }] : []}
          kind={kind}
          onKind={setKind}
          err={err}
          layers={<LandToggles map={mapObj} before="units-line" />}
          folded={!!sel && sel.name !== focus}
        />
      )}
      {zoneSel && bounds === 'zones' && (
        <div className="card mapinfo">
          <button type="button" className="mapinfo-x" aria-label="Close zone details" onClick={() => setZoneSel(null)}>×</button>
          <h3 style={{ margin: '0 0 2px' }}>{zoneSel} Elk Zone</h3>
          <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
            <Link className="btn primary" href={`/hunts?zone=${encodeURIComponent(zoneSel)}&species=ELK`}>Elk Hunts Here</Link>
            <Link className="btn" href={`/migration?zone=${encodeURIComponent(zoneSel)}`}>Migrations</Link>
          </div>
          <p className="small" style={{ margin: 0 }}>Units: {(ELK_ZONES[zoneSel] ?? []).map((u, i) => <span key={u}>{i ? ', ' : ''}<Link href={`/units/${encodeURIComponent(u)}`}>{u}</Link></span>)}</p>
          <p className="small muted" style={{ margin: '6px 0 0' }}>Shading is still by unit. Switch Outline back to Units to tap a unit.</p>
        </div>
      )}
      {sel && (
        <div className="card mapinfo">
          <button type="button" className="mapinfo-x" aria-label="Close unit details" onClick={() => setSel(null)}>×</button>
          <h3 className="star-head" style={{ margin: '0 0 2px' }}>Unit {sel.name} <Star key={sel.name} kind="unit" id={unitKey(st.code,sel.name)} saved={savedUnits.includes(unitKey(st.code,sel.name))} signedIn={signedIn} label /></h3>
          <div className="small muted">{sel.elkZone ? `${sel.elkZone} elk zone` : ''}{sel.acres ? ` · ${Math.round(Number(sel.acres)).toLocaleString()} acres` : ''}</div>
          {sel.name !== focus && (
            <div style={{ display: 'flex', gap: 8, margin: '8px 0 4px' }}>
              <Link
                className="btn primary"
                href={`/units/${encodeURIComponent(unitKey(st.code, sel.name))}`}
              >
                Unit Details
              </Link>
              <Link
                className="btn"
                href={`/hunts?unit=${encodeURIComponent(sel.name)}&species=${sp}`}
              >
                Hunts Here
              </Link>
            </div>
          )}
          <table className="small" style={{ width: '100%', marginTop: 6 }}>
            <tbody>
              {st.code === "CO" && (
                <tr>
                  <td>Private land</td>
                  <td style={{ textAlign: "right" }}>
                    {v("privatePct") === null
                      ? "—"
                      : Math.round(v("privatePct")!) + "%"}
                  </td>
                </tr>
              )}
              <tr><td>Public land</td><td style={{ textAlign: 'right' }}>{v('publicPct') !== null ? `${Math.round(v('publicPct')!)}%` : '-'}</td></tr>
              {st.accessProgram && (
                <tr>
                  <td>{st.accessProgram}</td>
                  <td style={{ textAlign: 'right' }}>{v('accessYesAcres') ? `${Math.round(v('accessYesAcres')!).toLocaleString()} ac (${v('accessYesPct')! < 1 ? '<1' : Math.round(v('accessYesPct')!)}%)` : 'none'}</td>
                </tr>
              )}
              {st.accessProgram && (
                <tr>
                  <td>Public + {st.accessProgram}</td>
                  <td style={{ textAlign: 'right' }}>{v('huntablePct') !== null ? `${Math.round(v('huntablePct')!)}%` : '-'}</td>
                </tr>
              )}
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
              {uh?.unit !== sel.name ? <p className="small muted">Loading hunts…</p> : (['GENERAL', 'CONTROLLED'] as const).map((kind) => {
                // every hunt in the unit for this drawing: the key's animal first, then the others
                const order = (x: string) => (x === sp ? 0 : 1);
                const list = (uh?.rows ?? [])
                  .filter(h => st.code !== 'CO' || (h.species === sp && (kind === htype) && matchesCoMapFilters(h.tagCode ?? null, methods, seasons)))
                  .filter((h) => (kind === 'CONTROLLED' ? h.type === 'CONTROLLED' : h.type !== 'CONTROLLED'))
                  .filter((h) => nr || h.type !== 'NRTAG' || h.species === 'ELK') // deer tags matter to nonresidents only
                  .filter((h) => !h.species || (msg ? ['MOOSE', 'BIGHORN', 'GOAT'] : ['ELK', 'DEER', 'PRONGHORN']).includes(h.species))
                  .sort((a, b) => order(a.species) - order(b.species) || a.species.localeCompare(b.species));
                if (kind === 'GENERAL' && msg) return null;
                return (
                  <div key={kind}>
                    <h4>{kind === 'GENERAL' ? 'General Tags & Seasons' : `Controlled Hunts (${list.length})`}</h4>
                    {!list.length ? <p className="small muted">None here.</p> : (
                      <ul>
                        {list.slice(0, kind === 'CONTROLLED' ? 12 : 20).map((h) => {
                          const o = nr ? h.nrOdds5 : h.resOdds5;
                          return (
                            <li key={h.id}>
                              <Link href={huntHref(h)}>{h.label}</Link>
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
                    {kind === 'CONTROLLED' && list.length > 12 && <p className="small"><Link href={`/hunts?unit=${encodeURIComponent(sel.name)}&type=CONTROLLED`}>All {list.length} controlled hunts →</Link></p>}
                  </div>
                );
              })}
            </div>
          )}
          {sel.name !== focus && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Link className="btn primary" href={`/units/${encodeURIComponent(unitKey(st.code,sel.name))}`}>Unit Details</Link>
              <Link className="btn" href={`/hunts?unit=${encodeURIComponent(sel.name)}`}>Hunts Here</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
