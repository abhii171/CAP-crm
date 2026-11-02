import { prisma, isDbAvailable, markDbOffline } from '@/lib/prisma'

export type FeatureFlagKey =
  | 'p2.enquiries'
  | 'p2.notifications'
  | 'p2.dashboards'
  | 'p2.content'

export interface FeatureFlagRecord {
  id: string
  key: FeatureFlagKey
  scopeKey: string // 'global' or a specific branchId
  enabled: boolean
  updatedByUserId?: string | null
  updatedAt: string
}

// In-memory store for fallback / offline testing
// In dev / demo mode, Phase 2 features default to enabled so staff can interact with pipeline & boards
const demoFlags: Map<string, FeatureFlagRecord> = new Map([
  ['p2.enquiries:global', { id: 'ff-1', key: 'p2.enquiries', scopeKey: 'global', enabled: true, updatedAt: new Date().toISOString() }],
  ['p2.notifications:global', { id: 'ff-2', key: 'p2.notifications', scopeKey: 'global', enabled: true, updatedAt: new Date().toISOString() }],
  ['p2.dashboards:global', { id: 'ff-3', key: 'p2.dashboards', scopeKey: 'global', enabled: true, updatedAt: new Date().toISOString() }],
  ['p2.content:global', { id: 'ff-4', key: 'p2.content', scopeKey: 'global', enabled: true, updatedAt: new Date().toISOString() }],
])

function makeKey(flagKey: FeatureFlagKey, scopeKey: string): string {
  return `${flagKey}:${scopeKey}`
}

/**
 * Checks whether a Phase 2 feature flag is enabled.
 * Resolution precedence (A-12):
 * 1. Branch-specific override (`scopeKey = branchId`)
 * 2. Global setting (`scopeKey = 'global'`)
 * 3. Default: false
 */
export async function isFeatureEnabled(
  flagKey: FeatureFlagKey,
  branchId?: string | null
): Promise<boolean> {
  // 1. Check branch-specific override if branchId is provided
  if (branchId) {
    if (isDbAvailable()) {
      try {
        const branchFlag = await prisma.featureFlag.findUnique({
          where: { key_scopeKey: { key: flagKey, scopeKey: branchId } },
        })
        if (branchFlag) {
          return branchFlag.enabled
        }
      } catch {
        markDbOffline()
      }
    }

    const demoBranchFlag = demoFlags.get(makeKey(flagKey, branchId))
    if (demoBranchFlag) {
      return demoBranchFlag.enabled
    }
  }

  // 2. Check global setting
  if (isDbAvailable()) {
    try {
      const globalFlag = await prisma.featureFlag.findUnique({
        where: { key_scopeKey: { key: flagKey, scopeKey: 'global' } },
      })
      if (globalFlag) {
        return globalFlag.enabled
      }
    } catch {
      markDbOffline()
    }
  }

  const demoGlobalFlag = demoFlags.get(makeKey(flagKey, 'global'))
  if (demoGlobalFlag) {
    return demoGlobalFlag.enabled
  }

  // 3. Default: strictly disabled
  return false
}

/**
 * Sets or updates a feature flag's state for a given scope ('global' or a branchId).
 */
export async function setFeatureFlag(
  flagKey: FeatureFlagKey,
  scopeKey: string,
  enabled: boolean,
  updatedByUserId?: string
): Promise<FeatureFlagRecord> {
  const now = new Date().toISOString()
  const mapKey = makeKey(flagKey, scopeKey)

  const record: FeatureFlagRecord = {
    id: demoFlags.get(mapKey)?.id || `ff-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    key: flagKey,
    scopeKey,
    enabled,
    updatedByUserId: updatedByUserId || null,
    updatedAt: now,
  }

  demoFlags.set(mapKey, record)

  if (isDbAvailable()) {
    try {
      await prisma.featureFlag.upsert({
        where: { key_scopeKey: { key: flagKey, scopeKey } },
        update: {
          enabled,
          updatedByUserId: updatedByUserId || null,
        },
        create: {
          key: flagKey,
          scopeKey,
          enabled,
          updatedByUserId: updatedByUserId || null,
        },
      })
    } catch {
      markDbOffline()
    }
  }

  return record
}

/**
 * Lists all active feature flags across scopes.
 */
export async function listFeatureFlags(): Promise<FeatureFlagRecord[]> {
  if (isDbAvailable()) {
    try {
      const dbFlags = await prisma.featureFlag.findMany({
        orderBy: [{ key: 'asc' }, { scopeKey: 'asc' }],
      })
      if (dbFlags.length > 0) {
        return dbFlags.map((f) => ({
          id: f.id,
          key: f.key as FeatureFlagKey,
          scopeKey: f.scopeKey,
          enabled: f.enabled,
          updatedByUserId: f.updatedByUserId,
          updatedAt: f.updatedAt.toISOString(),
        }))
      }
    } catch {
      markDbOffline()
    }
  }

  return Array.from(demoFlags.values())
}

/**
 * Resets demo feature flags to default state (all disabled). Useful in tests.
 */
export function resetDemoFlags(): void {
  demoFlags.clear()
  demoFlags.set('p2.enquiries:global', { id: 'ff-1', key: 'p2.enquiries', scopeKey: 'global', enabled: false, updatedAt: new Date().toISOString() })
  demoFlags.set('p2.notifications:global', { id: 'ff-2', key: 'p2.notifications', scopeKey: 'global', enabled: false, updatedAt: new Date().toISOString() })
  demoFlags.set('p2.dashboards:global', { id: 'ff-3', key: 'p2.dashboards', scopeKey: 'global', enabled: false, updatedAt: new Date().toISOString() })
  demoFlags.set('p2.content:global', { id: 'ff-4', key: 'p2.content', scopeKey: 'global', enabled: false, updatedAt: new Date().toISOString() })
}

