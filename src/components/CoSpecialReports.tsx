import { SPECIAL_REPORTS, SPECIAL_REPORT_LABELS, SPECIAL_LABEL, specialBrochure, type SpecialSpecies } from '@/lib/coSpecial';

export function CoSpecialReports({ species, kind }: { species: SpecialSpecies; kind?: string }) {
  const reports = SPECIAL_REPORTS.filter(r => r.species === species && r.kind !== 'regs');
  const categories = [...new Set(reports.map(r => r.kind))].filter(k => !kind || k === kind);
  return <>
    {categories.map(k => <p key={k} className="small">
      <b>{SPECIAL_LABEL[species]} · {SPECIAL_REPORT_LABELS[k]}: </b>
      {reports.filter(r => r.kind === k).sort((a,b) => b.year - a.year).map((r, i) =>
        <span key={r.year}>{i > 0 && ' · '}<a href={r.url}>{r.year}</a></span>)}
    </p>)}
    {!kind && <p className="small"><a href={specialBrochure(species)}>CPW hunting brochure: seasons, unit boundaries and restrictions</a></p>}
  </>;
}
