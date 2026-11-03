import Link from 'next/link';
import { listStudies, type MigClass } from '@/lib/migrations';
import { MigrationMap } from '@/components/MigrationMap';
import { StudyCard } from '@/components/StudyCard';
import { MigrationUnits } from '@/components/MigrationUnits';
import { getResidency } from '@/lib/residency';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Migration Studies', description: 'Idaho big game migration routes and stopovers, with timing, on a map, and the hunting units they cross.' };

export default async function MigrationPage() {
  const studies = await listStudies();
  const nr = (await getResidency()).residency === 'NONRESIDENT';
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Migration Studies</h1>
      <p className="muted" style={{ maxWidth: '70ch' }}>
        Where collared deer travel between summer and winter range, how heavily each route is used, where they stop over, and when they move. Turn each study on or off on the map; every unit it crosses shows it too, and Find A Hunt can filter to those units.
      </p>
      {studies.length === 0 ? (
        <p>No migration studies loaded yet.</p>
      ) : (
        <>
          <MigrationMap studies={studies.map((s) => ({ slug: s.slug, name: s.name, classes: s.classes as unknown as MigClass[] }))} />
          {studies.map((s) => (
            <div key={s.slug} id={s.slug}>
              <StudyCard s={s} />
              <MigrationUnits s={s} nr={nr} />
            </div>
          ))}
          <p className="small"><Link href={`/hunts?migration=yes&species=DEER`}>Find deer hunts in units with a migration study →</Link></p>
        </>
      )}
    </main>
  );
}
