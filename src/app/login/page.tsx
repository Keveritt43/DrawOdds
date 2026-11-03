import { emailSignIn } from '@/app/actions';

export const metadata = { title: 'Sign In' };

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && /^\/(?![\/\\])/.test(sp.next) ? sp.next : '/account';
  return (
    <main className="wrap" style={{ maxWidth: 440, margin: '48px auto' }}>
      <div className="card">
        <h1>Sign in</h1>
        {sp.sent ? (
          <p>Check your email for a sign-in link. It expires in 24 hours.</p>
        ) : (
          <form action={emailSignIn}>
            <p className="muted small">No password. We email you a one-time link. Your account stores your residency and your favorite hunts and units.</p>
            <input type="hidden" name="next" value={next} />
            <input type="email" name="email" required placeholder="you@example.com" autoComplete="email" aria-label="Email" />
            <div style={{ marginTop: 12 }}><button className="btn primary" type="submit">Email me a link</button></div>
          </form>
        )}
        {sp.error && <p className="small" style={{ color: 'var(--bad)' }}>Sign-in failed ({sp.error}). Try again.</p>}
      </div>
    </main>
  );
}
