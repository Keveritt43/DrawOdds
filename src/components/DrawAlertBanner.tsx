import Link from 'next/link';
import { drawAlerts, alertLead } from '@/lib/drawDeadlines';
import { md } from '@/lib/applyInfo';

const day = (d: Date) => md(d.toISOString().slice(0, 10));

/** Home page: any draw opening within 4 weeks, or open now with a countdown to its close. */
export function DrawAlertBanner({ now = new Date() }: { now?: Date }) {
  const alerts = drawAlerts(now);
  if (!alerts.length) return null;
  return (
    <section className="draw-alerts" aria-label="Application deadlines">
      <div className="inner">
        {alerts.map((a) => (
          <p key={`${a.what}-${a.start.toISOString()}`} className={`draw-alert ${a.open ? 'open' : 'soon'}`}>
            <span className="da-lead">{alertLead(a)}</span>
            <span className="da-what"><b>{a.what}</b> · {day(a.start)} – {day(a.end)}</span>
            <span className="da-links"><Link href={a.href}>See the hunts</Link> · <a href={a.apply} target="_blank" rel="noopener">Apply at {a.applyLabel}</a></span>
          </p>
        ))}
      </div>
    </section>
  );
}
