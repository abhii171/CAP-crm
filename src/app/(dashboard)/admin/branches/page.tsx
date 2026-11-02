'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Plus,
  Users,
  MapPin,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  X,
  Shield,
  Loader2,
  IndianRupee,
  Clock,
  TrendingUp,
  UserCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ExternalLink,
  BarChart3,
  Percent,
  Trash2,
  RotateCcw,
  Archive,
} from 'lucide-react'
import { formatPaise } from '@/lib/utils'

interface Branch {
  id: string
  code: string
  name: string
  type: 'OWNED' | 'FRANCHISE'
  city: string | null
  address: string | null
  studentSeq: number
  isActive: boolean
  staffCount?: number
  managerCount?: number
  coachCount?: number
  studentCount?: number
  batchCount?: number
  totalAdmissions?: number
  totalCollectedPaise?: number
  admissionFeeCollectedPaise?: number
  monthlyFeeCollectedPaise?: number
  outstandingPaise?: number
  collectionRate?: number
}

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [archivedBranches, setArchivedBranches] = useState<Branch[]>([])
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active')
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Deletion modal state
  const [deleteModalBranch, setDeleteModalBranch] = useState<Branch | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  // Toast notification state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => {
      setToast(null)
    }, 4500)
  }

  // Selected branch for the dedicated Performance Overview Modal
  const [overviewBranch, setOverviewBranch] = useState<Branch | null>(null)

  // Form State
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'OWNED' | 'FRANCHISE'>('OWNED')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  const fetchBranches = async () => {
    setLoading(true)
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch('/api/branches'),
        fetch('/api/branches?archived=true'),
      ])
      const activeData = await activeRes.json()
      const archivedData = await archivedRes.json()

      if (activeData.success) {
        setBranches(activeData.branches || [])
      }
      if (archivedData.success) {
        setArchivedBranches(archivedData.branches || [])
      }
    } catch {
      showToast('error', 'Failed to load branch records.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBranches()
  }, [])

  const handleConfirmDeleteBranch = async () => {
    if (!deleteModalBranch) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/branches/${deleteModalBranch.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Failed to delete branch')
        return
      }
      showToast('success', data.message || `Branch "${deleteModalBranch.name}" has been safely archived.`)
      setDeleteModalBranch(null)
      await fetchBranches()
    } catch {
      showToast('error', 'Network error while attempting to delete branch.')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleRestoreBranch = async (b: Branch) => {
    setRestoringId(b.id)
    try {
      const res = await fetch(`/api/branches/${b.id}/restore`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Failed to restore branch')
        return
      }
      showToast('success', data.message || `Branch "${b.name}" restored successfully.`)
      await fetchBranches()
    } catch {
      showToast('error', 'Network error while restoring branch.')
    } finally {
      setRestoringId(null)
    }
  }

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!code.trim() || !name.trim()) {
      setFormError('Branch Code and Branch Name are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          type,
          city: city.trim(),
          address: address.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create branch')
        setSubmitting(false)
        return
      }

      setIsModalOpen(false)
      setCode('')
      setName('')
      setCity('')
      setAddress('')
      fetchBranches()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--primary-600)]" />
              <span>Branch Administration</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Manage owned academy facilities, franchise branches, and review operational performance.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Branch</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="dashboard-container max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`p-3 rounded-md flex items-center justify-between text-xs font-semibold animate-in fade-in duration-200 border ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Section Tabs: Active Branches vs Archived Branches */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-[var(--primary-600)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Active Branches</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {branches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('archived')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'archived'
                  ? 'bg-[var(--primary-600)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archived</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'archived' ? 'bg-white/20 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {archivedBranches.length}
              </span>
            </button>
          </div>

          <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
            {activeTab === 'active' ? 'Showing active operational facilities' : 'Safely archived facilities (preserved history)'}
          </span>
        </div>

        {/* Loading Indicator */}
        {loading && (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-600)]" />
            <span>Loading branch records...</span>
          </div>
        )}

        {/* Tab 1: Active Branch Cards Grid */}
        {!loading && activeTab === 'active' && (
          <>
            {branches.length === 0 ? (
              <div className="p-8 text-center rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] space-y-2">
                <Building2 className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
                <h3 className="font-bold text-sm text-[var(--text)]">No active branches found</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Add a new branch facility using the button above.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {branches.map((b) => {
                  const isOwned = b.type === 'OWNED'
                  return (
                    <div
                      key={b.id}
                      className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between hover:border-[var(--primary-600)]/60 transition-all"
                    >
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
                              {b.code}
                            </span>
                            <h3 className="text-base font-bold text-[var(--text)] mt-1.5">{b.name}</h3>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                                isOwned
                                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                                  : 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                              }`}
                            >
                              {b.type}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
                            <span className="truncate">{b.address || b.city || 'No address registered'}</span>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="flex items-center gap-1.5 text-[var(--text)] font-semibold">
                              <Users className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
                              <span>{b.staffCount ?? 0} Staff Members</span>
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {b.studentCount ?? 0} Cadets · {b.batchCount ?? 0} Batches
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Bottom Action Strip: Operational status on left, Overview + Staff + Delete on right */}
                      <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs gap-2">
                        <span className="flex items-center gap-1.5 text-[var(--success)] font-medium">
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Operational</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          {/* OVERVIEW OPTION BUTTON */}
                          <button
                            onClick={() => setOverviewBranch(b)}
                            className="px-2 py-1 rounded-md bg-[var(--primary-50)] text-[var(--primary-700)] dark:bg-[var(--primary-900)]/40 dark:text-[var(--primary-300)] font-semibold border border-[var(--primary-600)]/30 hover:bg-[var(--primary-600)] hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                            title={`View Performance Overview for ${b.name}`}
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>Overview</span>
                          </button>

                          <Link
                            href={{ pathname: '/admin/users', query: { branchId: b.id } }}
                            className="font-semibold text-[var(--primary-600)] hover:underline flex items-center gap-1 px-1"
                          >
                            <span>Staff ({b.staffCount ?? 0})</span>
                          </Link>

                          {/* DELETE BRANCH BUTTON (ADMIN ONLY) */}
                          <button
                            type="button"
                            onClick={() => setDeleteModalBranch(b)}
                            className="p-1.5 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-colors cursor-pointer"
                            title={`Delete / Archive branch ${b.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Tab 2: Archived Branches Grid */}
        {!loading && activeTab === 'archived' && (
          <>
            {archivedBranches.length === 0 ? (
              <div className="p-8 text-center rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] space-y-2">
                <Archive className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-50" />
                <h3 className="font-bold text-sm text-[var(--text)]">No archived branches</h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Branches that you delete/archive will appear here and can be restored at any time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {archivedBranches.map((b) => (
                  <div
                    key={b.id}
                    className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-dashed border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between opacity-85 hover:opacity-100 transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
                            {b.code}
                          </span>
                          <h3 className="text-base font-bold text-[var(--text)] mt-1.5 flex items-center gap-1.5">
                            <span>{b.name}</span>
                          </h3>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
                          ARCHIVED
                        </span>
                      </div>

                      <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{b.address || b.city || 'No address registered'}</span>
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          <span>{b.staffCount ?? 0} Staff Members</span>
                          <span>{b.studentCount ?? 0} Cadets · {b.batchCount ?? 0} Batches</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs gap-2">
                      <span className="text-[11px] text-[var(--text-muted)] italic">
                        Inactive / Preserved
                      </span>

                      <button
                        type="button"
                        disabled={restoringId === b.id}
                        onClick={() => handleRestoreBranch(b)}
                        className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title={`Restore ${b.name}`}
                      >
                        {restoringId === b.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Restore Branch</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* ======================================================== */}
      {/* CONFIRM DELETE / ARCHIVE MODAL (ADMIN ONLY)              */}
      {/* ======================================================== */}
      {deleteModalBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-[var(--text)]">Delete Branch</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Confirm deactivating and safely archiving this branch facility.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalBranch(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Branch Facility</span>
                <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  {deleteModalBranch.code}
                </span>
              </div>
              <p className="font-bold text-sm text-[var(--text)]">{deleteModalBranch.name}</p>
              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                <span>{deleteModalBranch.staffCount ?? 0} Staff</span>
                <span>·</span>
                <span>{deleteModalBranch.studentCount ?? 0} Cadets</span>
                <span>·</span>
                <span>{deleteModalBranch.batchCount ?? 0} Batches</span>
              </div>
            </div>

            <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 text-xs space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>Safe Archival &amp; Data Integrity</span>
              </p>
              <p className="text-[11px] leading-relaxed">
                All historical business records, enquiries, students, coaches, attendance, and fee transactions will be safely preserved. The branch will be removed from active lists and can be restored at any time from the <strong>Archived</strong> tab.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalBranch(null)}
                className="h-9 px-3 rounded-md border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDeleteBranch}
                className="h-9 px-4 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Confirm Delete / Archive</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BRANCH PERFORMANCE OVERVIEW MODAL                        */}
      {/* ======================================================== */}
      {overviewBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[var(--border)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
                    {overviewBranch.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      overviewBranch.type === 'OWNED'
                        ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                        : 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                    }`}
                  >
                    {overviewBranch.type} FACILITY
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] mt-1.5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[var(--primary-600)]" />
                  <span>{overviewBranch.name}</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>{overviewBranch.address || overviewBranch.city || 'No street address specified'}</span>
                </p>
              </div>

              <button
                onClick={() => setOverviewBranch(null)}
                className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                title="Close Overview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Performance KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 1. Total Admissions */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Total Admissions</span>
                  <Users className="w-4 h-4 text-[var(--primary-600)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[var(--text)] tracking-tight">
                    {overviewBranch.totalAdmissions ?? overviewBranch.studentSeq ?? overviewBranch.studentCount ?? 0}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">Cadets</span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Active Enrolled</span>
                  <span className="font-bold text-[var(--success)]">
                    {overviewBranch.studentCount ?? 0} Cadets
                  </span>
                </div>
              </div>

              {/* 2. Total Fee Collections */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Fee Collection</span>
                  <IndianRupee className="w-4 h-4 text-[var(--success)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[var(--success)] tracking-tight">
                    {formatPaise(overviewBranch.totalCollectedPaise ?? 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Admission Fees</span>
                  <span className="font-semibold text-[var(--text)]">
                    {formatPaise(overviewBranch.admissionFeeCollectedPaise ?? 0)}
                  </span>
                </div>
              </div>

              {/* 3. Pending / Outstanding Dues */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Pending Dues</span>
                  <Clock className="w-4 h-4 text-[var(--warning)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-2xl font-black tracking-tight ${
                      (overviewBranch.outstandingPaise ?? 0) > 0
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--text)]'
                    }`}
                  >
                    {formatPaise(overviewBranch.outstandingPaise ?? 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Collection Rate</span>
                  <span
                    className={`font-bold ${
                      (overviewBranch.collectionRate ?? 100) >= 90
                        ? 'text-[var(--success)]'
                        : 'text-[var(--warning)]'
                    }`}
                  >
                    {overviewBranch.collectionRate ?? 100}%
                  </span>
                </div>
              </div>
            </div>

            {/* Operational Metrics Strip */}
            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                <span>Ground Operations &amp; Capacity</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Active Batches</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.batchCount ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Staff Members</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.staffCount ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Managers</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.managerCount ?? (overviewBranch.staffCount ? 1 : 0)}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Coaching Staff</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.coachCount ?? Math.max(0, (overviewBranch.staffCount ?? 0) - 1)}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={{ pathname: '/admin/students', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Cadets</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/batches', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Batches</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/users', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <UserCheck className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Staff</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/reports', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--primary-600)] flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Branch Reports</span>
                </Link>
              </div>

              <button
                onClick={() => setOverviewBranch(null)}
                className="px-4 py-1.5 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE NEW BRANCH MODAL                                  */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text)]">Create Academy Branch</h2>
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

            <form onSubmit={handleCreateBranch} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Code (2-5 Letters)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. GCH, BDN"
                  maxLength={5}
                  required
                  className="w-full h-9 px-3 text-xs font-mono uppercase rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)]"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Used for student IDs (e.g. GCH-000001) and receipt sequences.
                </p>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CPA Gachibowli Stadium"
                  required
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)]"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('OWNED')}
                    className={`py-2 px-3 rounded-md border text-center font-medium transition-all ${
                      type === 'OWNED'
                        ? 'border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
                    }`}
                  >
                    Owned Facility
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('FRANCHISE')}
                    className={`py-2 px-3 rounded-md border text-center font-medium transition-all ${
                      type === 'FRANCHISE'
                        ? 'border-[var(--primary-600)] bg-[var(--accent-50)] text-[var(--warning)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
                    }`}
                  >
                    Franchise Partner
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  City &amp; Address
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City (e.g. Hyderabad)"
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] mb-2"
                />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street / Ground Address"
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-3 rounded-md border border-[var(--border)] text-[var(--text)] font-medium hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Branch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
