import type { StyleSpecification } from 'maplibre-gl';

/** USGS National Map tiles: public domain, no key. Topo = contour topo; Satellite = imagery with topo labels. */
export const BASEMAPS = {
  topo: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
  satellite: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryTopo/MapServer/tile/{z}/{y}/{x}',
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
