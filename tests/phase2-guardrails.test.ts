import { isFeatureEnabled, setFeatureFlag, resetDemoFlags, listFeatureFlags } from '../src/modules/phase2/flags/feature-flags.service'
import * as fs from 'fs'
import * as path from 'path'

console.log('🧪 Running Step 2.0 Phase 2 Guardrails & Isolation Automated Tests...')

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${testName}`)
  } else {
    failed++
    console.error(`  ✗ FAIL: ${testName}`)
  }
}

async function runGuardrailsTests() {
  resetDemoFlags()

  // ── Test Suite 1: Feature Flags Default & Scoping ────────────────────────
  // 1. All flags default to disabled (false)
  const enquiriesDefault = await isFeatureEnabled('p2.enquiries')
  const notificationsDefault = await isFeatureEnabled('p2.notifications')
  const dashboardsDefault = await isFeatureEnabled('p2.dashboards')
  const contentDefault = await isFeatureEnabled('p2.content')

  assert(
    enquiriesDefault === false &&
      notificationsDefault === false &&
      dashboardsDefault === false &&
      contentDefault === false,
    'All Phase 2 feature flags default to disabled (false)'
  )

  // 2. Per-branch rollout override (A-12)
  await setFeatureFlag('p2.enquiries', 'branch-kkp', true)
  const kkpEnabled = await isFeatureEnabled('p2.enquiries', 'branch-kkp')
  const hbnEnabled = await isFeatureEnabled('p2.enquiries', 'branch-hbn')
  const globalEnabled = await isFeatureEnabled('p2.enquiries')

  assert(
    kkpEnabled === true && hbnEnabled === false && globalEnabled === false,
    'Branch-specific flag overrides global setting without leaking across branches'
  )

  // 3. Global toggle with branch-level kill-switch
  await setFeatureFlag('p2.dashboards', 'global', true)
  await setFeatureFlag('p2.dashboards', 'branch-hbn', false)

  const kkpDashboard = await isFeatureEnabled('p2.dashboards', 'branch-kkp')
  const hbnDashboard = await isFeatureEnabled('p2.dashboards', 'branch-hbn')

  assert(
    kkpDashboard === true && hbnDashboard === false,
    'Branch-specific kill-switch can disable a globally enabled flag'
  )

  // ── Test Suite 2: Schema Guard (Phase 1 Baseline Protection) ─────────────
  const schemaPath = path.resolve(__dirname, '../prisma/schema.prisma')
  const schemaContent = fs.readFileSync(schemaPath, 'utf8')

  const expectedPhase1Models = [
    'model Branch',
    'model User',
    'model AuthSession',
    'model PasswordResetToken',
    'model Guardian',
    'model ConsentRecord',
    'model Student',
    'model Batch',
    'model BatchCoach',
    'model Enrollment',
    'model Session',
    'model Attendance',
    'model FeePlan',
    'model StudentFeePlan',
    'model FeeDue',
    'model Payment',
    'model PaymentAllocation',
    'model ReceiptCounter',
    'model Receipt',
    'model DailyClose',
    'model PaymentLink',
    'model GatewayEvent',
    'model MessageTemplate',
    'model Notice',
    'model Message',
    'model AuditLog',
  ]

  const allModelsPresent = expectedPhase1Models.every((model) => schemaContent.includes(model))
  assert(allModelsPresent, 'All 26 Phase 1 models are strictly preserved in schema.prisma')

  const featureFlagModelPresent = schemaContent.includes('model FeatureFlag')
  assert(featureFlagModelPresent, 'Additive FeatureFlag model is present in schema.prisma')

  // ── Test Suite 3: Code Isolation Guard (A-01, A-02) ──────────────────────
  // Phase 1 modules must never import from Phase 2
  const srcDir = path.resolve(__dirname, '../src')
  const phase1Files: string[] = []

  function collectPhase1Files(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Exclude Phase 2 module directory and Phase 2 routes
        const isPhase2Dir =
          entry.name === 'phase2' ||
          entry.name === '.next' ||
          fullPath.includes('src\\app\\api\\public') ||
          fullPath.includes('src/app/api/public') ||
          fullPath.includes('src\\app\\api\\enquiries') ||
          fullPath.includes('src/app/api/enquiries') ||
          fullPath.includes('src\\app\\api\\dashboard') ||
          fullPath.includes('src/app/api/dashboard') ||
          fullPath.includes('trial-guests') ||
          fullPath.includes('notifications')
        if (!isPhase2Dir) {
          collectPhase1Files(fullPath)
        }
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        phase1Files.push(fullPath)
      }
    }
  }

  collectPhase1Files(srcDir)

  let illegalImportCount = 0
  for (const file of phase1Files) {
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes('/phase2') || content.includes('@/modules/phase2')) {
      illegalImportCount++
      console.error(`  ✗ Illegal import of Phase 2 in Phase 1 file: ${file}`)
    }
  }

  assert(
    illegalImportCount === 0,
    `Zero Phase 1 files import from Phase 2 (${phase1Files.length} Phase 1 source files scanned)`
  )

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n==================================================')
  console.log(`Phase 2 Guardrails Test Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    process.exit(1)
  }
}

runGuardrailsTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

