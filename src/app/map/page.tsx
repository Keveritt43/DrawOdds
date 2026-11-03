import { getResidency, getDraw } from '@/lib/residency';
import { UnitMap } from '@/components/UnitMap';
import { getFavorites } from '@/lib/favorites';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unit Map' };

export default async function MapPage() {
  const [{ residency }, fav, draw] = await Promise.all([getResidency(), getFavorites(), getDraw()]);
  return (
    <main className="mapbox">
      <UnitMap key={draw} draw={draw} nr={residency === 'NONRESIDENT'} savedUnits={[...fav.units]} signedIn={fav.signedIn} />
    </main>
  );
}
