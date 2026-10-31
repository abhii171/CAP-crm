'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { formatPaise } from '@/lib/utils'
import {
  IndianRupee,
  Receipt,
  Plus,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  X,
  CreditCard,
  User,
  Search,
  FileText,
  DollarSign,
} from 'lucide-react'

interface Payment {
  id: string
  studentId: string
  studentName?: string
  studentCode?: string
  entryType?: 'PAYMENT' | 'REVERSAL'
  method: 'CASH' | 'ONLINE'
  amountPaise: number
  businessDate: string
  receivedAt: string
  receiptNumber?: number
  collectedByName?: string | null
  note?: string | null
  isReversed?: boolean
  reversedByName?: string | null
  reversalReason?: string | null
  status?: 'COMPLETED' | 'PENDING_APPROVAL' | 'REJECTED'
}

interface DailySummaryData {
  businessDate: string
  branchId: string
  isClosed: boolean
  closedAt?: string | null
  closedByName?: string | null
  expectedCashPaise: number
  countedCashPaise?: number | null
  discrepancyPaise?: number | null
  onlinePaise: number
  totalPaise: number
  receiptCount: number
  closeNote?: string | null
  payments: Payment[]
}

interface StudentOption {
  id: string
  studentCode: string
  name: string
  outstandingDuesPaise?: number
}

export default function ManagerPaymentsPage() {
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split('T')[0])
  const [summary, setSummary] = useState<DailySummaryData | null>(null)
  const [students, setStudents] = useState<StudentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Record Payment Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [paymentAmountRupees, setPaymentAmountRupees] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Close Day Modal
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [countedRupees, setCountedRupees] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [closingDay, setClosingDay] = useState(false)

  // Reversal Modal
  const [showReversalModal, setShowReversalModal] = useState(false)
  const [selectedPaymentForReversal, setSelectedPaymentForReversal] = useState<Payment | null>(null)
  const [reversalReason, setReversalReason] = useState('')
  const [reversingPayment, setReversingPayment] = useState(false)

  const fetchStudents = async () => {
    try {
      const r = await fetch('/api/students?status=ACTIVE')
      const d = await r.json()
      setStudents(d.students || (Array.isArray(d) ? d : []))
    } catch {}
  }

  const fetchSummary = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/payments/daily-summary?businessDate=${dateStr}`)
      const data = await res.json()
      if (data.success && data.summary) {
        setSummary(data.summary)
      }
    } catch {}
    setLoading(false)
  }, [dateStr])

  useEffect(() => {
    fetchSummary()
    fetchStudents()
  }, [fetchSummary])

  const selectedStudent = students.find((s) => s.id === selectedStudentId)

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountVal = parseFloat(paymentAmountRupees)
    if (!selectedStudentId || isNaN(amountVal) || amountVal <= 0) {
      setFeedback({ type: 'error', text: 'Please select a cadet and enter a valid positive amount.' })
      return
    }

    setRecordingPayment(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/payments/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: summary?.branchId || 'branch-kkp',
          studentId: selectedStudentId,
          amountPaise: Math.round(amountVal * 100),
          businessDate: dateStr,
          note: paymentNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Payment of ₹${amountVal.toLocaleString()} recorded! Receipt #${data.receiptNumber} generated and WhatsApp receipt dispatched.`,
        })
        setShowPaymentModal(false)
        setSelectedStudentId('')
        setPaymentAmountRupees('')
        setPaymentNote('')
        fetchSummary()
        fetchStudents()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to record payment' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error recording payment' })
    }
    setRecordingPayment(false)
  }

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault()
    const countedVal = parseFloat(countedRupees)
    if (isNaN(countedVal) || countedVal < 0) {
      setFeedback({ type: 'error', text: 'Please enter a valid non-negative counted cash amount.' })
      return
    }

    const expectedRupees = (summary?.expectedCashPaise || 0) / 100
    const diff = countedVal - expectedRupees
    if (diff !== 0 && (!closeNote.trim() || closeNote.trim().length < 5)) {
      setFeedback({
        type: 'error',
        text: `A cash discrepancy of ₹${Math.abs(diff).toLocaleString()} was detected. An explanation note (min 5 characters) is required.`,
      })
      return
    }

    setClosingDay(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/payments/daily-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: summary?.branchId || 'branch-kkp',
          businessDate: dateStr,
          countedCashPaise: Math.round(countedVal * 100),
          note: closeNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Day ${dateStr} successfully closed and locked. Closed entries are now immutable.`,
        })
        setShowCloseModal(false)
        setCountedRupees('')
        setCloseNote('')
        fetchSummary()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to close day' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error closing business day' })
    }
    setClosingDay(false)
  }

  const handleReversalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPaymentForReversal) return
    if (!reversalReason.trim() || reversalReason.trim().length < 5) {
      setFeedback({ type: 'error', text: 'Detailed justification reason (minimum 5 characters) is required.' })
      return
    }

    setReversingPayment(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/payments/reversals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: selectedPaymentForReversal.id,
          reason: reversalReason.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: data.message || 'Payment reversal processed successfully.',
        })
        setShowReversalModal(false)
        setSelectedPaymentForReversal(null)
        setReversalReason('')
        fetchSummary()
        fetchStudents()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to reverse payment.' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error reversing payment' })
    }
    setReversingPayment(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--primary-100)' }}>
              <Receipt className="h-5 w-5" style={{ color: 'var(--primary-600)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Cash Payments &amp; Daily Close</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Fee collection, sequential receipt issuance &amp; day-end cash reconciliation
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-medium outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            />
            {summary && !summary.isClosed && (
              <>
                <button
                  onClick={() => { fetchStudents(); setShowPaymentModal(true); setFeedback(null) }}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow"
                  style={{ background: 'var(--primary-600)' }}
                >
                  <Plus className="h-4 w-4" /> Record Cash Payment
                </button>
                <button
                  onClick={() => {
                    setCountedRupees(String((summary.expectedCashPaise || 0) / 100))
                    setShowCloseModal(true)
                    setFeedback(null)
                  }}
                  className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 shadow-xs"
                >
                  <Lock className="h-4 w-4" /> Close Day
                </button>
              </>
            )}
            {summary?.isClosed && (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                <Lock className="h-3.5 w-3.5" /> Day Closed &amp; Locked
              </span>
            )}
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-5 flex items-center justify-between rounded-xl border p-4 text-sm font-medium ${
              feedback.type === 'success'
                ? 'border-[var(--success-200)] bg-[var(--success-50)] text-[var(--success-700)]'
                : 'border-[var(--error-200)] bg-[var(--error-50)] text-[var(--error-700)]'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Daily Summary Cards */}
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border p-5 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Expected Cash</div>
              <div className="mt-1 text-2xl font-black text-emerald-700">
                {formatPaise(summary.expectedCashPaise)}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">Total collected in cash today</div>
            </div>

            <div className="rounded-2xl border p-5 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Online Fees</div>
              <div className="mt-1 text-2xl font-black text-blue-700">
                {formatPaise(summary.onlinePaise)}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">Gateway settlements</div>
            </div>

            <div className="rounded-2xl border p-5 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Collection</div>
              <div className="mt-1 text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
                {formatPaise(summary.totalPaise)}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">{summary.receiptCount} receipts issued</div>
            </div>

            <div className="rounded-2xl border p-5 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Day Close Status</div>
              <div className="mt-1 flex items-center gap-1.5 text-lg font-bold">
                {summary.isClosed ? (
                  <span className="text-emerald-700 flex items-center gap-1">
                    <Lock className="h-4 w-4" /> Closed
                  </span>
                ) : (
                  <span className="text-amber-600 flex items-center gap-1">
                    <Unlock className="h-4 w-4" /> Open
                  </span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                {summary.isClosed ? `By ${summary.closedByName || 'Manager'}` : 'Unclosed day'}
              </div>
            </div>
          </div>
        )}

        {/* Closed Discrepancy Note if applicable */}
        {summary?.isClosed && summary.discrepancyPaise != null && summary.discrepancyPaise !== 0 && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-xs">
            <div className="font-bold">
              ⚠️ Day Closed With Discrepancy: {summary.discrepancyPaise > 0 ? '+' : ''}{formatPaise(summary.discrepancyPaise ?? 0)}
            </div>
            <div className="mt-1">
              <strong>Manager Explanation:</strong> {summary.closeNote || 'No explanation provided'}
            </div>
          </div>
        )}

        {/* Payments & Receipts Table */}
        <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
            <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Receipts Issued on {dateStr}
            </h2>
            <p className="text-xs text-gray-500">
              Gapless sequential receipts per branch. Receipts are immutable once day is closed.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--primary-200)', borderTopColor: 'transparent' }} />
            </div>
          ) : !summary || summary.payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Receipt className="mb-2 h-10 w-10 text-gray-400" />
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No fee payments recorded on this date.</p>
              <p className="text-xs text-gray-500">Use &ldquo;Record Cash Payment&rdquo; to collect fees and generate a receipt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                    {['Receipt #', 'Time', 'Cadet Code & Name', 'Method', 'Amount', 'Collected By', 'Note', 'Status / Action'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.payments.map((p, idx) => (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: idx < summary.payments.length - 1 ? '1px solid var(--border)' : undefined,
                        background: idx % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)',
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-bold text-emerald-700">
                        {p.receiptNumber ? `#${p.receiptNumber}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(p.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{p.studentName || 'Cadet'}</div>
                        <div className="text-[11px] font-mono text-gray-400">{p.studentCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                            p.method === 'CASH'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {p.method}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.entryType === 'REVERSAL' ? (
                          <span className="font-bold text-rose-700 font-mono">
                            -{formatPaise(Math.abs(p.amountPaise))}
                          </span>
                        ) : p.isReversed ? (
                          <span className="line-through text-gray-400 font-mono">
                            {formatPaise(p.amountPaise)}
                          </span>
                        ) : (
                          <span className="font-bold text-emerald-700 font-mono">
                            {formatPaise(p.amountPaise)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {p.collectedByName || 'System'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.reversalReason ? (
                          <span className="text-rose-600">Reversed: {p.reversalReason}</span>
                        ) : (
                          p.note || '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.entryType === 'REVERSAL' ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            REVERSAL ENTRY
                          </span>
                        ) : p.isReversed ? (
                          <span
                            className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                            title={`Reversed by ${p.reversedByName}: ${p.reversalReason}`}
                          >
                            REVERSED
                          </span>
                        ) : p.status === 'PENDING_APPROVAL' ? (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            PENDING APPROVAL
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedPaymentForReversal(p)
                              setShowReversalModal(true)
                            }}
                            className="rounded px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-colors"
                          >
                            Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Record Cash Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Record Cash Payment</h2>
              <button onClick={() => setShowPaymentModal(false)} style={{ color: 'var(--text-muted)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Select Cadet *</label>
                <select
                  required
                  value={selectedStudentId}
                  onChange={(e) => {
                    setSelectedStudentId(e.target.value)
                    const s = students.find((std) => std.id === e.target.value)
                    if (s && s.outstandingDuesPaise) {
                      setPaymentAmountRupees(String(s.outstandingDuesPaise / 100))
                    }
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                >
                  <option value="">Choose cadet…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.studentCode}) {s.outstandingDuesPaise ? `· Dues: ₹${(s.outstandingDuesPaise / 100).toLocaleString()}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStudent && (
                <div className="rounded-xl border p-3 text-xs space-y-1" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Outstanding Balance:</span>
                    <span className="font-bold text-amber-700">
                      {selectedStudent.outstandingDuesPaise ? formatPaise(selectedStudent.outstandingDuesPaise) : 'Nil'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Allocation Policy:</span>
                    <span className="font-semibold text-emerald-700">Auto FIFO (Oldest Dues First)</span>
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Cash Amount (₹) *</label>
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="2500"
                  value={paymentAmountRupees}
                  onChange={(e) => setPaymentAmountRupees(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none font-bold"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Payment Note / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. November monthly training fee"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium text-gray-600"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingPayment}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--primary-600)' }}
                >
                  {recordingPayment ? 'Recording…' : 'Issue Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Day Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Close Business Day ({dateStr})</h2>
              <button onClick={() => setShowCloseModal(false)} style={{ color: 'var(--text-muted)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCloseDay} className="p-6 space-y-4">
              <div className="rounded-xl border p-3.5 text-xs space-y-2 bg-amber-50 border-amber-200 text-amber-900">
                <div className="flex justify-between">
                  <span>Expected System Cash:</span>
                  <span className="font-bold">{formatPaise(summary?.expectedCashPaise || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Receipts:</span>
                  <span className="font-bold">{summary?.receiptCount || 0}</span>
                </div>
                <div className="text-[11px] text-amber-800">
                  ⚠️ Closing this day locks all entries. You will not be able to record further payments on {dateStr}.
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Physical Cash Counted (₹) *</label>
                <input
                  type="number"
                  step="1"
                  required
                  value={countedRupees}
                  onChange={(e) => setCountedRupees(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none font-bold"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* Show calculated discrepancy */}
              {countedRupees && (
                <div className="text-xs">
                  {parseFloat(countedRupees) - (summary?.expectedCashPaise || 0) / 100 !== 0 ? (
                    <span className="font-bold text-red-600">
                      Discrepancy: ₹{(parseFloat(countedRupees) - (summary?.expectedCashPaise || 0) / 100).toLocaleString()} (Explanation note is required)
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-600">✓ Cash tally matches perfectly.</span>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">
                  Close-out Note {parseFloat(countedRupees || '0') !== (summary?.expectedCashPaise || 0) / 100 ? '*' : '(Optional)'}
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Cash handed over to branch vault / Bank deposit slip #1234"
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium text-gray-600"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={closingDay}
                  className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {closingDay ? 'Locking…' : 'Lock & Close Day'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {showReversalModal && selectedPaymentForReversal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Reverse Fee Payment
              </h2>
              <button onClick={() => setShowReversalModal(false)} style={{ color: 'var(--text-muted)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleReversalSubmit} className="p-6 space-y-4">
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 space-y-1">
                <div>
                  <strong>Cadet:</strong> {selectedPaymentForReversal.studentName} ({selectedPaymentForReversal.studentCode})
                </div>
                <div>
                  <strong>Receipt:</strong> #{selectedPaymentForReversal.receiptNumber || 'N/A'} · <strong>Amount:</strong> {formatPaise(selectedPaymentForReversal.amountPaise)}
                </div>
                <div className="text-[11px] text-rose-700 pt-1">
                  Reversing will restore the allocated fee dues to UNPAID/PARTIAL and increase the student&apos;s outstanding balance. This action cannot be undone.
                </div>
              </div>

              {selectedPaymentForReversal.amountPaise > 500000 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1">
                    ⚠️ High-Value Reversal Threshold
                  </div>
                  <div className="mt-0.5">
                    Because this reversal exceeds the branch manager limit (₹5,000), it will be queued for Administrator approval before taking effect.
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  Justification Reason * (min 5 characters)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Duplicate cash receipt recorded in error / Parent requested refund"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReversalModal(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium text-gray-600"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversingPayment || reversalReason.trim().length < 5}
                  className="flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {reversingPayment ? 'Reversing…' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
