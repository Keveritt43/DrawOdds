'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { HUNT_PRESETS, parseHuntPresets } from '@/lib/huntPresets';
import type { StateCode } from '@/lib/states';

export function QuickHuntPresets({ wyomingOnly = false }: { wyomingOnly?: boolean }) {
  return <><label>Hunt presets (select any)</label><div className="opts">{HUNT_PRESETS.map(([key,name]) => <label key={key}><input type="checkbox" name="huntPreset" value={key} onChange={e => {
    if (key !== 'tag-filler' || !e.target.checked) return;
    const form = e.target.form;
    const sort = wyomingOnly ? 'odds' : 'opp';
    const option = form?.querySelector<HTMLInputElement>(`input[name="sort"][value="${sort}"]`);
    if (option) option.click();
    const select = form?.querySelector<HTMLSelectElement>('select[name="sort"]');
    if (select) select.value = sort;
  }}/><span>{name}</span></label>)}</div><p className="hint">A hunt can match any selected preset. Tag Filler sorts by {wyomingOnly ? 'draw odds' : 'Opportunity'}. Refine your search on the results page.</p></>;
}

export function HuntPresetFilters({states}: {states: StateCode[]}) {
  const router = useRouter(), sp = useSearchParams();
  const selected = parseHuntPresets(sp.getAll('huntPreset').join(','));
  function toggle(key: string) {
    const p = new URLSearchParams(sp.toString());
    const next = selected.includes(key as typeof selected[number]) ? selected.filter(v => v !== key) : [...selected, key];
    p.set('states', states.join(',')); p.delete('page'); p.delete('huntPreset');
    if (next.length) p.set('huntPreset', next.join(','));
    if (key === 'tag-filler' && next.includes('tag-filler')) {p.set('sort', states.length === 1 && states[0] === 'WY' ? 'odds' : 'opp'); p.set('minScore','0');}
    router.push('/hunts?' + p.toString(), {scroll:false});
  }
  return <details className="rsec"><summary><span className="t">DrawOdds Presets</span><span className={'v ' + (selected.length ? 'set' : '')}>{selected.length ? `${selected.length} selected` : 'Any'}<span className="edit" aria-hidden="true" /></span></summary><div className="body"><div className="checks2">{HUNT_PRESETS.map(([key,name])=><label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggle(key)}/>{name}</label>)}</div><p className="small muted">A hunt can match any selected preset. Other filters still apply.</p>{HUNT_PRESETS.filter(([key])=>selected.includes(key)).map(([key,name,description])=><p className="small muted" key={key}><b>{name}:</b> {description}.</p>)}{states.includes('WY') && selected.includes('tag-filler') && <p className="small muted">Wyoming Tag Filler uses at least 60% harvest per active license, pooled over up to five reported seasons. Deer qualifies if either reported species meets the threshold. This differs from hunter success; region aggregates are excluded.</p>}<p className="small muted">Points cutoffs describe past draws, not guaranteed tags. Rut timing is a seasonal heuristic based on each season’s midpoint. Public land does not guarantee access; missing data cannot satisfy a threshold.</p></div></details>;
}

export function HuntPresetNote({category}: {category: 'trophy' | 'land' | 'success' | 'odds' | 'timing'}) {
  const sp = useSearchParams();
  const selected = parseHuntPresets(sp.getAll('huntPreset').join(','));
  const rules: Record<string, Partial<Record<typeof category, string>>> = {
    'max-trophy': {trophy: 'Elite'},
    'trophy-sleepers': {trophy: 'Good or better', odds: '10% or more, or an observed cutoff at or below your saved points'},
    'peak-rut': {trophy: 'Good or better', timing: 'Timing score at least 12'},
    'public-diy': {trophy: 'Good or better', land: 'Public land at least 60%'},
    'tag-filler': {land: 'Public land at least 65%', success: 'Harvest success at least 60% (Wyoming: harvest per active license)'}
  };
  const notes = HUNT_PRESETS.flatMap(([key,name]) => selected.includes(key) && rules[key]?.[category] ? [name + ': ' + rules[key][category]] : []);
  return notes.length ? <p className="small muted">Preset alternatives: {notes.join(' · ')}. Other preset criteria also apply; manual filters narrow all results.</p> : null;
}
