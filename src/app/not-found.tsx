import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap" style={{ margin: '48px auto', maxWidth: 520 }}>
      <h1>Not found</h1>
      <p className="muted">That hunt or unit isn&apos;t in this season&apos;s data. IDFG renumbers and retires hunts every year.</p>
      <Link className="btn primary" href="/hunts">Find A Hunt</Link>
    </main>
  );
}
