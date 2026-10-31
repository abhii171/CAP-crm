'use client'

import React, { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, UserPlus, KeyRound, UserX, UserCheck, Shield, Building2, AlertCircle, CheckCircle2, Copy, X, Loader2, Filter } from 'lucide-react'

interface UserItem {
  id: string
  loginId: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'COACH'
  branchId: string | null
  branchName?: string
  branchCode?: string
  phone?: string | null
  isActive: boolean
  mustChangePassword: boolean
}

interface BranchItem {
  id: string
  code: string
  name: string
  type: 'OWNED' | 'FRANCHISE'
}

function AdminUsersContent() {
  const searchParams = useSearchParams()
  const initialBranch = searchParams.get('branchId') || ''

  const [users, setUsers] = useState<UserItem[]>([])
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBranch, setFilterBranch] = useState(initialBranch)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tempPasswordModal, setTempPasswordModal] = useState<{ user: UserItem; tempPass: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [role, setRole] = useState<'MANAGER' | 'COACH'>('COACH')
  const [branchId, setBranchId] = useState(initialBranch || 'branch-kkp')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const bId = searchParams.get('branchId')
    if (bId) {
      setFilterBranch(bId)
      setBranchId(bId)
    }
  }, [searchParams])

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches')
      const data = await res.json()
      if (data.success && Array.isArray(data.branches)) {
        setBranches(data.branches)
        if (data.branches.length > 0 && !filterBranch) {
          setBranchId((prev) => (data.branches.some((b: any) => b.id === prev) ? prev : data.branches[0].id))
        }
      }
    } catch {}
  }

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      if (data.success) {
        setUsers(data.users || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchBranches()
  }, [])

  const filteredUsers = users.filter((u) => {
    if (!filterBranch) return true
    return u.branchId === filterBranch
  })

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('Staff name is required')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role,
          branchId,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create user')
        setSubmitting(false)
        return
      }

      setIsModalOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setTempPasswordModal({ user: data.user, tempPass: data.temporaryPassword })
      fetchUsers()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async (user: UserItem) => {
    if (!confirm(`Reset temporary password for ${user.name} (${user.loginId})?`)) return

    try {
      const res = await fetch(`/api/users/${user.id}`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setTempPasswordModal({ user, tempPass: data.temporaryPassword })
        fetchUsers()
      } else {
        alert(data.error || 'Failed to reset password')
      }
    } catch {
      alert('Network error')
    }
  }

  const handleToggleActive = async (user: UserItem) => {
    const action = user.isActive ? 'deactivate' : 'reactivate'
    const promptMsg = user.isActive
      ? `Enter reason for deactivating ${user.name}:`
      : `Reactivate account for ${user.name}?`

    const reason = user.isActive ? prompt(promptMsg, 'Staff departed / reassigned') : 'Reactivated'
    if (user.isActive && !reason) return

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      const data = await res.json()
      if (data.success) {
        fetchUsers()
      } else {
        alert(data.error || 'Operation failed')
      }
    } catch {
      alert('Network error')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Admin Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight">
              Staff &amp; Role Management
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              System credentials, branch assignments, and secure deactivations.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>New Staff Member</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        {/* Branch Filter & Stats Bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap p-3.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)]">
          <div className="flex items-center gap-2 flex-wrap">
            <Building2 className="w-4 h-4 text-[var(--primary-600)] shrink-0" />
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Branch:</span>
            <select
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value)
                if (e.target.value) setBranchId(e.target.value)
              }}
              className="h-8 px-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-xs font-medium outline-none focus:border-[var(--primary-600)]"
            >
              <option value="">All Branches (All Staff)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>

            {filterBranch && (
              <button
                type="button"
                onClick={() => setFilterBranch('')}
                className="text-xs text-[var(--primary-600)] hover:underline ml-1 cursor-pointer font-medium"
              >
                Clear Filter
              </button>
            )}
          </div>

          <div className="text-xs text-[var(--text-muted)] font-medium">
            Showing <strong className="text-[var(--text)]">{filteredUsers.length}</strong> staff member{filteredUsers.length !== 1 ? 's' : ''}
            {filterBranch ? ` in ${branches.find((b) => b.id === filterBranch)?.name || 'this branch'}` : ' across academy'}
          </div>
        </div>

        {/* Table Card */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
          {filteredUsers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Building2 className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-40" />
              <div className="space-y-1">
                <p className="text-sm font-bold text-[var(--text)]">No staff members in this branch</p>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  This branch has no assigned managers or coaches yet. Members are not automatically added to new branches.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (filterBranch) setBranchId(filterBranch)
                  setIsModalOpen(true)
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Staff to {branches.find((b) => b.id === filterBranch)?.name || 'Branch'}</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Login ID</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Assigned Branch</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredUsers.map((u) => {
                    const roleBadge =
                      u.role === 'ADMIN'
                        ? 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                        : u.role === 'MANAGER'
                        ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                        : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'

                    return (
                      <tr key={u.id} className="hover:bg-[var(--surface-2)]/60 transition-colors">
                        <td className="py-3 px-4 font-medium text-[var(--text)]">
                          <div>{u.name}</div>
                          {u.phone && <div className="text-[11px] text-[var(--text-muted)] font-mono">{u.phone}</div>}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[var(--text)]">
                          {u.loginId}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${roleBadge}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">
                          {u.branchName || 'Global'}
                        </td>
                        <td className="py-3 px-4">
                          {u.isActive ? (
                            <span className="inline-flex items-center gap-1 text-[var(--success)] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[var(--danger)] font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" /> Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {u.role !== 'ADMIN' && (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleResetPassword(u)}
                                className="px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-[11px] font-medium flex items-center gap-1"
                                title="Generate temporary password"
                              >
                                <KeyRound className="w-3 h-3 text-[var(--accent-500)]" />
                                <span>Reset PW</span>
                              </button>
                              <button
                                onClick={() => handleToggleActive(u)}
                                className={`px-2 py-1 rounded border text-[11px] font-medium flex items-center gap-1 ${
                                  u.isActive
                                    ? 'border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger-bg)]'
                                    : 'border-[var(--success)]/30 text-[var(--success)] hover:bg-[var(--primary-50)]'
                                }`}
                              >
                                {u.isActive ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                                <span>{u.isActive ? 'Deactivate' : 'Reactivate'}</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Temporary Password Display Modal */}
      {tempPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-[var(--primary-50)] flex items-center justify-center text-[var(--primary-600)] shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-[var(--text)]">Single-Use Temporary Password</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Share these credentials securely with <strong>{tempPasswordModal.user.name}</strong>. The user will be required to change their password on first login.
                </p>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">Login ID:</span>
                <span className="font-mono font-bold text-[var(--text)]">{tempPasswordModal.user.loginId}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">Temporary Password:</span>
                <span className="font-mono font-bold text-[var(--primary-700)] bg-[var(--surface)] px-2 py-0.5 rounded border border-[var(--border)]">
                  {tempPasswordModal.tempPass}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => copyToClipboard(`Login ID: ${tempPasswordModal.user.loginId}\nPassword: ${tempPasswordModal.tempPass}`)}
                className="h-9 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied!' : 'Copy Credentials'}</span>
              </button>
              <button
                onClick={() => setTempPasswordModal(null)}
                className="h-9 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Staff Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text)]">Create Staff Member</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-md bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-2 text-xs text-[var(--danger)] font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Dravid"
                  required
                  className="w-full h-9 px-3 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Staff Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('COACH')}
                    className={`py-2 rounded-md border font-medium ${
                      role === 'COACH'
                        ? 'border-[var(--primary-600)] bg-[var(--surface-2)] font-bold text-[var(--text)]'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    Coach
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('MANAGER')}
                    className={`py-2 rounded-md border font-medium ${
                      role === 'MANAGER'
                        ? 'border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)] font-bold'
                        : 'border-[var(--border)]'
                    }`}
                  >
                    Branch Manager
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Assigned Branch
                </label>
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="w-full h-9 px-3 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                >
                  {branches.length === 0 ? (
                    <>
                      <option value="branch-kkp">CPA Kukatpally (Owned)</option>
                      <option value="branch-hbn">CPA Hitech City (Franchise)</option>
                    </>
                  ) : (
                    branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.type === 'OWNED' ? 'Owned' : 'Franchise'})
                      </option>
                    ))
                  )}
                </select>
                {role === 'COACH' && branchId === 'branch-hbn' && (
                  <p className="text-[10px] text-[var(--warning)] mt-1">
                    *Note: For Franchise branches, coach creation is restricted to Admin.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-9 px-3 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-3 rounded-md border border-[var(--border)] font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Issue Credentials</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminUsersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-600)]" />
        </div>
      }
    >
      <AdminUsersContent />
    </Suspense>
  )
}

