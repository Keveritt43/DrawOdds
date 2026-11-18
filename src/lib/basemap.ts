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
