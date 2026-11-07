'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PRESET_NAME_LIMIT, presetName, presetNameKey, type FilterPreset } from '@/lib/filterPresets';
import { finderHref } from '@/lib/huntNavigation';
import type { StateCode } from '@/lib/states';
import type { Draw } from '@/lib/species';

export function FilterPresets({ owner, state, states, draw }: { owner: string | null; state: StateCode; states?: StateCode[]; draw?: Draw }) {
  const query = new URLSearchParams(useSearchParams().toString());
  if (states) query.set('states', states.join(','));
  if (draw && !query.has('states')) query.set('draw', draw.toLowerCase());
  const href = finderHref(query.toString(), state);
  const [presets, setPresets] = useState<FilterPreset[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const clean = presetName(name);
  const replace = !!clean && !!presets?.some(p => presetNameKey(p.name) === presetNameKey(clean));

  async function load() {
    if (!owner || busy || presets) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/filter-presets', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (data.owner !== owner) throw new Error('Your account changed. Refresh and try again.');
      setPresets(data.presets);
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'Your account changed. Refresh and try again.' ? error.message : 'Could not load your presets. Please try again.');
    } finally { setBusy(false); }
  }

  async function change(preset: string, remove: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/filter-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset, href, remove, replace, owner }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || 'Could not change your presets. Please try again.');
        return;
      }
      setPresets(data.presets);
      setRemoving(null);
      if (!remove) setName('');
      setMessage(remove ? 'Preset deleted.' : replace ? 'Preset updated.' : 'Preset saved.');
    } catch {
      setMessage('Could not change your presets. Please try again.');
    } finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (clean && presets) void change(clean, false);
  }

  return <details className="rmore filter-group filter-presets" onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>Saved Filter Presets{presets?.length ? <span className="filter-active">{presets.length} saved</span> : null}</summary>
    <div className="preset-body">
      {!owner ? <p className="small"><Link href={'/login?next=' + encodeURIComponent(href)}>Sign in</Link> to save named searches to your account.</p>
        : presets ? <>
          <form onSubmit={save}>
            <label htmlFor="hunt-preset-name">Preset name</label>
            <div className="preset-actions">
              <input id="hunt-preset-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fall rifle deer" maxLength={PRESET_NAME_LIMIT} required />
              <button className="btn" type="submit" disabled={!clean || busy}>{replace ? 'Update' : 'Save'}</button>
            </div>
            <p className="small muted">{replace ? 'Replace this preset with the current search.' : 'Saves your states, filters, sort, and view.'}</p>
          </form>
          {presets.length > 0 && <ul className="preset-list">{presets.map(p => <li key={p.name}>
            <Link href={p.href} scroll={false} prefetch={false}>{p.name}</Link>
            {removing === p.name
              ? <span className="preset-actions"><button className="btn" type="button" disabled={busy} onClick={() => void change(p.name, true)}>Delete</button><button className="btn" type="button" onClick={() => setRemoving(null)}>Cancel</button></span>
              : <button className="btn" type="button" disabled={busy} aria-label={'Delete preset ' + p.name} onClick={() => setRemoving(p.name)}>Delete</button>}
          </li>)}</ul>}
        </> : busy ? <p className="small muted" role="status">Loading presets…</p>
          : <button className="btn" type="button" onClick={() => void load()}>Load presets</button>}
      {message && <p className="small" role="status">{message}</p>}
    </div>
  </details>;
}
