import { getResidency, getDraw, getState } from '@/lib/residency';
import { UnitMap } from '@/components/UnitMap';
import { getFavorites } from '@/lib/favorites';
import { getPoints, getPointsStore } from '@/lib/points';
import { readMtPoints } from '@/lib/mtPoints';
import { readUtPoints } from '@/lib/utPoints';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unit Map' };

export default async function MapPage() {
  const state = await getState();
  // Colorado, Montana and Utah shade by the hunter's saved points: the map's data is keyed by them
  const store = (await getPointsStore()).store as Record<string, unknown>;
  const points = state.code === 'CO' ? await getPoints('CO') : state.code === 'MT' ? readMtPoints(store) : state.code === 'UT' ? readUtPoints(store) : null;
  const [{ residency }, fav, draw] = await Promise.all([getResidency(), getFavorites(), getDraw()]);
  return (
    <main className="mapbox">
      <UnitMap key={state.code + draw + JSON.stringify(points)} coPointsKey={points ? JSON.stringify(points) : ''} draw={draw} nr={points && (state.code === 'MT' || state.code === 'UT') ? points.res === 'NONRESIDENT' : residency === 'NONRESIDENT'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
    </main>
  );
}
