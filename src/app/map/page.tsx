import { MtElsewhere } from "@/components/MtHome";
import { getResidency, getDraw, getState } from '@/lib/residency';
import { UnitMap } from '@/components/UnitMap';
import { getFavorites } from '@/lib/favorites';
import { getPoints } from '@/lib/points';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unit Map' };

export default async function MapPage() {
  const state = await getState();
  const points = state.code === 'CO' ? await getPoints('CO') : null;
  // Montana has no unit geometry loaded. Rendering the map anyway draws nothing and still shows its legend,
  // whose shading note credits IDFG — Idaho's source, under a Montana header. Show the notice instead.
  if (state.code === 'MT') {
    return <main className="wrap" style={{ maxWidth: 860, margin: '24px auto 48px' }}><h1>Unit Map</h1><MtElsewhere what="The unit map" /></main>;
  }
  const [{ residency }, fav, draw] = await Promise.all([getResidency(), getFavorites(), getDraw()]);
  return (
    <main className="mapbox">
      <UnitMap key={state.code + draw + JSON.stringify(points)} coPointsKey={points ? JSON.stringify(points) : ''} draw={draw} nr={residency === 'NONRESIDENT'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
    </main>
  );
}
