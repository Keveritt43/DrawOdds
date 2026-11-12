import { getResidency, getDraw, getState } from '@/lib/residency';
import { UnitMap } from '@/components/UnitMap';
import { getFavorites } from '@/lib/favorites';
import { getPoints, getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unit Map' };

export default async function MapPage() {
  const state = await getState();
  // Colorado and Montana shade by the hunter's saved points: the map's data is keyed by them
  const points = state.code === 'CO' ? await getPoints('CO') : state.code === 'MT' ? readMtPoints((await getPointsStore()).store as Record<string, unknown>) : null;
  const [{ residency }, fav, draw] = await Promise.all([getResidency(), getFavorites(), getDraw()]);
  return (
    <main className="mapbox">
      <UnitMap key={state.code + draw + JSON.stringify(points)} coPointsKey={points ? JSON.stringify(points) : ''} draw={draw} nr={points && 'comboType' in points ? points.res === 'NONRESIDENT' : residency === 'NONRESIDENT'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
    </main>
  );
}
