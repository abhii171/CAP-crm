import { PrismaClient } from '@prisma/client'

// Prioritize NEON_DATABASE_URL if configured, otherwise fall back to DATABASE_URL
const activeDatabaseUrl =
  process.env.NEON_DATABASE_URL ||
  process.env.DATABASE_URL ||
  ''

if (process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient
  isDbDisabled?: boolean
}

export function isDbAvailable(): boolean {
  if (process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1' || globalForPrisma.isDbDisabled) {
    return false
  }
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
  if (!url || url.trim() === '') {
    return false
  }
  if (process.env.NODE_ENV === 'production' && url.includes('localhost:5432')) {
    return false
  }
  return true
}

export function markDbOffline(): void {
  globalForPrisma.isDbDisabled = true
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: activeDatabaseUrl
      ? {
          db: {
            url: activeDatabaseUrl,
          },
        }
      : undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
