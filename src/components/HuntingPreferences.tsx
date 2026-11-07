'use client';

import { useActionState } from 'react';
import { saveHuntingPreferences } from '@/app/actions';
import type { Residency } from '@prisma/client';
import type { StatePoints } from '@/lib/points';
import { POINT_SPECIES } from '@/lib/states';
import { SPECIES_LABEL } from '@/lib/format';

export function HuntingPreferences({ idaho, colorado }: { idaho: Residency; colorado: StatePoints }) {
  const [result, save, pending] = useActionState(saveHuntingPreferences, { message: '', saved: false });
  return (
    <form className="card account-preferences" action={save} id="hunting-preferences">
      <h2>Hunting Preferences</h2>
      <p className="small muted">Draw odds and rankings use the residency and points you save here.</p>
      <fieldset>
        <legend>Idaho</legend>
        <label>Residency
          <select name="idahoResidency" defaultValue={idaho}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Colorado</legend>
        <label>Residency
          <select name="coloradoResidency" defaultValue={colorado.res}>
            <option value="RESIDENT">Resident</option>
            <option value="NONRESIDENT">Nonresident</option>
          </select>
        </label>
        <div className="account-points">
          {POINT_SPECIES.CO?.map(species => (
            <label key={species}>{SPECIES_LABEL[species]} points
              <input type="number" name={species} min={0} max={40} step={1} required defaultValue={colorado[species]} />
            </label>
          ))}
        </div>
        <label className="account-youth"><input type="checkbox" name="youth" defaultChecked={colorado.youth} /> Youth draw results</label>
      </fieldset>
      <div className="account-save">
        <button className="btn primary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save Preferences'}</button>
        <span role={result.message && !result.saved ? 'alert' : 'status'}>{result.message}</span>
      </div>
    </form>
  );
}
