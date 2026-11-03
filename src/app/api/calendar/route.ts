import { icsFor, upcomingWindows } from '@/lib/applyInfo';

/** Every Idaho application window in the next year as a calendar file, with a 3-day reminder on each. */
export async function GET() {
  return new Response(icsFor(upcomingWindows()), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="idaho-hunt-deadlines.ics"' },
  });
}
