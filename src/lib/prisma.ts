import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient
  isDbDisabled?: boolean
}

export function isDbAvailable(): boolean {
  if (process.env.DEMO_MODE === 'true' || process.env.DEMO_MODE === '1' || globalForPrisma.isDbDisabled) {
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
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
