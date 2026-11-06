import { auth } from "@/auth";
import { db } from "./db";
import { cookies } from "next/headers";
import { filterCookie, filterQuery } from "./filterPreferences";
export async function savedFilters(state: string) {
  const session = await auth();
  if (session?.user?.id) {
    const u = await db.user.findUnique({
      where: { id: session.user.id },
      select: { points: true },
    });
    return filterQuery(
      (u?.points as Record<string, unknown> | null)?.["_filters_" + state],
    );
  }
  return filterQuery((await cookies()).get(filterCookie(state))?.value);
}
