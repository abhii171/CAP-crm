'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { formatPaise } from '@/lib/utils'
import {
  Users, Search, Plus, AlertTriangle, CheckCircle2, XCircle,
  ChevronDown, Filter, X, MessageCircle, IndianRupee
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
  guardianName?: string
  guardianPhone?: string
  whatsappOptIn: boolean
  currentBatch?: { id: string; name: string } | null
  outstandingDuesPaise?: number
}

interface AdmitForm {
  name: string
  dob: string
  gender: string
  guardianName: string
  whatsappNumber: string
  whatsappOptIn: boolean
  emergencyName: string
  emergencyPhone: string
  notes: string
  batchId: string
}

const EMPTY_FORM: AdmitForm = {
  name: '',
  dob: '',
  gender: '',
  guardianName: '',
  whatsappNumber: '',
  whatsappOptIn: true,
  emergencyName: '',
  emergencyPhone: '',
  notes: '',
  batchId: '',
}

export default function ManagerStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBatch, setFilterBatch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAdmit, setShowAdmit] = useState(false)
  const [form, setForm] = useState<AdmitForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState<{ name: string; studentCode: string } | null>(null)
  const [checkingDup, setCheckingDup] = useState(false)

  const [managerBranchId, setManagerBranchId] = useState('branch-kkp')

  const fetchBatches = async () => {
    try {
      const r = await fetch('/api/batches')
      const d = await r.json()
      if (d.success && Array.isArray(d.batches)) {
        setBatches(d.batches)
      } else if (Array.isArray(d)) {
        setBatches(d)
      }
    } catch {}
  }

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterBatch) params.set('batchId', filterBatch)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/students?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setStudents(data.students || (Array.isArray(data) ? data : []))
      }
    } catch {}
    setLoading(false)
  }, [search, filterBatch, filterStatus])

  useEffect(() => {
    fetchBatches()
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.branchId) setManagerBranchId(d.user.branchId)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(fetchStudents, 300)
    return () => clearTimeout(t)
  }, [fetchStudents])

  const checkDuplicate = useCallback(async (phone: string, name: string) => {
    if (phone.length < 10 || name.length < 2) return
    setCheckingDup(true)
    try {
      const res = await fetch('/api/students/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsappNumber: phone, name }),
      })
      if (res.ok) {
        const data = await res.json()
        setDuplicateWarning(data.hasDuplicate ? data.duplicate : null)
      }
    } catch {}
    setCheckingDup(false)
  }, [])

  const handlePhoneBlur = () => {
    if (form.whatsappNumber && form.name) {
      checkDuplicate(form.whatsappNumber, form.name)
    }
  }

  const handleAdmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.dob || !form.guardianName.trim() || !form.whatsappNumber.trim() || !form.batchId) {
      setError('Please fill in all required fields.')
      return
    }
    setSaving(true)
    setError('')
    try {
      // Get branchId from manager session or first student
      const branchId = managerBranchId || students[0]?.branchId || 'branch-kkp'
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, branchId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to admit student')
      } else {
        const code = data.student?.studentCode || data.studentCode || 'Generated'
        setSuccess(`✅ Cadet admitted! Student Code: ${code}`)
        setForm(EMPTY_FORM)
        setDuplicateWarning(null)
        setShowAdmit(false)
        fetchStudents()
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setSaving(false)
  }

  const clearFilters = () => {
    setSearch('')
    setFilterBatch('')
    setFilterStatus('')
  }

  const hasFilters = search || filterBatch || filterStatus

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="dashboard-container mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--primary-100)' }}>
              <Users className="h-5 w-5" style={{ color: 'var(--primary-600)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Students</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{students.length} cadet{students.length !== 1 ? 's' : ''} found</p>
            </div>
          </div>
          <button
            onClick={() => { fetchBatches(); setShowAdmit(true); setError(''); setSuccess(''); setDuplicateWarning(null) }}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow"
            style={{ background: 'var(--primary-600)' }}
          >
            <Plus className="h-4 w-4" />
            Admit New Cadet
          </button>
        </div>

        {/* Success banner */}
        {success && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium"
            style={{ background: 'var(--success-50)', borderColor: 'var(--success-200)', color: 'var(--success-700)' }}>
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
            <button onClick={() => setSuccess('')} className="ml-auto"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, or phone…"
              className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            />
          </div>
          <select
            value={filterBatch}
            onChange={(e) => setFilterBatch(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
          >
            <option value="">All Batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--primary-200)', borderTopColor: 'transparent' }} />
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="mb-3 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>No cadets found</p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {hasFilters ? 'Try adjusting your filters.' : 'Admit the first cadet to get started.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                    {['Code', 'Cadet Name', 'Batch', 'Guardian', 'WhatsApp', 'Outstanding', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className="transition-colors hover:bg-opacity-50"
                      style={{ borderBottom: i < students.length - 1 ? '1px solid var(--border)' : undefined,
                        background: i % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)' }}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--primary-600)' }}>{s.studentCode}</td>
                      <td className="px-4 py-3">
                        <a href={`/manager/students/${s.id}`} className="font-medium hover:underline" style={{ color: 'var(--text-primary)' }}>
                          {s.name}
                        </a>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.gender || '—'} · DOB {s.dob}</div>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>{s.currentBatch?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td className="px-4 py-3">
                        <div style={{ color: 'var(--text-primary)' }}>{s.guardianName || '—'}</div>
                        {s.guardianPhone && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.guardianPhone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {s.whatsappOptIn
                          ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
                              <MessageCircle className="h-3 w-3" /> Opted In
                            </span>
                          : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                              style={{ background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
                              No
                            </span>}
                      </td>
                      <td className="px-4 py-3">
                        {s.outstandingDuesPaise != null && s.outstandingDuesPaise > 0
                          ? <span className="font-semibold" style={{ color: 'var(--accent-600)' }}>
                              {formatPaise(s.outstandingDuesPaise)}
                            </span>
                          : <span style={{ color: 'var(--success-600)' }}>Nil</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium`}
                          style={s.status === 'ACTIVE'
                            ? { background: 'var(--success-50)', color: 'var(--success-700)' }
                            : { background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
                          {s.status === 'ACTIVE' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={`/manager/students/${s.id}`}
                          className="rounded-lg border px-2.5 py-1 text-xs font-medium hover:opacity-80"
                          style={{ borderColor: 'var(--primary-300)', color: 'var(--primary-600)' }}>
                          View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Admit Modal */}
      {showAdmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Admit New Cadet</h2>
              <button onClick={() => setShowAdmit(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleAdmit} className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm"
                  style={{ background: 'var(--error-50)', borderColor: 'var(--error-200)', color: 'var(--error-700)' }}>
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {duplicateWarning && (
                <div className="flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm"
                  style={{ background: 'var(--warning-50)', borderColor: 'var(--warning-200)', color: 'var(--warning-700)' }}>
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Possible duplicate</strong> — {duplicateWarning.name} ({duplicateWarning.studentCode}) is already registered with this parent&apos;s number.
                    Continuing will add a sibling record.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Cadet Name *</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onBlur={handlePhoneBlur}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="Full name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Date of Birth *</label>
                  <input required type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Gender</label>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm({ ...form, gender: e.target.value })}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                  >
                    <option value="">Select…</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Guardian Name *</label>
                  <input required value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="Parent / guardian full name" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>WhatsApp Number *</label>
                  <input required value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                    onBlur={handlePhoneBlur}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="+91 98765 43210" />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="optIn" checked={form.whatsappOptIn}
                    onChange={(e) => setForm({ ...form, whatsappOptIn: e.target.checked })}
                    className="h-4 w-4 rounded" />
                  <label htmlFor="optIn" className="text-sm" style={{ color: 'var(--text-primary)' }}>
                    Guardian has opted in for WhatsApp notifications
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Emergency Contact Name</label>
                  <input value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="If different from guardian" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Emergency Phone</label>
                  <input value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="+91 XXXXX XXXXX" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Batch *</label>
                  <select
                    required
                    value={form.batchId}
                    onChange={(e) => setForm({ ...form, batchId: e.target.value })}
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
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={2}
                    className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                    placeholder="Medical conditions, special requirements…" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdmit(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'var(--primary-600)' }}>
                  {saving ? 'Admitting…' : 'Admit Cadet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

