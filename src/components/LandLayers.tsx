"use client";
import { useStateConfig } from "./StateContext";

import { useEffect, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';

/**
 * Land layers any map can switch on: who manages the land (BLM's national Surface Management Agency map, as
 * tiles: federal, state and private) and IDFG's Access Yes! properties (outlines from our database).
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

/** The two switches + legends. `before`: layer id to draw under (unit outlines / labels). */
export function LandToggles({ map, before, className = '' }: { map: MlMap | null; before?: string; className?: string }) {
  const program = useStateConfig().accessProgram;
  const [own, setOwn] = useState(false);
  const [ay, setAy] = useState(false);
  const [err, setErr] = useState("");
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
      {program && (
        <label>
          <input type="checkbox" checked={ay} onChange={() => setAy((x) => !x)} />{" "}
          <i className="sw" style={{ background: ACCESS_YES }} /> {program}
        </label>
      )}
      {own && legend && legend.length > 0 && (
        <div className="sma-key">{legend.map((l) => <span key={l.label}><img src={l.img} alt="" width={14} height={10} />{l.label.replace(/\s*\(.*?\)\s*/g, '')}</span>)}</div>
      )}
      {own && <p className="muted">Land managers from BLM. Private land isn&apos;t open without permission{ay ? '; Access Yes! (purple) is private land open by agreement' : ''}.</p>}
      {err && <p style={{ color: "var(--warn)" }}>{err}</p>}
    </div>
  );
}
