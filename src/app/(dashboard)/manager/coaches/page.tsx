'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, UserPlus, KeyRound, UserX, UserCheck, Shield, AlertTriangle, Users, Copy, X, Loader2 } from 'lucide-react'

interface CoachItem {
  id: string
  loginId: string
  name: string
  phone?: string | null
  isActive: boolean
  mustChangePassword: boolean
}

export default function ManagerCoachesPage() {
  const [coaches, setCoaches] = useState<CoachItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: CoachItem; tempPass: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Manager's own branch details
  const [branchType, setBranchType] = useState<'OWNED' | 'FRANCHISE'>('OWNED')
  const [managerBranchId, setManagerBranchId] = useState('branch-kkp')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const fetchCoaches = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users?role=COACH')
      const data = await res.json()
      if (data.success) {
        setCoaches(data.users || [])
      }

      // Check current user's branch details from /api/auth/me
      const meRes = await fetch('/api/auth/me')
      const meData = await meRes.json()
      if (meData?.user?.branchId) {
        setManagerBranchId(meData.user.branchId)
        if (meData.user.branchId === 'branch-hbn') {
          setBranchType('FRANCHISE')
        } else {
          setBranchType('OWNED')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCoaches()
  }, [])

  const handleCreateCoach = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (branchType === 'FRANCHISE') {
      setFormError('Franchise branch managers have view-only access. Only Admin can create coaches.')
      return
    }

    if (!name.trim()) {
      setFormError('Coach name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: 'COACH',
          branchId: managerBranchId,
          phone: phone.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create coach')
        setSubmitting(false)
        return
      }

      setIsModalOpen(false)
      setName('')
      setPhone('')
      setTempPasswordModal({ user: data.user, tempPass: data.temporaryPassword })
      fetchCoaches()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async (coach: CoachItem) => {
    if (!confirm(`Reset temporary password for Coach ${coach.name}?`)) return

    try {
      const res = await fetch(`/api/users/${coach.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setTempPasswordModal({ user: coach, tempPass: data.temporaryPassword })
        fetchCoaches()
      } else {
        alert(data.error || 'Failed to reset password')
      }
    } catch {
      alert('Network error')
    }
  }

  const handleToggleActive = async (coach: CoachItem) => {
    const action = coach.isActive ? 'deactivate' : 'reactivate'
    const reason = coach.isActive ? prompt(`Reason for deactivating ${coach.name}:`, 'Coach left academy') : 'Reactivated'
    if (coach.isActive && !reason) return

    try {
      const res = await fetch(`/api/users/${coach.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const data = await res.json()
      if (data.success) {
        fetchCoaches()
      } else {
        alert(data.error || 'Operation failed')
      }
    } catch {
      alert('Network error')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/manager"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Manager Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight">
              Branch Coaching Staff
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Manage coaches assigned to your branch and oversee ground access.
            </p>
          </div>
        </div>

        {branchType === 'OWNED' ? (
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Coach</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--warning)] bg-[var(--accent-50)] px-3 py-1 rounded-full border border-[var(--warning)]/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Franchise View-Only</span>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {branchType === 'FRANCHISE' && (
          <div className="p-4 rounded-lg bg-[var(--accent-50)] border border-[var(--warning)]/30 text-xs text-[var(--warning)] font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Franchise Governance Rule:</strong> Coach recruitment and profile changes are managed globally by the central Academy Admin.
            </span>
          </div>
        )}

        {/* Coaches Table */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Coach</th>
                <th className="py-3 px-4">Login ID</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {coaches.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--surface-2)]/60 transition-colors">
                  <td className="py-3 px-4 font-semibold text-[var(--text)]">
                    {c.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-[var(--text)] font-semibold">
                    {c.loginId}
                  </td>
                  <td className="py-3 px-4 font-mono text-[var(--text-muted)]">
                    {c.phone || '—'}
                  </td>
                  <td className="py-3 px-4">
                    {c.isActive ? (
                      <span className="text-[var(--success)] font-medium">Active</span>
                    ) : (
                      <span className="text-[var(--danger)] font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {branchType === 'OWNED' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleResetPassword(c)}
                          className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-[11px] font-medium flex items-center gap-1"
                        >
                          <KeyRound className="w-3 h-3 text-[var(--accent-500)]" />
                          <span>Reset PW</span>
                        </button>
                        <button
                          onClick={() => handleToggleActive(c)}
                          className={`px-2 py-1 rounded border text-[11px] font-medium ${
                            c.isActive ? 'text-[var(--danger)] border-[var(--danger)]/30' : 'text-[var(--success)]'
                          }`}
                        >
                          {c.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Temporary Password Modal */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6">
            <h3 className="text-base font-bold text-[var(--text)]">Temporary Coach Password</h3>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Provide these credentials to <strong>{tempPasswordModal.user.name}</strong> for their initial login.
            </p>

            <div className="mt-4 p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Login ID:</span>
                <span className="font-mono font-bold">{tempPasswordModal.user.loginId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">Password:</span>
                <span className="font-mono font-bold text-[var(--primary-700)] bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--border)]">
                  {tempPasswordModal.tempPass}
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`ID: ${tempPasswordModal.user.loginId} / PW: ${tempPasswordModal.tempPass}`)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="h-9 px-3 rounded-md bg-[var(--primary-600)] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                onClick={() => setTempPasswordModal(null)}
                className="h-9 px-3 rounded-md border border-[var(--border)] text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Coach Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6">
            <div className="flex justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text)]">Add Coach to Branch</h2>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 rounded bg-[var(--danger-bg)] text-[var(--danger)] text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCoach} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Coach Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Anil Kumble"
                  required
                  className="w-full h-9 px-3 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-9 px-3 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-3 rounded border font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Add Coach</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

