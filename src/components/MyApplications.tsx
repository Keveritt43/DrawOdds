import { addApplication, setApplicationResult, deleteApplication } from '@/app/actions';

const KIND: Record<string, string> = {
  NR_ELK: 'Nonresident general elk tag', NR_DEER: 'Nonresident general deer tag', CTL_DEER: 'Controlled deer', CTL_ELK: 'Controlled elk',
  CTL_PRONGHORN: 'Controlled pronghorn', MOOSE: 'Moose', BIGHORN: 'Bighorn sheep', GOAT: 'Mountain goat',
};
const RESULT: Record<string, string> = { PENDING: 'Waiting', DREW: 'Drew', NOT_DRAWN: 'Not drawn' };
const MSG = ['MOOSE', 'BIGHORN', 'GOAT'];

type App = { id: string; year: number; kind: string; codes: string; result: string; note: string | null };

/** What the hunter's own history means this year: moose / sheep / goat waits and lockouts. */
function reminders(apps: App[], now = new Date()): string[] {
  const y = now.getUTCFullYear();
  const out: string[] = [];
  for (const a of apps) {
    if (!MSG.includes(a.kind)) continue;
    if (a.result === 'DREW') {
      out.push(`You drew ${KIND[a.kind].toLowerCase()} in ${a.year}: you can't apply for ${KIND[a.kind].toLowerCase()} again until ${a.year + 3}${a.kind === 'GOAT' ? ', and a mountain goat taken in Idaho is once in a lifetime' : a.kind === 'MOOSE' ? '; an antlered moose is once in a lifetime' : '; a ram is once per subspecies'}.`);
    }
    if (a.year >= y) {
      out.push(`Applying for ${KIND[a.kind].toLowerCase()} in ${a.year} keeps you out of that year's deer, elk and pronghorn controlled drawings (leftovers aside).`);
    }
  }
  return [...new Set(out)];
}

export function MyApplications({ apps }: { apps: App[] }) {
  const thisYear = new Date().getUTCFullYear();
  const notes = reminders(apps);
  return (
    <section>
      <h2>My Applications</h2>
      <p className="small muted">Keep track of what you applied for and what you drew. Only you see this.</p>
      {notes.map((n) => <p key={n} className="note">{n}</p>)}
      {apps.length > 0 && (
        <table className="cmp-table" style={{ marginBottom: 12 }}>
          <thead><tr><th>Year</th><th>Application</th><th>Choices</th><th>Result</th><th /></tr></thead>
          <tbody>
            {apps.map((a) => (
              <tr key={a.id}>
                <td>{a.year}</td><td>{KIND[a.kind] ?? a.kind}{a.note ? <div className="small muted">{a.note}</div> : null}</td><td>{a.codes || '-'}</td>
                <td>
                  <form className="seg light" style={{ display: 'inline-flex' }}>
                    {Object.entries(RESULT).map(([k, l]) => (
                      <button key={k} type="submit" formAction={setApplicationResult.bind(null, a.id, k)} aria-pressed={a.result === k}>{l}</button>
                    ))}
                  </form>
                </td>
                <td><form><button type="submit" className="btn small" formAction={deleteApplication.bind(null, a.id)}>Remove</button></form></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form action={addApplication} className="card app-form">
        <label>Year <input name="year" type="number" defaultValue={thisYear + 1} min={2000} max={2100} required /></label>
        <label>Application <select name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Choices / codes <input name="codes" placeholder="e.g. ELK37, ELK21 or 1057, 1031" maxLength={120} /></label>
        <label>Result <select name="result">{Object.entries(RESULT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Note <input name="note" maxLength={200} placeholder="optional" /></label>
        <button type="submit" className="btn primary">Add</button>
      </form>
    </section>
  );
}
