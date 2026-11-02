'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { startSync } from '@/lib/run-sync';

const STEPS = new Set(['odds', 'harvest', 'general', 'gis', 'land', 'hunts', 'summary']);

export async function runSyncNow(formData: FormData) {
  const session = await auth();
  const admins = (process.env.ADMIN_EMAILS ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (!session?.user?.email || !admins.includes(session.user.email.toLowerCase())) return;
  const steps = String(formData.get('steps') ?? '').split(/\s+/).filter((s) => STEPS.has(s));
  startSync(steps);
  revalidatePath('/admin');
}
