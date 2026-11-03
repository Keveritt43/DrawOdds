'use client';

import { useEffect, useState } from 'react';
import { METRICS, METRIC_KEYS, NODATA, type Classes, type Metric, type Sp } from '@/lib/mapMetrics';
import type { Basemap } from '@/lib/basemap';

export interface KeyItem { color: string; label: string; line?: boolean; dashed?: boolean }

/**
 * The key every shaded map carries: a "Shade by" picker (always there, so any map can switch to any shading),
 * the legend for what's shown right now, and - folded away - the class counts, notes and basemap.
 * `matchLabel` adds a first option for a map that has its own shading (Filtering: units with matching hunts).
 */
export function MapKey({
  metric, onMetric, sp, onSp, classes, colors, missing, matchLabel, matchItems = [], extraItems = [], kind, onKind, err,
}: {
  metric: Metric | 'match';
  onMetric: (m: Metric | 'match') => void;
  sp: Sp;
  onSp: (s: Sp) => void;
  classes: Classes | undefined;
  colors: string[];
  missing: number;
  matchLabel?: string;
  matchItems?: KeyItem[];
  /** always shown under the legend (elk zone outlines, pronghorn areas, selected unit) */
  extraItems?: KeyItem[];
  kind: Basemap;
  onKind: (k: Basemap) => void;
  err?: string;
}) {
  // details start folded on phones (the key must not cover the map), open on wide screens
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(min-width: 1100px)').matches) setOpen(true);
  }, []);
  const M = metric === 'match' ? null : METRICS[metric];
  const fmt = M?.fmt ?? ((v: number) => String(v));
  const label = (i: number) => {
    const b = classes?.breaks ?? [];
    return !b.length ? 'All units' : i === 0 ? `Under ${fmt(b[0])}` : i === b.length ? `${fmt(b[i - 1])}+` : `${fmt(b[i - 1])} to ${fmt(b[i])}`;
  };
  const tick = (i: number) => {
    const b = classes?.breaks ?? [];
    return !b.length ? 'All' : i === 0 ? `<${fmt(b[0])}` : fmt(b[i - 1]);
  };
  const items = (xs: KeyItem[]) => (
    <div className="mk-items">
      {xs.map((x) => (
        <span key={x.label}>
          <i className={x.line ? `ln${x.dashed ? ' dash' : ''}` : ''} style={x.line ? { borderColor: x.color } : { background: x.color }} />
          {x.label}
        </span>
      ))}
    </div>
  );

  return (
    <div className="card mappanel">
      <div className="mp-row">
        <label className="mk-lab" htmlFor="shade-by">Shade</label>
        <select id="shade-by" aria-label="Shade units by" value={metric} onChange={(e) => onMetric(e.target.value as Metric | 'match')}>
          {matchLabel && <option value="match">{matchLabel}</option>}
          {METRIC_KEYS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}
        </select>
        {M?.bySpecies && (
          <div className="seg light mp-seg" role="group" aria-label="Species">
            <button type="button" aria-pressed={sp === 'ELK'} onClick={() => onSp('ELK')}>Elk</button>
            <button type="button" aria-pressed={sp === 'DEER'} onClick={() => onSp('DEER')}>Deer</button>
          </div>
        )}
        <button type="button" className="mp-more" aria-expanded={open} aria-label={open ? 'Hide map key details' : 'Show map key details'} onClick={() => setOpen((o) => !o)}>
          {open ? '▴' : '▾'}
        </button>
      </div>

      {metric === 'match'
        ? items(matchItems)
        : classes && (
          <div className="mp-strip" role="list" aria-label="Map key">
            {colors.map((c, i) => (
              <div key={i} className="mp-cell" role="listitem" title={`${label(i)}: ${classes.counts[i]} units`}>
                <i style={{ background: c }} />
                <span>{tick(i)}</span>
              </div>
            ))}
            {missing ? <div className="mp-cell nd" role="listitem" title={`${M?.none}: ${missing} units`}><i style={{ background: NODATA }} /><span>n/a</span></div> : null}
          </div>
        )}
      {metric !== 'match' && !classes && <p className="small muted" style={{ margin: '6px 0 0' }}>Loading shading…</p>}
      {extraItems.length > 0 && items(extraItems)}

      {open && (
        <div className="mp-details">
          {M && classes && (
            <table className="legend-t small">
              <tbody>
                {colors.map((c, i) => <tr key={i}><td><i style={{ background: c }} /></td><td>{label(i)}</td><td className="n">{classes.counts[i]} units</td></tr>).reverse()}
                {missing ? <tr><td><i style={{ background: NODATA }} /></td><td>{M.none}</td><td className="n">{missing}</td></tr> : null}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ margin: '4px 0 8px' }}>
            {M ? `${M.note} Each shade holds a similar number of units.` : 'Pick another shading above to color every unit by land, success, crowding or odds.'}
          </p>
          <div className="seg light" role="group" aria-label="Base map">
            <button type="button" aria-pressed={kind === 'topo'} onClick={() => onKind('topo')}>Topo</button>
            <button type="button" aria-pressed={kind === 'satellite'} onClick={() => onKind('satellite')}>Satellite</button>
          </div>
        </div>
      )}
      {err && <p className="small" style={{ color: 'var(--bad)', margin: '6px 0 0' }}>{err}</p>}
    </div>
  );
}
