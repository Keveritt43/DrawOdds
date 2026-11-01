import { getResidency } from '@/lib/residency';
import { UnitMap } from '@/components/UnitMap';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Unit map - Idaho Hunt Planner' };

export default async function MapPage() {
  const { residency } = await getResidency();
  return (
    <main className="mapbox">
      <UnitMap nr={residency === 'NONRESIDENT'} />
    </main>
  );
}
