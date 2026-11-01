import { PrismaClient } from '@prisma/client';

// one client per server process (avoids exhausting connections during dev hot reloads)
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = db;
