'use client';

import { useActionState, useState } from 'react';
import { saveHuntingPreferences } from '@/app/actions';
import type { Residency } from '@prisma/client';
import type { StatePoints } from '@/lib/points';
import { POINT_SPECIES } from '@/lib/states';
import { SPECIES_LABEL } from '@/lib/format';

export function HuntingPreferences({ idaho, colorado }: { idaho: Residency; colorado: StatePoints }) {
  const [result, save, pending] = useActionState(saveHuntingPreferences, { message: '', saved: false });
  const [idahoResidency, setIdahoResidency] = useState(idaho);
  const [coloradoResidency, setColoradoResidency] = useState(colorado.res);
  const [points, setPoints] = useState({ DEER: String(colorado.DEER), ELK: String(colorado.ELK), PRONGHORN: String(colorado.PRONGHORN) });
  const [youth, setYouth] = useState(colorado.youth);
  return (
    <form className="card account-preferences" action={save} id="hunting-preferences">
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
        <label className="account-youth"><input type="checkbox" name="youth" checked={youth} onChange={e => setYouth(e.target.checked)} /> Youth draw results</label>
      </fieldset>
      <div className="account-save">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Preferences'}</button>
        <span role={result.message && !result.saved ? 'alert' : 'status'}>{result.message}</span>
      </div>
    </form>
  );
}
