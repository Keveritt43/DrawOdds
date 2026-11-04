/** DrawOdds mark: topo contours with a blaze-orange pin on the high ground. */
export function LogoMark({ size = 36, title = 'DrawOdds' }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={title}>
      <rect width="48" height="48" rx="11" fill="#f4f5f0" />
      <g fill="none" stroke="#1d2023" strokeOpacity=".45" strokeWidth="1.6">
        <path d="M6 36c6-9 14-13 20-12s11 6 16 4" />
        <path d="M6 42c7-6 14-8 21-7s10 4 15 3" />
        <path d="M10 28c5-8 11-12 17-11s9 4 12 3" />
      </g>
      <path d="M24 6c-5 0-9 3.9-9 8.8 0 6.4 9 15.2 9 15.2s9-8.8 9-15.2C33 9.9 29 6 24 6z" fill="#f0641e" />
      <circle cx="24" cy="14.6" r="3.4" fill="#1d2023" />
    </svg>
  );
}

/** `state`: the state name under the brand (left out when a state picker sits beside it instead). */
export function Wordmark({ state }: { state?: string | null } = {}) {
  return (
    <span className="wordmark">
      <LogoMark size={34} />
      <span>
        DrawOdds{state ? <> <small>{state}</small></> : null}
      </span>
    </span>
  );
}
