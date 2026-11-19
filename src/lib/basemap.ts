import type { StyleSpecification } from 'maplibre-gl';

/** USGS National Map tiles: public domain, no key. Topo = contour topo; Satellite = imagery.
 *  USGS retired USGSImageryTopo (imagery with topo labels) by Nov 18, 2026: every tile 404s and it is gone from
 *  https://basemap.nationalmap.gov/arcgis/rest/services?f=json. USGSImageryOnly is the imagery without the labels. */
export const BASEMAPS = {
  topo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
} as const;
export type Basemap = keyof typeof BASEMAPS;

export function baseStyle(kind: Basemap = 'topo',
  agency = "IDFG",
): StyleSpecification {
  return {
    version: 8,
    // glyphs for unit labels (free, no key)
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'raster',
        tiles: [BASEMAPS[kind]],
        tileSize: 256,
        maxzoom: 16,
        attribution:
          'Basemap: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank">USGS The National Map</a> · Boundaries: ' +
          agency,
      },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

export function setBasemap(map: { getSource: (id: string) => unknown }, kind: Basemap) {
  const src = map.getSource('base') as { setTiles?: (t: string[]) => void } | undefined;
  src?.setTiles?.([BASEMAPS[kind]]);
}

export const IDAHO_CENTER: [number, number] = [-114.6, 45.2];

type ReadyMap = { once: (ev: 'style.load' | 'load', fn: () => void) => unknown; style?: unknown };

/** Run `fn` once the style is parsed, so overlays can be added. Not `load`: MapLibre holds `load` until the basemap
 *  tiles settle, and when USGS retired a tile service (Nov 2026) `load` never fired and no unit outlines were drawn.
 *  The outlines must never wait on a third-party basemap. */
export function onStyleReady(m: ReadyMap, fn: () => void) {
  let done = false;
  const go = () => { if (!done) { done = true; fn(); } };
  m.once('style.load', go);
  m.once('load', go);
  if ((m.style as { _loaded?: boolean } | undefined)?._loaded) go();
}

type OutlineMap = {
  getSource: (id: string) => unknown; getLayer: (id: string) => unknown;
  addSource: (id: string, src: object) => unknown; addLayer: (layer: object, before?: string) => unknown;
};

/**
 * State borders (lower 48) and state names: the lines above the unit outlines and below the unit labels, the names
 * on top so they win over unit numbers when zoomed out, so a hunter
 * looking at a multi-state search can tell where one state ends. public/state-outlines.json is built by
 * scripts/build_state_outlines.py from the Census 1:10,000,000 cartographic boundaries (us-atlas): generalized, so the
 * line fades as you zoom in to unit level, where the agency unit boundaries are the exact edge. Static and cached;
 * a failed fetch just leaves the borders off.
 */
export async function addStateOutlines(m: OutlineMap, before?: string) {
  if (m.getSource('state-outlines')) return;
  let data: unknown;
  try {
    const r = await fetch('/state-outlines.json');
    if (!r.ok) return;
    data = await r.json();
  } catch { return; }
  if (m.getSource('state-outlines')) return;
  const at = before && m.getLayer(before) ? before : undefined;
  m.addSource('state-outlines', { type: 'geojson', data });
  const lines = ['==', ['geometry-type'], 'LineString'];
  const fade = ['interpolate', ['linear'], ['zoom'], 7, 1, 10, 0.35];
  m.addLayer({ id: 'state-outline-casing', type: 'line', source: 'state-outlines', filter: lines,
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4.5, 8, 7], 'line-opacity': ['*', 0.85, fade] } }, at);
  m.addLayer({ id: 'state-outline', type: 'line', source: 'state-outlines', filter: lines,
    layout: { 'line-join': 'round' }, paint: { 'line-color': '#2a0f45', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 3.2], 'line-dasharray': [3, 1.5], 'line-opacity': fade } }, at);
  m.addLayer({ id: 'state-names', type: 'symbol', source: 'state-outlines', filter: ['==', ['geometry-type'], 'Point'], maxzoom: 6.5,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 11, 6, 16], 'text-letter-spacing': 0.2, 'text-allow-overlap': true },
    paint: { 'text-color': '#2a0f45', 'text-opacity': 0.85, 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
}
