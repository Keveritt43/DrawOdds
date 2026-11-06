import { setAccountPreference } from "@/lib/accountPreferences";
import { auth } from "@/auth";
import { db } from "@/lib/db";
export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return new Response("Sign in", { status: 401 });
  const u = await db.user.findUnique({
    where: { id: s.user.id },
    select: { points: true },
  });
  return Response.json(
    { codes: (u?.points as Record<string, unknown> | null)?._plan_CO ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function PUT(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== "https://" + req.headers.get("x-forwarded-host")
  )
    return new Response("Forbidden", { status: 403 });
  const s = await auth();
  if (!s?.user?.id) return new Response("Sign in", { status: 401 });
  const b = await req.json().catch(() => null);
  if (
    !Array.isArray(b?.codes) ||
    b.codes.length > 12 ||
    b.codes.some(
      (c: unknown) =>
        typeof c !== "string" || !/^CO:[DEA][MFEP]\d{3}[A-Z0-9]\d[A-Z]$/.test(c),
    )
  )
    return new Response("Invalid plan", { status: 400 });
  await setAccountPreference(s.user.id, "_plan_CO", b.codes);
  return Response.json({ ok: true });
}
