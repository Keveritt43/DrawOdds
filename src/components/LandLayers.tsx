"use client";
import { useStateConfig } from "./StateContext";

import { useEffect, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';

/**
 * Land layers any map can switch on: who manages the land (BLM's national Surface Management Agency map, as
 * tiles: federal, state and private), IDFG's Access Yes! properties (outlines from our database), and Montana FWP's
 * Block Management Areas (outlines straight from FWP's map service, which answers this site's requests, so the map
 * always shows FWP's current enrollment; the acres in our data are FWP's 2026-27 maps).
 */
const SMA = 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer';
export const ACCESS_YES = '#7b3fe4';

function addOwnership(m: MlMap, before?: string) {
  if (m.getSource('sma')) return;
  m.addSource('sma', { type: 'raster', tiles: [`${SMA}/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 16, attribution: 'Land: <a href="https://gis.blm.gov" target="_blank">BLM Surface Management Agency</a>' });
  m.addLayer({ id: 'sma', type: 'raster', source: 'sma', paint: { 'raster-opacity': 0.55 } }, before && m.getLayer(before) ? before : undefined);
}

let ayData: Promise<unknown> | null = null;
async function addAccessYes(m: MlMap, before?: string) {
  if (m.getSource('ay')) return;
  ayData ??= fetch('/api/accessyes').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
  const data = await ayData.catch((e) => { ayData = null; throw e; });
  if (m.getSource('ay')) return;
  m.addSource('ay', { type: 'geojson', data: data as never });
  const b4 = before && m.getLayer(before) ? before : undefined;
  m.addLayer({ id: 'ay-fill', type: 'fill', source: 'ay', paint: { 'fill-color': ACCESS_YES, 'fill-opacity': 0.35 } }, b4);
  m.addLayer({ id: 'ay-line', type: 'line', source: 'ay', paint: { 'line-color': ACCESS_YES, 'line-width': 1.6 } }, b4);
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true });
  m.on('click', 'ay-fill', (e) => {
    const p = e.features?.[0]?.properties as { name?: string; acres?: number } | undefined;
    if (p) popup.setLngLat(e.lngLat).setHTML(`<b>Access Yes!</b><br>${String(p.name ?? '').replace(/</g, '&lt;')}${p.acres ? `<br>${Number(p.acres).toLocaleString()} acres` : ''}`).addTo(m);
  });
}

// Montana Block Management: FWP wild/hpNewBMA_MIL/MapServer. Layer 5 = BMA boundaries (PTYPE 1/2), layer 4 = BMAs
// whose access is closed or restricted (left off), layer 3 = restricted areas inside BMAs.
const FWP_BMA = 'https://fwp-gis.mt.gov/arcgis/rest/services/wild/hpNewBMA_MIL/MapServer';
export const BMA1 = '#7b3fe4';
// teal, not orange: the finder fills matching units blaze orange
export const BMA2 = '#0f9fb0';
const BMA_CUT = ['Not in BMA (No Trespassing)', 'Safety Zone (No Trespassing, No Hunting)', 'No Shooting Area'];
const q = (layer: number, params: Record<string, string>) =>
  fetch(`${FWP_BMA}/${layer}/query?${new URLSearchParams({ f: 'geojson', outSR: '4326', maxAllowableOffset: '0.0003', geometryPrecision: '5', ...params })}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { features?: unknown[]; error?: unknown }) => (j.features ? j : Promise.reject(new Error('FWP map service error'))));
const esc = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
type Fc = { type: 'FeatureCollection'; features: { properties: Record<string, unknown> }[] };
let bmaData: Promise<{ bma: Fc; cut: Fc }> | null = null;
async function addBma(m: MlMap, before?: string) {
  if (m.getSource('bma')) return;
  bmaData ??= Promise.all([
    q(5, { where: '1=1', outFields: 'BMANUM,BMANAME,PTYPE,REGION,PDFMAP' }),
    q(4, { where: '1=1', outFields: 'BMANUM,REGION', returnGeometry: 'false', f: 'json' }),
    q(3, { where: `CLASS IN (${BMA_CUT.map((c) => `'${c.replace(/'/g, "''")}'`).join(',')})`, outFields: 'CLASS' }),
  ]).then(([b, closed, cut]) => {
    const shut = new Set(((closed as { features: { attributes?: Record<string, unknown>; properties?: Record<string, unknown> }[] }).features)
      .map((f) => { const a = f.attributes ?? f.properties ?? {}; return `${a.REGION}-${a.BMANUM}`; }));
    const bma = b as Fc;
    bma.features = bma.features.filter((f) => !shut.has(`${f.properties.REGION}-${f.properties.BMANUM}`));
    return { bma, cut: cut as Fc };
  });
  const data = await bmaData.catch((e) => { bmaData = null; throw e; });
  if (m.getSource('bma')) return;
  m.addSource('bma', { type: 'geojson', data: data.bma as never });
  m.addSource('bma-cut', { type: 'geojson', data: data.cut as never });
  const b4 = before && m.getLayer(before) ? before : undefined;
  for (const t of [1, 2] as const) {
    const color = t === 1 ? BMA1 : BMA2;
    m.addLayer({ id: `bma${t}-fill`, type: 'fill', source: 'bma', filter: ['==', ['get', 'PTYPE'], t], paint: { 'fill-color': color, 'fill-opacity': t === 1 ? 0.35 : 0.22 } }, b4);
    m.addLayer({ id: `bma${t}-line`, type: 'line', source: 'bma', filter: ['==', ['get', 'PTYPE'], t], paint: { 'line-color': color, 'line-width': 1.6, ...(t === 2 ? { 'line-dasharray': [2, 1.5] } : {}) } }, b4);
  }
  m.addLayer({ id: 'bma-cut-fill', type: 'fill', source: 'bma-cut', paint: { 'fill-color': '#3a3a3a', 'fill-opacity': 0.55 } }, b4);
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, maxWidth: '260px' });
  const show = (e: maplibregl.MapLayerMouseEvent) => {
    const cut = m.queryRenderedFeatures(e.point, { layers: ['bma-cut-fill'].filter((l) => m.getLayoutProperty(l, 'visibility') !== 'none') })[0];
    if (cut) { popup.setLngLat(e.lngLat).setHTML(`<b>${esc(cut.properties?.CLASS)}</b><br>Inside a Block Management Area but not open to hunting.`).addTo(m); return; }
    const p = e.features?.[0]?.properties as Record<string, unknown> | undefined;
    if (!p) return;
    const t = Number(p.PTYPE);
    const map = typeof p.PDFMAP === 'string' && p.PDFMAP.startsWith('https://fwp.mt.gov/') ? p.PDFMAP : null;
    popup.setLngLat(e.lngLat).setHTML(
      `<b>${esc(String(p.BMANAME ?? '').trim())}</b><br>BMA ${esc(p.BMANUM)} · FWP Region ${esc(p.REGION)}<br>` +
      (t === 1 ? '<b>Type 1:</b> sign yourself in. Open like public land, under this BMA&rsquo;s rules (vehicles often on marked roads only).'
        : '<b>Type 2:</b> the landowner or FWP gives permission, often by reservation. Not a sure way in.') +
      (map ? `<br><a href="${esc(map)}" target="_blank" rel="noopener">BMA map and rules (FWP)</a>` : '')).addTo(m);
  };
  m.on('click', 'bma1-fill', show);
  m.on('click', 'bma2-fill', show);
}

const vis = (m: MlMap, ids: string[], on: boolean) => ids.forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));

/** Legend swatches straight from the BLM service's own legend (so the colors are always right). */
function useSmaLegend(on: boolean) {
  const [items, setItems] = useState<{ label: string; img: string }[] | null>(null);
  useEffect(() => {
    if (!on || items) return;
    fetch(`${SMA}/legend?f=json`)
      .then((r) => r.json())
      .then((j: { layers?: { legend?: { label: string; imageData: string; contentType: string }[] }[] }) => {
        const seen = new Set<string>();
        const out: { label: string; img: string }[] = [];
        for (const l of j.layers ?? []) for (const g of l.legend ?? []) {
          if (!g.label || seen.has(g.label) || /alaska/i.test(g.label)) continue;
          seen.add(g.label);
          out.push({ label: g.label, img: `data:${g.contentType};base64,${g.imageData}` });
        }
        setItems(out);
      })
      .catch(() => setItems([]));
  }, [on, items]);
  return items;
}

/** The switches + legends. `before`: layer id to draw under (unit outlines / labels). `states`: the states on the
 *  map (combined Find Hunts); defaults to the header state. Access Yes! is Idaho's layer only: Wyoming's program
 *  has the same name but no outlines here, so it gets no switch. */
export function LandToggles({ map, before, className = '', states }: { map: MlMap | null; before?: string; className?: string; states?: string[] }) {
  const header = useStateConfig();
  const on = states ?? [header.code];
  const idaho = on.includes('ID'), montana = on.includes('MT');
  const program = 'Access Yes!';
  const [own, setOwn] = useState(false);
  const [ay, setAy] = useState(false);
  const [b1, setB1] = useState(false);
  const [b2, setB2] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!map) return;
    if (b1 || b2) addBma(map, before).then(() => { vis(map, ['bma1-fill', 'bma1-line'], b1); vis(map, ['bma2-fill', 'bma2-line'], b2); vis(map, ['bma-cut-fill'], true); })
      .catch(() => setErr('Could not load Block Management areas from FWP.'));
    else vis(map, ['bma1-fill', 'bma1-line', 'bma2-fill', 'bma2-line', 'bma-cut-fill'], false);
  }, [map, b1, b2, before]);
  const legend = useSmaLegend(own);
  useEffect(() => {
    if (!map) return;
    if (own) addOwnership(map, before);
    vis(map, ['sma'], own);
  }, [map, own, before]);
  useEffect(() => {
    if (!map) return;
    if (ay) addAccessYes(map, before).then(() => vis(map, ['ay-fill', 'ay-line'], true)).catch(() => setErr('Could not load Access Yes! properties.'));
    else vis(map, ['ay-fill', 'ay-line'], false);
  }, [map, ay, before]);
  return (
    <div className={`land-toggles ${className}`}>
      <label><input type="checkbox" checked={own} onChange={() => setOwn((x) => !x)} /> Public / private land</label>
      {idaho && (
        <label>
          <input type="checkbox" checked={ay} onChange={() => setAy((x) => !x)} />{" "}
          <i className="sw" style={{ background: ACCESS_YES }} /> {program}{on.length > 1 ? ' (Idaho)' : ''}
        </label>
      )}
      {montana && <>
        <label title="You sign yourself in: open like public land, under each area's rules">
          <input type="checkbox" checked={b1} onChange={() => setB1((x) => !x)} />{" "}
          <i className="sw" style={{ background: BMA1 }} /> Block Management Type 1{on.length > 1 ? ' (MT)' : ''}
        </label>
        <label title="Landowner or FWP permission needed, often by reservation">
          <input type="checkbox" checked={b2} onChange={() => setB2((x) => !x)} />{" "}
          <i className="sw" style={{ background: BMA2 }} /> Block Management Type 2{on.length > 1 ? ' (MT)' : ''}
        </label>
      </>}
      {montana && (b1 || b2) && <p className="muted">FWP&apos;s current Block Management Areas. Type 1 (purple): sign yourself in. Type 2 (teal, dashed): permission or reservation needed, not a sure way in. Dark grey: no-trespass and safety zones inside a BMA. Tap an area for its rules map.</p>}
      {own && legend && legend.length > 0 && (
        <div className="sma-key">{legend.map((l) => <span key={l.label}><img src={l.img} alt="" width={14} height={10} />{l.label.replace(/\s*\(.*?\)\s*/g, '')}</span>)}</div>
      )}
      {own && <p className="muted">Land managers from BLM. Private land isn&apos;t open without permission{ay ? '; Access Yes! (purple) is private land open by agreement' : ''}.</p>}
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
    </div>
  );
}
