'use client';
import { useId, useState, type ReactNode } from 'react';
export function CoReportTabs({ panels }: { panels: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(panels[0].id);
  const prefix = useId();
  return (
    <section>
      <h2>Colorado Parks and Wildlife Reports</h2>
      <div className="co-report-tabs" role="tablist" aria-label="CPW report categories">
        {panels.map((p, i) => (
          <button
            type="button"
            role="tab"
            id={`${prefix}-${p.id}-tab`}
            key={p.id}
            aria-controls={`${prefix}-${p.id}`}
            aria-selected={active === p.id}
            tabIndex={active === p.id ? 0 : -1}
            onClick={() => setActive(p.id)}
            onKeyDown={(e) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault();
                const index =
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? panels.length - 1
                      : (i + (e.key === 'ArrowRight' ? 1 : panels.length - 1)) % panels.length;
                setActive(panels[index].id);
                (e.currentTarget.parentElement?.children[index] as HTMLButtonElement)?.focus();
              }
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div
          role="tabpanel"
          key={p.id}
          id={`${prefix}-${p.id}`}
          aria-labelledby={`${prefix}-${p.id}-tab`}
          hidden={active !== p.id}
          tabIndex={0}
        >
          {p.content}
        </div>
      ))}
    </section>
  );
}
