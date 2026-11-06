import { setAccountPreference } from "@/lib/accountPreferences";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { filterQuery, filterCookie } from "@/lib/filterPreferences";
import { NextResponse } from "next/server";
export async function PUT(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== new URL(req.url).origin &&
    origin !== "https://" + req.headers.get("x-forwarded-host")
  )
    return new Response("Forbidden", { status: 403 });
  const b = await req.json().catch(() => null);
  if (
    !b ||
    !["ID", "CO"].includes(b.state) ||
    typeof b.query !== "string" ||
    b.query.length > 3000
  )
    return new Response("Invalid filters", { status: 400 });
  const query = filterQuery(b.query);
  const session = await auth();
  if ((b.owner??null)!==(session?.user?.id??null)) return new Response("Account changed",{status:409});
  if (session?.user?.id)
    await setAccountPreference(session.user.id, "_filters_" + b.state, query);
  const res = NextResponse.json({ ok: true });
  if (!session?.user?.id)
    res.cookies.set(filterCookie(b.state), query, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
      httpOnly: true,
    });
  return res;
}
