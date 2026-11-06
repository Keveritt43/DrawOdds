import { getState } from '@/lib/residency';
import Link from 'next/link';
import { listStudies, MIG_SPECIES, type MigClass, type MigStats, type MigTiming } from '@/lib/migrations';
import { MigrationExplorer, type StudyRow } from '@/components/MigrationExplorer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Migration Studies', description: 'Idaho mule deer, elk and pronghorn migration routes and stopovers: timing, distances and the hunting units they cross.' };

export default async function MigrationPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if((await getState()).code==='CO')return <main className="wrap" style={{margin:'24px auto'}}><h1>Colorado Migration Information</h1><p>Idaho migration studies are not applied to Colorado units. Consult the CPW Hunting Atlas species and habitat layers for Colorado movement information; movement corridors do not establish legal access or season eligibility.</p><a href="https://cpw.state.co.us/maps-and-gis">CPW maps, GIS and Hunting Atlas</a></main>;
  const sp = await searchParams;
  const initial = String(sp.species ?? '').split(',').filter((x) => (MIG_SPECIES as string[]).includes(x));
  const list = (k: string) => String(sp[k] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const studies = await listStudies();
  const rows: StudyRow[] = studies.map((s) => {
    const st = s.stats as unknown as MigStats;
    const t = s.timing as unknown as { spring: MigTiming; fall: MigTiming } | null;
    return {
      slug: s.slug, name: s.name, species: s.species, classes: s.classes as unknown as MigClass[], routes: !s.mapNote, units: s.units,
      avgMiles: st.avgMiles, maxMiles: st.maxMiles, individuals: st.individuals, median: !!st.median,
      fallStart: t?.fall.startAvg ?? null, fallEnd: t?.fall.endAvg ?? null, springStart: t?.spring.startAvg ?? null, springEnd: t?.spring.endAvg ?? null,
      year: s.studyStart && s.studyEnd ? `${new Date(s.studyStart).getUTCFullYear()}–${new Date(s.studyEnd).getUTCFullYear()}` : '',
    };
  });
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <h1>Migration Studies</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        Where collared mule deer, elk and pronghorn travel between summer and winter range, how heavily each route is used, where they stop over, and when they move.
        Pick any mix of species, tap a route to see whose it is, and open a study for its full report numbers and the hunts in the units it crosses.
      </p>
      {rows.length === 0 ? (
        <p>No migration studies loaded yet.</p>
      ) : (
        <MigrationExplorer studies={rows} initial={initial} initialUnits={list('unit').map((u) => u.toUpperCase())} initialZones={list('zone')} />
      )}
      <p className="small">
        Find hunts in units with a study:{' '}
        <Link href="/hunts?migration=yes&species=DEER">deer</Link> · <Link href="/hunts?migration=yes&species=ELK">elk</Link> · <Link href="/hunts?migration=yes&species=PRONGHORN">pronghorn</Link>
      </p>
    </main>
  );
}
