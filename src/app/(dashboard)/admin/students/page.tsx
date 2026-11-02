'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { formatPaise } from '@/lib/utils'
import {
  Users, Search, CheckCircle2, XCircle,
  Filter, X, MessageCircle
} from 'lucide-react'

interface Branch {
  id: string
  name: string
  code: string
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

export default function AdminStudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchStudents = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (filterBranch) params.set('branchId', filterBranch)
      if (filterStatus) params.set('status', filterStatus)
      const res = await fetch(`/api/students?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setStudents(data.students || (Array.isArray(data) ? data : []))
      }
    } catch {}
    setLoading(false)
  }, [search, filterBranch, filterStatus])

  useEffect(() => {
    fetch('/api/branches')
      .then((r) => r.json())
      .then((d) => setBranches(d.branches || (Array.isArray(d) ? d : [])))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(fetchStudents, 300)
    return () => clearTimeout(t)
  }, [fetchStudents])

  const clearFilters = () => {
    setSearch('')
    setFilterBranch('')
    setFilterStatus('')
  }

  const hasFilters = search || filterBranch || filterStatus

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
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>All Cadets (Cross-Branch)</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{students.length} cadet{students.length !== 1 ? 's' : ''} across all academy branches</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, student code, or phone…"
              className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            />
          </div>
          <select
            value={filterBranch}
            onChange={(e) => setFilterBranch(e.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] py-2.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
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
                {hasFilters ? 'Try adjusting your search criteria.' : 'No cadets registered in the system.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                    {['Code', 'Branch', 'Cadet Name', 'Batch', 'Guardian', 'WhatsApp', 'Outstanding', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-secondary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id} className="transition-colors hover:bg-opacity-50"
                      style={{
                        borderBottom: i < students.length - 1 ? '1px solid var(--border)' : undefined,
                        background: i % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)'
                      }}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: 'var(--primary-600)' }}>
                        {s.studentCode}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {s.branchName || s.branchId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {s.name}
                        </span>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.gender || '—'} · DOB {s.dob}</div>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-primary)' }}>
                        {s.currentBatch?.name || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
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
                          Profile
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
    </div>
  )
}
