import { db } from "./db";
/** Atomic top-level JSON updates preserve point balances, other states and other account preferences. */
export async function setAccountPreference(
  userId: string,
  key: string,
  value: unknown,
  client: Pick<typeof db, "$executeRaw"> = db,
) {
  await client.$executeRaw`UPDATE "User" SET points=jsonb_set(COALESCE(points,'{}'::jsonb),ARRAY[${key}]::text[],${JSON.stringify(value)}::jsonb,true) WHERE id=${userId}`;
}
