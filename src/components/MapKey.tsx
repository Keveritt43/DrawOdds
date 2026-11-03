'use client';

import { useEffect, useState } from 'react';
import { NODATA, type Classes } from '@/lib/mapMetrics';
import type { Basemap } from '@/lib/basemap';

export interface KeyItem { color: string; label: string; line?: boolean; dashed?: boolean }
export interface Ramp { classes: Classes | undefined; colors: string[]; fmt: (v: number) => string; none: string; missing: number; unit: string; /** categories instead of ranges (elk objectives) */ labels?: string[] }

/**
 * The key every shaded map carries: optional filters (animal, hunt type), a "Shade" picker that is always there,
 * the legend for what's shown right now (a color ramp, or swatches), and - folded away - class counts, the note
 * and the basemap switch.
 */
export function MapKey({
  filters, value, options, onChange, ramp, items = [], extraItems = [], note, kind, onKind, err, layers, folded = false,
}: {
  filters?: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** color-ramp legend; leave out for a swatch legend (`items`) */
  ramp?: Ramp;
  items?: KeyItem[];
  /** always shown under the legend (elk zone outlines, selected unit) */
  extraItems?: KeyItem[];
  note: string;
  kind: Basemap;
  onKind: (k: Basemap) => void;
  err?: string;
  /** extra map layers the reader can switch on (land ownership, Access Yes!) */
  layers?: React.ReactNode;
  /** fold the details away (e.g. while a unit's popup is open) */
  folded?: boolean;
}) {
  // details start folded on phones (the key must not cover the map), open on wide screens
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(min-width: 1100px)').matches) setOpen(true);
  }, []);
  useEffect(() => {
    if (folded) setOpen(false);
  }, [folded]);
  const b = ramp?.classes?.breaks ?? [];
  const fmt = ramp?.fmt ?? String;
  const cat = ramp?.labels && ramp.classes?.idx ? ramp.labels : null;
  const label = (i: number) => cat ? cat[i] ?? '' : (!b.length ? `All ${ramp?.unit ?? 'units'}` : i === 0 ? `Under ${fmt(b[0])}` : i === b.length ? `${fmt(b[i - 1])}+` : `${fmt(b[i - 1])} to ${fmt(b[i])}`);
  const tick = (i: number) => cat ? (cat[i] ?? '').split(' ')[0] : (!b.length ? 'All' : i === 0 ? `<${fmt(b[0])}` : fmt(b[i - 1]));
  const swatches = (xs: KeyItem[]) => (
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
      {filters && <div className="mk-filters">{filters}</div>}
      <div className="mp-row">
        <label className="mk-lab" htmlFor="shade-by">Shade</label>
        <select id="shade-by" aria-label="Shade by" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="button" className="mp-more" aria-expanded={open} aria-label={open ? 'Hide map key details' : 'Show map key details'} onClick={() => setOpen((o) => !o)}>
          {open ? '▴' : '▾'}
        </button>
      </div>

      {ramp ? (
        ramp.classes ? (
          <div className="mp-strip" role="list" aria-label="Map key">
            {ramp.colors.map((c, i) => (
              <div key={i} className="mp-cell" role="listitem" title={`${label(i)}: ${ramp.classes!.counts[i]} ${ramp.unit}`}>
                <i style={{ background: c }} />
                <span>{tick(i)}</span>
              </div>
            ))}
            {ramp.missing ? <div className="mp-cell nd" role="listitem" title={`${ramp.none}: ${ramp.missing} ${ramp.unit}`}><i style={{ background: NODATA }} /><span>n/a</span></div> : null}
          </div>
        ) : <p className="small muted" style={{ margin: '6px 0 0' }}>Loading shading…</p>
      ) : swatches(items)}
      {extraItems.length > 0 && swatches(extraItems)}
      {layers}

      {open && (
        <div className="mp-details">
          {ramp?.classes && (
            <table className="legend-t small">
              <tbody>
                {ramp.colors.map((c, i) => <tr key={i}><td><i style={{ background: c }} /></td><td>{label(i)}</td><td className="n">{ramp.classes!.counts[i]} {ramp.unit}</td></tr>).reverse()}
                {ramp.missing ? <tr><td><i style={{ background: NODATA }} /></td><td>{ramp.none}</td><td className="n">{ramp.missing}</td></tr> : null}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ margin: '4px 0 8px' }}>{note}</p>
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

/** A small segmented control for the key's filter row. */
export function KeySeg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string, boolean?][]; onChange: (v: T) => void }) {
  return (
    <div className="mk-seg">
      <span className="mk-lab">{label}</span>
      <div className="seg light" role="group" aria-label={label}>
        {options.map(([v, l, disabled]) => (
          <button key={v} type="button" aria-pressed={value === v} disabled={!!disabled} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
