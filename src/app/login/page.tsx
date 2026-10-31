'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, User, Lock, AlertCircle, CheckCircle2, ArrowRight, Loader2, Sparkles } from 'lucide-react'

interface PresetAccount {
  label: string
  role: string
  badgeColor: string
  identifier: string
  secret: string
  description: string
}

const PRESETS: PresetAccount[] = [
  {
    label: 'Super Admin',
    role: 'ADMIN',
    badgeColor: 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/20',
    identifier: 'ADM-001',
    secret: 'Admin@12345',
    description: 'System owner · All branches overview & governance',
  },
  {
    label: 'Branch Manager',
    role: 'MANAGER',
    badgeColor: 'bg-[var(--primary-50)] text-[var(--primary-600)] border-[var(--primary-600)]/20',
    identifier: 'MGR-KKP-001',
    secret: 'Manager@123',
    description: 'Kukatpally branch · Students, fees, daily close',
  },
  {
    label: 'Coach',
    role: 'COACH',
    badgeColor: 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]',
    identifier: 'CCH-KKP-001',
    secret: 'Coach@1234',
    description: 'Arjun Sharma · Today sessions & mobile attendance',
  },
]

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('ADM-001')
  const [password, setPassword] = useState('Admin@12345')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const handleSelectPreset = (preset: PresetAccount) => {
    setIdentifier(preset.identifier)
    setPassword(preset.secret)
    setErrorMessage(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!identifier.trim()) {
      setErrorMessage('Please enter your Login ID or Email')
      return
    }
    if (!password) {
      setErrorMessage('Please enter your password')
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Login failed. Please check your credentials.')
        setIsLoading(false)
        return
      }

      setSuccessMessage(`Welcome, ${data.user.name}! Redirecting...`)
      setTimeout(() => {
        router.push(data.redirectTo || '/')
        router.refresh()
      }, 350)
    } catch {
      setErrorMessage('Network connection error. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--bg)] text-[var(--text)]">
      {/* Top Brand Bar */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--primary-600)] flex items-center justify-center text-white font-bold text-lg shadow-sm">
            CPA
          </div>
          <div>
            <span className="font-semibold text-base tracking-tight text-[var(--text)] block leading-tight">
              CPA Cricket Academy
            </span>
            <span className="text-xs text-[var(--text-muted)] font-medium">
              Enterprise Multi-Branch CRM
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-50)] text-[var(--warning)] border border-[var(--warning)]/30">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent-500)]" /> Demo Environment
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] p-6 sm:p-8 shadow-sm">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
                Sign in to your account
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1.5">
                Enter your system-issued credentials to continue.
              </p>
            </div>

            {/* Demo Quick-Presets */}
            <div className="mb-6 p-3.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  1-Click Demo Accounts
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">Select to test role</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => {
                  const isSelected = identifier === p.identifier
                  return (
                    <button
                      key={p.role}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={`text-left p-2.5 rounded-md border transition-all text-xs font-medium ${
                        isSelected
                          ? 'border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)] shadow-xs'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--text)]'
                      }`}
                    >
                      <div className="font-semibold truncate">{p.label}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate font-mono mt-0.5">
                        {p.identifier}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Error / Alert banner */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-lg bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-2.5 text-sm text-[var(--danger)] animate-in fade-in duration-150">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs sm:text-sm font-medium">{errorMessage}</div>
              </div>
            )}

            {/* Success banner */}
            {successMessage && (
              <div className="mb-5 p-3.5 rounded-lg bg-[var(--primary-50)] border border-[var(--primary-600)]/30 flex items-center gap-2.5 text-sm text-[var(--primary-700)]">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-[var(--primary-600)]" />
                <div className="text-xs sm:text-sm font-medium">{successMessage}</div>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="identifier"
                  className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5"
                >
                  Login ID or Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="e.g. ADM-001 or admin@cpacricket.in"
                    disabled={isLoading}
                    autoComplete="username"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)] focus:ring-2 focus:ring-[var(--primary-600)]/20 transition-all font-mono"
                  />
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Admins use email or ID; Managers &amp; Coaches use system Login ID.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--text-muted)]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoading}
                    autoComplete="current-password"
                    required
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)] focus:ring-2 focus:ring-[var(--primary-600)]/20 transition-all"
                  />
                </div>
              </div>

              {/* Submit button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 px-4 rounded-[var(--radius-sm)] bg-[var(--primary-600)] hover:bg-[var(--primary-700)] active:scale-[0.99] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Security note */}
            <div className="mt-6 pt-5 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                Role-scoped &amp; brute-force protected
              </span>
              <span>v1.0 Demo</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[var(--text-muted)] border-t border-[var(--border)] bg-[var(--surface)]">
        CPA Cricket Academy CRM · Built in accordance with CPA Design Guidelines (No Blue)
      </footer>
    </div>
  )
}
