import NextAuth, { type DefaultSession } from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Residency } from '@prisma/client';
import { db } from '@/lib/db';

declare module 'next-auth' {
  interface Session {
    user: { id: string; residency: Residency } & DefaultSession['user'];
  }
}

const FROM = process.env.EMAIL_FROM ?? 'DrawOdds Idaho <onboarding@resend.dev>';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'database' },
  pages: { signIn: '/login', verifyRequest: '/login?sent=1' },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: FROM,
      async sendVerificationRequest({ identifier, url }) {
        const key = process.env.AUTH_RESEND_KEY;
        if (!key) {
          // dev / first deploy without email configured: the link goes to the server log
          console.warn(`[auth] AUTH_RESEND_KEY not set. Sign-in link for ${identifier}: ${url}`);
          return;
        }
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: FROM,
            to: identifier,
            subject: 'Sign in to DrawOdds Idaho',
            text: `Sign in to DrawOdds Idaho:\n\n${url}\n\nThis link expires in 24 hours. If you didn't ask for it, ignore this email.`,
            html: `<p>Sign in to DrawOdds Idaho:</p><p><a href="${url}">Sign in</a></p><p style="color:#666">This link expires in 24 hours. If you didn't ask for it, ignore this email.</p>`,
          }),
        });
        if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.residency = (user as unknown as { residency: Residency }).residency ?? 'RESIDENT';
      return session;
    },
  },
});
