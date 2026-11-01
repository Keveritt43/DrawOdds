'use client';

import { useRef } from 'react';

/** Wraps a GET form so every change re-runs the search (still works without JS via the Apply button). */
export function AutoSubmit({ children, action }: { children: React.ReactNode; action: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submit = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const form = ref.current;
      if (!form) return;
      // drop empty fields and join multi-selects so URLs stay short and shareable
      const fd = new FormData(form);
      const p = new URLSearchParams();
      for (const k of new Set(fd.keys())) {
        const v = fd.getAll(k).map(String).filter(Boolean);
        if (v.length) p.set(k, v.join(','));
      }
      window.location.assign(`${action}${p.size ? `?${p}` : ''}`);
    }, delay);
  };
  return (
    <form
      ref={ref}
      action={action}
      method="get"
      onChange={(e) => submit((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type === 'text' ? 600 : 50)}
      onSubmit={(e) => {
        e.preventDefault();
        submit(0);
      }}
    >
      {children}
    </form>
  );
}
