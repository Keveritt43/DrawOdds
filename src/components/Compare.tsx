'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Up to 4 hunts picked for side-by-side comparison, kept in this browser. */
const KEY = 'compareHunts';
const MAX = 4;
const EVT = 'compare-change';

export function readCompare(): { id: string; label: string }[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, MAX) : [];
  } catch {
    return [];
  }
}
function write(list: { id: string; label: string }[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch { /* storage blocked: compare just won't persist */ }
  window.dispatchEvent(new Event(EVT));
}
function useCompare() {
  const [list, setList] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    const sync = () => setList(readCompare());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return list;
}

/** "Compare" checkbox on a card or table row. */
export function CompareToggle({ id, label, compact = false }: { id: string; label: string; compact?: boolean }) {
  const list = useCompare();
  const on = list.some((x) => x.id === id);
  const full = !on && list.length >= MAX;
  return (
    <label className={`cmp-toggle${compact ? ' compact' : ''}`} title={full ? `You can compare up to ${MAX} hunts` : 'Add to the side-by-side comparison'}>
      <input
        type="checkbox"
        checked={on}
        disabled={full}
        onChange={() => write(on ? readCompare().filter((x) => x.id !== id) : [...readCompare(), { id, label }])}
      />
      {!compact && <span>Compare</span>}
    </label>
  );
}

/** Bar along the bottom of the screen while hunts are picked. */
export function CompareTray() {
  const list = useCompare();
  const path = usePathname();
  if (!list.length || path === '/compare') return null;
  return (
    <div className="cmp-tray" role="region" aria-label="Hunts to compare">
      <span className="small"><b>{list.length}</b> of {MAX} picked:</span>
      <span className="cmp-names small">
        {list.map((x) => (
          <span key={x.id} className="pill">
            {x.label}
            <button type="button" aria-label={`Remove ${x.label}`} onClick={() => write(readCompare().filter((y) => y.id !== x.id))}>×</button>
          </span>
        ))}
      </span>
      <Link className={`btn primary${list.length < 2 ? ' disabled' : ''}`} href={`/compare?ids=${list.map((x) => encodeURIComponent(x.id)).join(',')}`} aria-disabled={list.length < 2}>
        Compare{list.length < 2 ? ' (pick 2+)' : ''}
      </Link>
      <button type="button" className="btn" onClick={() => write([])}>Clear</button>
    </div>
  );
}
