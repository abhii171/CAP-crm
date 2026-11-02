'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  Phone,
  User,
  AlertCircle,
  ChevronRight,
  ArrowRight,
  X,
  CheckCircle2,
  Building2,
} from 'lucide-react'
import { EnquiryItem } from './enquiry-list-view'

export const BOARD_STAGES = [
  { key: 'NEW', label: 'New Enquiries', badge: 'border-neutral-500/30 text-neutral-300 bg-neutral-800/40' },
  { key: 'CONTACTED', label: 'Contacted', badge: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
  { key: 'TRIAL_SCHEDULED', label: 'Trial Scheduled', badge: 'border-emerald-600/40 text-emerald-300 bg-emerald-950/30' },
  { key: 'TRIAL_DONE', label: 'Trial Attended', badge: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/15' },
  { key: 'CONVERTED', label: 'Converted Cadets', badge: 'border-green-500/50 text-green-400 bg-green-500/20' },
  { key: 'LOST', label: 'Lost / Closed', badge: 'border-rose-500/40 text-rose-400 bg-rose-500/10' },
]

export const LOST_REASONS = [
  { id: 'lr-price', label: 'Fees / price too high' },
  { id: 'lr-location', label: 'Location or distance too far' },
  { id: 'lr-timing', label: 'Batch timing does not suit school schedule' },
  { id: 'lr-joined-elsewhere', label: 'Joined another cricket academy' },
  { id: 'lr-not-interested', label: 'Child or parent not interested' },
  { id: 'lr-no-response', label: 'Unreachable / no response after multiple attempts' },
  { id: 'lr-duplicate', label: 'Duplicate record / merged into existing cadet' },
  { id: 'lr-other', label: 'Other (see notes)' },
]

// Valid transitions from pipeline.service.ts
const ALLOWED_TARGETS: Record<string, string[]> = {
  NEW: ['CONTACTED', 'TRIAL_SCHEDULED', 'LOST'],
  CONTACTED: ['TRIAL_SCHEDULED', 'LOST', 'NEW'],
  TRIAL_SCHEDULED: ['TRIAL_DONE', 'CONTACTED', 'LOST'],
  TRIAL_DONE: ['CONVERTED', 'CONTACTED', 'LOST'],
  LOST: ['NEW', 'CONTACTED'],
  CONVERTED: [],
}

interface BranchMeta {
  id: string
  name: string
  code?: string
}

interface EnquiryBoardViewProps {
  enquiries: EnquiryItem[]
  loading?: boolean
  baseDetailUrl?: string
  branches?: BranchMeta[]
  showBranch?: boolean
  onRefresh?: () => void
}

export function EnquiryBoardView({
  enquiries,
  loading = false,
  baseDetailUrl = '/manager/enquiries',
  branches = [],
  showBranch = false,
  onRefresh,
}: EnquiryBoardViewProps) {
  // Map branch id to name
  const branchMap = React.useMemo(() => {
    const map = new Map<string, string>()
    branches.forEach((b) => map.set(b.id, b.name || b.code || b.id))
    return map
  }, [branches])

  // Mobile active column tab
  const [activeMobileStage, setActiveMobileStage] = useState('NEW')

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Lost Modal State
  const [lostTarget, setLostTarget] = useState<EnquiryItem | null>(null)
  const [lostReasonId, setLostReasonId] = useState(LOST_REASONS[0].id)
  const [lostNote, setLostNote] = useState('')
  const [submittingLost, setSubmittingLost] = useState(false)

  // Transitioning loader ID
  const [transitioningId, setTransitioningId] = useState<string | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 4500)
  }

  // Handle stage transition
  const handleTransition = async (
    enquiry: EnquiryItem,
    toStatus: string,
    lostData?: { lostReasonId: string; lostNote?: string }
  ) => {
    // Check if transition is valid
    const allowed = ALLOWED_TARGETS[enquiry.status] || []
    if (!allowed.includes(toStatus)) {
      showToast(
        `Invalid stage move: cannot transition from ${enquiry.status} to ${toStatus}.`,
        'error'
      )
      return
    }

    if (toStatus === 'LOST' && !lostData) {
      setLostTarget(enquiry)
      return
    }

    setTransitioningId(enquiry.id)

    try {
      const res = await fetch(`/api/enquiries/${enquiry.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus,
          lostReasonId: lostData?.lostReasonId,
          lostNote: lostData?.lostNote,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update stage')
      }

      showToast(`Enquiry moved to ${toStatus.replace(/_/g, ' ')}`, 'success')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setTransitioningId(null)
    }
  }

  const handleConfirmLost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lostTarget) return

    setSubmittingLost(true)
    try {
      await handleTransition(lostTarget, 'LOST', {
        lostReasonId,
        lostNote: lostNote.trim() || undefined,
      })
      setLostTarget(null)
      setLostNote('')
    } finally {
      setSubmittingLost(false)
    }
  }

  // Group items by stage
  const grouped = BOARD_STAGES.reduce<Record<string, EnquiryItem[]>>((acc, s) => {
    acc[s.key] = enquiries.filter((e) => e.status === s.key)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-lg border shadow-lg text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom-2 ${
            toast.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/50 text-rose-200'
              : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-[var(--text-muted)] hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mobile Stage Switcher Tabs */}
      <div className="md:hidden flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1">
        {BOARD_STAGES.map((s) => {
          const count = grouped[s.key]?.length || 0
          const isActive = activeMobileStage === s.key
          return (
            <button
              key={s.key}
              onClick={() => setActiveMobileStage(s.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-500 font-semibold'
                  : 'bg-[var(--surface-2)] text-[var(--text-muted)] border-[var(--border)]'
              }`}
            >
              {s.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Desktop Board Grid / Mobile Stage List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-96 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-3 animate-pulse"
            >
              <div className="h-6 bg-[var(--surface-2)] rounded" />
              <div className="h-20 bg-[var(--surface-2)] rounded" />
              <div className="h-20 bg-[var(--surface-2)] rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {BOARD_STAGES.map((col) => {
            const items = grouped[col.key] || []
            const isHiddenOnMobile = activeMobileStage !== col.key

            return (
              <div
                key={col.key}
                className={`flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-lg min-h-[460px] max-h-[780px] overflow-hidden ${
                  isHiddenOnMobile ? 'hidden md:flex' : 'flex'
                }`}
              >
                {/* Column Header */}
                <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-2)]/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-[var(--text)]">{col.label}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--surface)] border border-[var(--border)] text-[var(--text)]">
                    {items.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 p-2.5 overflow-y-auto space-y-2.5">
                  {items.length === 0 ? (
                    <div className="py-12 text-center text-[var(--text-muted)] text-xs italic">
                      No leads in this stage
                    </div>
                  ) : (
                    items.map((item) => {
                      const allowedTargets = ALLOWED_TARGETS[item.status] || []
                      const isOverdue =
                        item.nextFollowUpAt &&
                        new Date(item.nextFollowUpAt).getTime() < Date.now() &&
                        item.status !== 'CONVERTED' &&
                        item.status !== 'LOST'
                      const isDueToday =
                        item.nextFollowUpAt &&
                        new Date(item.nextFollowUpAt).toDateString() === new Date().toDateString()

                      const isMoving = transitioningId === item.id

                      return (
                        <div
                          key={item.id}
                          className="bg-[var(--surface-2)] border border-[var(--border)] hover:border-emerald-500/50 rounded-md p-3 space-y-2 transition-all shadow-xs"
                        >
                          {/* Name and Age */}
                          <div className="flex items-start justify-between gap-1">
                            <Link
                              href={`${baseDetailUrl}/${item.id}` as any}
                              className="font-semibold text-xs text-[var(--text)] hover:text-emerald-400 leading-tight"
                            >
                              {item.childName}
                            </Link>
                            {item.childAgeYears && (
                              <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                                {item.childAgeYears}y
                              </span>
                            )}
                          </div>

                          {/* Contact & Source */}
                          <div className="text-[11px] text-[var(--text-muted)] space-y-1">
                            <div className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 opacity-70" />
                              <span>{item.phone}</span>
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                                {item.source?.replace(/_/g, ' ')}
                              </span>
                              <span>
                                {new Date(item.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                            </div>
                            {showBranch && (
                              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium pt-0.5">
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  {branchMap.get(item.branchId) || item.branchName || item.branchId}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Follow-up Chip */}
                          {item.nextFollowUpAt && (
                            <div
                              className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${
                                isOverdue
                                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 font-semibold'
                                  : isDueToday
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 font-medium'
                                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)]'
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              <span>
                                {isOverdue
                                  ? 'Overdue: '
                                  : isDueToday
                                  ? 'Due today: '
                                  : 'Follow-up: '}
                                {new Date(item.nextFollowUpAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                })}
                              </span>
                            </div>
                          )}

                          {/* Quick Stage Transitions */}
                          {allowedTargets.length > 0 && (
                            <div className="pt-1.5 border-t border-[var(--border)] flex flex-wrap items-center gap-1">
                              {allowedTargets.map((targetKey) => {
                                const targetCol = BOARD_STAGES.find((s) => s.key === targetKey)
                                const isLostAction = targetKey === 'LOST'

                                return (
                                  <button
                                    key={targetKey}
                                    disabled={isMoving}
                                    onClick={() => handleTransition(item, targetKey)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-50 ${
                                      isLostAction
                                        ? 'text-rose-400 hover:bg-rose-500/10 border border-rose-500/20'
                                        : 'text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20'
                                    }`}
                                  >
                                    {isMoving
                                      ? '...'
                                      : isLostAction
                                      ? 'Mark Lost'
                                      : `Move to ${targetCol?.label.split(' ')[0] || targetKey}`}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Lost Reason Modal */}
      {lostTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Mark Enquiry as Lost
              </h3>
              <button
                onClick={() => setLostTarget(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              Closing lead for <span className="font-semibold text-[var(--text)]">{lostTarget.childName}</span> ({lostTarget.phone}). Please specify why this lead did not convert.
            </p>

            <form onSubmit={handleConfirmLost} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Reason *
                </label>
                <select
                  value={lostReasonId}
                  onChange={(e) => setLostReasonId(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-rose-500"
                >
                  {LOST_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Note / Comments (Optional)
                </label>
                <textarea
                  rows={2}
                  value={lostNote}
                  onChange={(e) => setLostNote(e.target.value)}
                  placeholder="Additional context from parent discussion..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLostTarget(null)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingLost}
                  className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {submittingLost ? 'Saving...' : 'Mark as Lost'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
