'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { baseStyle } from '@/lib/basemap';
import { IDAHO_BOUNDS } from '@/lib/mapMetrics';
import { loadUnits } from '@/lib/unitData';
import { MigrationControls, type StudyLite } from './MigrationLayers';
import { LandToggles } from './LandLayers';

/** Every migration study on one map, on by default and framed to the routes; unit outlines for reference. */
export function MigrationMap({ studies, height = '560px' }: { studies: StudyLite[]; height?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: baseStyle('satellite'), bounds: IDAHO_BOUNDS, maxZoom: 15, attributionControl: { compact: true } });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    // full screen takes the map's wrapper, so the key and panels come along
    m.addControl(new maplibregl.FullscreenControl({ container: el.current!.parentElement ?? undefined }), 'bottom-right');
    m.on('load', async () => {
      try {
        const { fc, labels } = await loadUnits();
        m.addSource('units', { type: 'geojson', data: fc as never, promoteId: 'name' });
        m.addLayer({ id: 'units-line', type: 'line', source: 'units', paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.85 } });
        if (!m.getSource('unit-labels')) m.addSource('unit-labels', { type: 'geojson', data: labels as never });
        m.addLayer({
          id: 'units-label', type: 'symbol', source: 'unit-labels',
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 13 },
          paint: { 'text-color': '#1d1d1b', 'text-halo-color': '#fff', 'text-halo-width': 1.4 },
        });
      } catch {
        /* the routes still draw without unit outlines */
      }
      setMap(m);
    });
    return () => {
      m.remove();
      setMap(null);
    };
  }, []);
  return (
    <div style={{ position: 'relative', height }} className="card" >
      <div ref={el} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden' }} />
      <MigrationControls map={map} studies={studies} defaultOn fit before="units-label" />
      <div className="card land-float"><LandToggles map={map} before="units-line" /></div>
    </div>
  );
}
