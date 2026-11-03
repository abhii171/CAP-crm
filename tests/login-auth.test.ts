import { findDemoUserForAuth } from '../src/services/user.service'
import bcrypt from 'bcryptjs'

function assert(condition: unknown, msg: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`)
}

async function runLoginAuthVerification() {
  console.log('🧪 Verifying Login Authentication for All Roles...\n')

  const testAccounts = [
    { label: 'Super Admin', id: 'ADM-001', pass: 'Admin@12345', role: 'ADMIN' },
    { label: 'Branch Manager', id: 'MGR-KKP-001', pass: 'Manager@123', role: 'MANAGER' },
    { label: 'Coach', id: 'CCH-KKP-001', pass: 'Coach@1234', role: 'COACH' },
  ]

  for (const acc of testAccounts) {
    const storeUser = findDemoUserForAuth(acc.id)
    assert(Boolean(storeUser), `Preset user ${acc.id} must exist in demo users store`)
    assert(storeUser!.isActive, `Preset user ${acc.id} must be active`)
    assert(storeUser!.role === acc.role, `Role must match for ${acc.id}`)
    assert(
      bcrypt.compareSync(acc.pass, storeUser!.passwordHash),
      `Hashed password must verify for ${acc.id}`
    )
    console.log(`  ✓ ${acc.label} (${acc.id}): Validated credentials against demo store`)
  }

  console.log('\n==================================================')
  console.log('All Role Credentials Successfully Verified! 🏏\n')
}

runLoginAuthVerification().catch((err) => {
  console.error(err)
  process.exit(1)
})
