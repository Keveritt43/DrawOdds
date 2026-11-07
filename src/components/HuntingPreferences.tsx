'use client';

import { startTransition, useActionState, useState } from 'react';
import { saveHuntingPreferences } from '@/app/actions';
import type { Residency } from '@prisma/client';
import type { StatePoints } from '@/lib/points';
import { POINT_SPECIES, SPECIAL_POINT_SPECIES } from '@/lib/states';
import { SPECIES_LABEL } from '@/lib/format';

export function HuntingPreferences({ idaho, colorado }: { idaho: Residency; colorado: StatePoints }) {
  const [result, save, pending] = useActionState(saveHuntingPreferences, { message: '', saved: false });
  const [idahoResidency, setIdahoResidency] = useState(idaho);
  const [coloradoResidency, setColoradoResidency] = useState(colorado.res);
  const [points, setPoints] = useState({ DEER: String(colorado.DEER), ELK: String(colorado.ELK), PRONGHORN: String(colorado.PRONGHORN) });
  const [youth, setYouth] = useState(colorado.youth);
  const [special, setSpecial] = useState(Object.fromEntries(SPECIAL_POINT_SPECIES.map(s => [s, String(colorado[s] ?? 0)])));
  const [weighted, setWeighted] = useState(Object.fromEntries(SPECIAL_POINT_SPECIES.map(s => [s, String(colorado.weighted?.[s] ?? 0)])));
  return (
    <form className="card account-preferences" action={save} id="hunting-preferences" onSubmit={event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      // Dispatch directly so React does not reset the residency menus after saving.
      startTransition(() => save(values));
    }}>
      <h2>Hunting Preferences</h2>
      <p className="small muted">Draw odds and rankings use the residency and points you save here.</p>
      <fieldset>
        <legend>Idaho</legend>
        <label>Residency
          <select name="idahoResidency" value={idahoResidency} onChange={e => setIdahoResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Colorado</legend>
        <label>Residency
          <select name="coloradoResidency" value={coloradoResidency} onChange={e => setColoradoResidency(e.target.value as Residency)}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <div className="account-points">
          {POINT_SPECIES.CO?.map(species => (
            <label key={species}>{SPECIES_LABEL[species]} points
              <input type="number" name={species} min={0} max={40} step={1} required value={points[species]}
                onChange={e => setPoints({ ...points, [species]: e.target.value })} />
            </label>
          ))}
        </div>
        <h3>Moose, Sheep &amp; Goat Points</h3>
        <p className="small muted">Track regular preference points (0–3) and weighted points separately. Saved values select the matching point-level draw results. Desert bighorn sheep does not use points.</p>
        <div className="account-special-points">
          {SPECIAL_POINT_SPECIES.map(species => <div key={species}>
            <b>{species === 'BIGHORN' ? 'Rocky Mountain Bighorn Sheep' : SPECIES_LABEL[species]}</b>
            <div className="account-points">
              <label>{SPECIES_LABEL[species]} preference points<input type="number" name={species} min={0} max={3} step={1} required value={special[species]} onChange={e => setSpecial({ ...special, [species]: e.target.value })} /></label>
              <label>{SPECIES_LABEL[species]} weighted points<input type="number" name={species + '_weighted'} min={0} max={40} step={1} required value={weighted[species]} onChange={e => setWeighted({ ...weighted, [species]: e.target.value })} /></label>
            </div>
          </div>)}
        </div>
        <label className="account-youth"><input type="checkbox" name="youth" checked={youth} onChange={e => setYouth(e.target.checked)} /> Youth draw results</label>
      </fieldset>
      <div className="account-save">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Preferences'}</button>
        <span role={result.message && !result.saved ? 'alert' : 'status'}>{result.message}</span>
      </div>
    </form>
  );
}
