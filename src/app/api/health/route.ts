import { NextResponse } from 'next/server'
import { prisma, isDbAvailable } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  const startTime = Date.now()
  const checks: Record<string, any> = {}
  let isHealthy = true

  // 1. Database / Persistence Check
  if (isDbAvailable()) {
    try {
      const dbStart = Date.now()
      await prisma.$queryRaw`SELECT 1`
      checks.database = {
        status: 'UP',
        type: 'POSTGRESQL',
        latencyMs: Date.now() - dbStart,
      }
    } catch (err: any) {
      checks.database = {
        status: 'DOWN',
        type: 'POSTGRESQL',
        error: err.message,
      }
      isHealthy = false
    }
  } else {
    // Demo Disk Store Check
    try {
      const storeDir = path.join(process.cwd(), '.demo-store')
      const exists = fs.existsSync(storeDir)
      let fileCount = 0
      if (exists) {
        fileCount = fs.readdirSync(storeDir).length
      }
      checks.storage = {
        status: 'UP',
        type: 'DEMO_DISK_PERSISTENCE',
        storeExists: exists,
        persistedCollections: fileCount,
      }
    } catch (err: any) {
      checks.storage = {
        status: 'DEGRADED',
        error: err.message,
      }
    }
  }

  // 2. Memory & Process Metrics
  const mem = process.memoryUsage()
  checks.system = {
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
  }

  const durationMs = Date.now() - startTime

  return NextResponse.json(
    {
      status: isHealthy ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      responseTimeMs: durationMs,
      version: '1.0.0-pilot',
      checks,
    },
    { status: isHealthy ? 200 : 503 }
  )
}

