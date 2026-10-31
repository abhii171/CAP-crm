'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard-header'
import { formatPaise } from '@/lib/utils'
import {
  ArrowLeft, User, Phone, Calendar, Hash, Activity,
  Repeat2, PowerOff, Power, AlertTriangle, CheckCircle2,
  MessageCircle, X, ChevronRight, Banknote
} from 'lucide-react'

interface Batch {
  id: string
  name: string
}

interface Student {
  id: string
  studentCode: string
  name: string
  dob: string
  gender?: string | null
  status: 'ACTIVE' | 'INACTIVE'
  joinedOn: string
  branchId: string
  branchName?: string
  notes?: string | null
  emergencyName?: string | null
  emergencyPhone?: string | null
  guardian?: {
    id: string
    name: string
    whatsappNumber: string
    whatsappOptIn: boolean
    relationship?: string
  }
  guardianName?: string
  guardianPhone?: string
  whatsappOptIn: boolean
  currentBatch?: { id: string; name: string } | null
  outstandingDuesPaise?: number
  enrollments?: Array<{
    batchId: string
    batchName: string
    startDate: string
    endDate: string | null
  }>
}

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Transfer modal
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferBatchId, setTransferBatchId] = useState('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0])
  const [transferring, setTransferring] = useState(false)

  // Deactivate modal
  const [showDeactivate, setShowDeactivate] = useState(false)
  const [deactivateReason, setDeactivateReason] = useState('')
  const [deactivating, setDeactivating] = useState(false)

  // Reactivate modal
  const [showReactivate, setShowReactivate] = useState(false)
  const [reactivateBatchId, setReactivateBatchId] = useState('')
  const [reactivating, setReactivating] = useState(false)

  const fetchStudent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/students/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setStudent(data)
      } else {
        setError('Student not found.')
      }
    } catch {
      setError('Network error.')
    }
    setLoading(false)
  }

  const fetchBatches = async () => {
    try {
      const r = await fetch('/api/batches')
      const d = await r.json()
      setBatches(d.batches || (Array.isArray(d) ? d : []))
    } catch {}
  }

  useEffect(() => {
    fetchStudent()
    fetchBatches()
  }, [params.id])

  const patch = async (action: string, extra: Record<string, string>) => {
    const res = await fetch(`/api/students/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    return res
  }

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!transferBatchId || !transferDate) return
    setTransferring(true)
    const res = await patch('transfer-batch', { targetBatchId: transferBatchId, effectiveDate: transferDate })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Transfer failed')
    } else {
      setSuccess('Batch transfer recorded.')
      setShowTransfer(false)
      fetchStudent()
    }
    setTransferring(false)
  }

  const handleDeactivate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!deactivateReason.trim()) return
    setDeactivating(true)
    const res = await patch('deactivate', { reason: deactivateReason })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Deactivation failed')
    } else {
      const dues = data.outstandingDuesPaise
      setSuccess(`Cadet deactivated.${dues > 0 ? ` Outstanding dues: ${formatPaise(dues)} — please follow up.` : ''}`)
      setShowDeactivate(false)
      setDeactivateReason('')
      fetchStudent()
    }
    setDeactivating(false)
  }

  const handleReactivate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reactivateBatchId) return
    setReactivating(true)
    const res = await patch('reactivate', { batchId: reactivateBatchId })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Reactivation failed')
    } else {
      setSuccess('Cadet reactivated and enrolled.')
      setShowReactivate(false)
      fetchStudent()
    }
    setReactivating(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
        <DashboardHeader />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--primary-200)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
        <DashboardHeader />
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="font-medium" style={{ color: 'var(--text-primary)' }}>Student not found</p>
          <button onClick={() => router.back()} className="mt-4 rounded-xl px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--primary-600)', color: 'white' }}>Go Back</button>
        </div>
      </div>
    )
  }

  const isActive = student.status === 'ACTIVE'
  const guardian = student.guardian
  const enrollments = student.enrollments || []

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Back + Header */}
        <button onClick={() => router.back()} className="mb-5 flex items-center gap-1.5 text-sm font-medium hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft className="h-4 w-4" /> Back to Students
        </button>

        {/* Alerts */}
        {success && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ background: 'var(--success-50)', borderColor: 'var(--success-200)', color: 'var(--success-700)' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
            <button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ background: 'var(--error-50)', borderColor: 'var(--error-200)', color: 'var(--error-700)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
            <button onClick={() => setError('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Profile card */}
        <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-bold text-white"
                style={{ background: 'var(--primary-600)' }}>
                {student.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{student.name}</h1>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-semibold" style={{ color: 'var(--primary-600)' }}>{student.studentCode}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold`}
                    style={isActive
                      ? { background: 'var(--success-50)', color: 'var(--success-700)' }
                      : { background: 'var(--surface-1)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {isActive ? <CheckCircle2 className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {student.status}
                  </span>
                </div>
              </div>
            </div>
            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {isActive && (
                <>
                  <a
                    href="/manager/payments"
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
                    style={{ background: 'var(--primary-600)' }}
                  >
                    <Banknote className="h-4 w-4" /> Collect Fee
                  </a>
                  <button onClick={() => setShowTransfer(true)}
                    className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium hover:opacity-80"
                    style={{ borderColor: 'var(--primary-300)', color: 'var(--primary-600)', background: 'var(--primary-50)' }}>
                    <Repeat2 className="h-4 w-4" /> Transfer Batch
                  </button>
                  <button onClick={() => setShowDeactivate(true)}
                    className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium hover:opacity-80"
                    style={{ borderColor: 'var(--error-200)', color: 'var(--error-600)', background: 'var(--error-50)' }}>
                    <PowerOff className="h-4 w-4" /> Deactivate
                  </button>
                </>
              )}
              {!isActive && (
                <button onClick={() => setShowReactivate(true)}
                  className="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium hover:opacity-80"
                  style={{ borderColor: 'var(--success-300)', color: 'var(--success-700)', background: 'var(--success-50)' }}>
                  <Power className="h-4 w-4" /> Reactivate
                </button>
              )}
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: <Calendar className="h-4 w-4" />, label: 'Date of Birth', value: student.dob },
              { icon: <User className="h-4 w-4" />, label: 'Gender', value: student.gender || '—' },
              { icon: <Hash className="h-4 w-4" />, label: 'Branch', value: student.branchName || '—' },
              { icon: <Activity className="h-4 w-4" />, label: 'Current Batch', value: student.currentBatch?.name || 'Not enrolled' },
              { icon: <Calendar className="h-4 w-4" />, label: 'Joined On', value: student.joinedOn },
              {
                icon: <Phone className="h-4 w-4" />, label: 'Outstanding Dues',
                value: student.outstandingDuesPaise != null && student.outstandingDuesPaise > 0
                  ? formatPaise(student.outstandingDuesPaise)
                  : 'Nil',
                accent: (student.outstandingDuesPaise || 0) > 0
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.icon}</div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{item.label}</div>
                  <div className="mt-0.5 text-sm font-medium"
                    style={{ color: item.accent ? 'var(--accent-600)' : 'var(--text-primary)' }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Guardian section */}
          <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Guardian</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {guardian?.name || student.guardianName || '—'}
              </div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{guardian?.relationship || 'Guardian'}</div>
              <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{guardian?.whatsappNumber || student.guardianPhone || '—'}</div>
              {(guardian?.whatsappOptIn ?? student.whatsappOptIn) ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
                  <MessageCircle className="h-3 w-3" /> WhatsApp Opted In
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: 'var(--surface-1)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Not Opted In
                </span>
              )}
            </div>
            {student.emergencyName && (
              <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium">Emergency:</span> {student.emergencyName} · {student.emergencyPhone}
              </div>
            )}
            {student.notes && (
              <div className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium">Notes:</span> {student.notes}
              </div>
            )}
          </div>

          {/* Fee Dues Schedule (Step 1.10) */}
          <div className="p-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Scheduled Fee Dues
              </h3>
              <a
                href="/admin/fee-plans"
                className="text-xs font-semibold hover:underline"
                style={{ color: 'var(--primary-600)' }}
              >
                View Academy Fee Plans →
              </a>
            </div>
            <div className="rounded-xl border p-3 flex items-center justify-between"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Monthly Academy Training (November 2026)
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Due Date: 2026-11-05 · Period: Nov 2026
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold" style={{ color: 'var(--accent-600)' }}>
                  ₹2,500
                </div>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  DUE
                </span>
              </div>
            </div>
          </div>

          {/* Enrollment history */}
          <div className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              Enrollment History ({enrollments.length})
            </h3>
            {enrollments.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No enrollment records.</p>
            ) : (
              <div className="space-y-2">
                {enrollments.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border p-3"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
                    <div className={`h-2.5 w-2.5 rounded-full`}
                      style={{ background: e.endDate === null ? 'var(--success-500)' : 'var(--text-muted)' }} />
                    <div className="flex-1 text-sm">
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{e.batchName}</span>
                      <span style={{ color: 'var(--text-muted)' }}> · </span>
                      <span style={{ color: 'var(--text-secondary)' }}>{e.startDate}</span>
                      {e.endDate && <span style={{ color: 'var(--text-muted)' }}> → {e.endDate}</span>}
                    </div>
                    {e.endDate === null && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
                        Current
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Transfer Batch Modal */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Transfer Batch</h2>
              <button onClick={() => setShowTransfer(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleTransfer} className="p-6 space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Currently in: <strong style={{ color: 'var(--text-primary)' }}>{student.currentBatch?.name || 'No batch'}</strong>
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Target Batch *</label>
                <select
                  required
                  value={transferBatchId}
                  onChange={(e) => setTransferBatchId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                >
                  <option value="">Select batch…</option>
                  {batches.filter((b) => b.id !== student.currentBatch?.id).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Effective Date *</label>
                <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTransfer(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="submit" disabled={transferring}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--primary-600)' }}>
                  {transferring ? 'Transferring…' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {showDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Deactivate Cadet</h2>
              <button onClick={() => setShowDeactivate(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleDeactivate} className="p-6 space-y-4">
              {(student.outstandingDuesPaise || 0) > 0 && (
                <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm"
                  style={{ background: 'var(--warning-50)', borderColor: 'var(--warning-200)', color: 'var(--warning-700)' }}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Outstanding dues: <strong>{formatPaise(student.outstandingDuesPaise!)}</strong> — ensure follow-up after deactivation.
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Reason for Deactivation *</label>
                <textarea required rows={3} value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                  placeholder="e.g. Discontinued, relocated, injury…" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDeactivate(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="submit" disabled={deactivating}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--error-600)' }}>
                  {deactivating ? 'Deactivating…' : 'Deactivate Cadet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reactivate Modal */}
      {showReactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Reactivate Cadet</h2>
              <button onClick={() => setShowReactivate(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleReactivate} className="p-6 space-y-4">
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Select a batch to enrol <strong style={{ color: 'var(--text-primary)' }}>{student.name}</strong> into.
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Batch *</label>
                <select
                  required
                  value={reactivateBatchId}
                  onChange={(e) => setReactivateBatchId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                >
                  <option value="">Select batch…</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowReactivate(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
                <button type="submit" disabled={reactivating}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--success-600)' }}>
                  {reactivating ? 'Reactivating…' : 'Reactivate Cadet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

