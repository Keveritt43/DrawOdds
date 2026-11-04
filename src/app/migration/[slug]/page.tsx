import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudy, listStudies, ym, type MigClass } from '@/lib/migrations';
import { MigrationMap } from '@/components/MigrationMap';
import { StudyCard } from '@/components/StudyCard';
import { MigrationUnits } from '@/components/MigrationUnits';
import { SPECIES_NAME } from '@/lib/migrationShared';
import { getResidency } from '@/lib/residency';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getStudy((await params).slug);
  return s ? { title: s.name, description: s.summary.slice(0, 180) } : { title: 'Migration study' };
}

export default async function StudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = await getStudy((await params).slug);
  if (!s) notFound();
  const nr = (await getResidency()).residency === 'NONRESIDENT';
  // other studies in the same units, any species
  const near = s.units.length ? (await listStudies()).filter((o) => o.slug !== s.slug && o.units.some((u) => s.units.includes(u))) : [];
  return (
    <main className="wrap" style={{ margin: '24px auto 48px' }}>
      <p className="small" style={{ margin: '0 0 6px' }}><Link href={`/migration?species=${s.species}`}>← All {SPECIES_NAME[s.species]?.toLowerCase() ?? ''} migration studies</Link></p>
      <p className="mig-eyebrow" style={{ marginTop: 6 }}><span className={`pill sp-${s.species.toLowerCase()}`}>{SPECIES_NAME[s.species] ?? s.species}</span> {s.preparedBy ? <span className="muted small">Analyzed by {s.preparedBy}{s.preparedDate ? `, ${ym(s.preparedDate)}` : ''}</span> : null}</p>
      <h1 style={{ margin: '0 0 12px' }}>{s.name}</h1>
      {s.mapNote ? null : <MigrationMap studies={[{ slug: s.slug, name: s.name, species: s.species, classes: s.classes as unknown as MigClass[] }]} height="min(520px, 70vh)" />}
      <StudyCard s={s} titled={false} />
      {near.length > 0 && (
        <p className="small">
          <b>Other studies in these units:</b>{' '}
          {near.map((o, i) => <span key={o.slug}>{i ? ' · ' : ''}<Link href={`/migration/${o.slug}`}>{o.name.replace(/ Migration$/, '')}</Link></span>)}
        </p>
      )}
      {s.units.length > 0 && <MigrationUnits s={s} nr={nr} />}
    </main>
  );
}
