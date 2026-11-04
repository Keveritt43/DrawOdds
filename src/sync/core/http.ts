/**
 * One polite HTTP client for every IDFG request: identifies itself, waits between calls,
 * retries transient failures with backoff, and never hammers a public agency server.
 */
const UA = process.env.SYNC_USER_AGENT || 'IdahoHuntPlanner/0.1 (+https://github.com)';
const DELAY = Number(process.env.SYNC_DELAY_MS || 1200);

let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FetchError extends Error {
  constructor(
    public url: string,
    public status: number,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export async function get(url: string, opts: { retries?: number; accept?: string; headers?: Record<string, string> } = {}): Promise<string> {
  const retries = opts.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const wait = last + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: opts.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8', ...(opts.headers ?? {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return await res.text();
      // 4xx other than 429 won't get better by retrying
      if (res.status !== 429 && res.status < 500) throw new FetchError(url, res.status);
      if (attempt >= retries) throw new FetchError(url, res.status);
    } catch (e) {
      if (e instanceof FetchError && e.status !== 429 && e.status < 500) throw e;
      if (attempt >= retries) throw e;
    }
    await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s
  }
}

export async function getJson<T>(url: string): Promise<T> {
  const text = await get(url, { accept: 'application/json' });
  return JSON.parse(text) as T;
}

/** Binary download (PDFs), same politeness: one request at a time with the configured delay; 404 -> null. */
export async function getBytes(url: string): Promise<Uint8Array | null> {
  for (let attempt = 0; ; attempt++) {
    const wait = last + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*;q=0.8' }, signal: AbortSignal.timeout(120_000) });
      console.log(`[http] GET ${url} -> ${res.status} ${res.headers.get('content-type') ?? ''}${res.url !== url ? ` (now ${res.url})` : ''}`);
      if (res.status === 404) return null;
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      if (res.status !== 429 && res.status < 500) throw new FetchError(url, res.status);
      if (attempt >= 3) throw new FetchError(url, res.status);
    } catch (e) {
      if (e instanceof FetchError && e.status !== 429 && e.status < 500) throw e;
      if (attempt >= 3) throw e;
    }
    await sleep(2000 * 2 ** attempt);
  }
}
