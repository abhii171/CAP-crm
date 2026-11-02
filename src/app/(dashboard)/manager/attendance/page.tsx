'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Search,
  Filter,
  X,
  Edit2,
  AlertCircle,
  FileText,
} from 'lucide-react'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface Session {
  id: string
  batchId: string
  batchName: string
  branchId: string
  date: string
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
  cancelReason?: string | null
  attendanceSubmittedAt?: string | null
  startTime: string
  endTime: string
  coachName?: string
  roster: {
    studentId: string
    studentCode: string
    name: string
    status?: AttendanceStatus | null
    isLateEntry?: boolean
  }[]
  summary?: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
    unmarked: number
  }
}

export default function ManagerAttendancePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')

  // Correction modal state
  const [correctingStudent, setCorrectingStudent] = useState<{
    sessionId: string
    studentId: string
    name: string
    currentStatus: AttendanceStatus | null
  } | null>(null)
  const [newStatus, setNewStatus] = useState<AttendanceStatus>('PRESENT')
  const [correctionReason, setCorrectionReason] = useState('')
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attendance/sessions?date=${dateStr}`)
      const data = await res.json()
      if (data.success && data.sessions) {
        setSessions(data.sessions)
        if (data.sessions.length > 0) {
          setSelectedBatchId((prev) => {
            return data.sessions.some((s: any) => s.batchId === prev)
              ? prev
              : data.sessions[0].batchId
          })
        }
      }
    } catch {}
    setLoading(false)
  }, [dateStr])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const activeSession = sessions.find((s) => s.batchId === selectedBatchId)

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!correctingStudent || !correctionReason.trim()) return
    setSavingCorrection(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/attendance/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: correctingStudent.sessionId,
          studentId: correctingStudent.studentId,
          newStatus,
          reason: correctionReason.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Attendance corrected for ${correctingStudent.name} and logged in audit history.`,
        })
        setCorrectingStudent(null)
        setCorrectionReason('')
        fetchSessions()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Correction failed' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error during attendance correction' })
    }
    setSavingCorrection(false)
  }

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
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Attendance Management</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Daily batch attendance tracking, late flags &amp; manager audit corrections</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm font-medium outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            />
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

        {/* Sessions Summary Grid */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <div
              key={s.batchId}
              onClick={() => setSelectedBatchId(s.batchId)}
              className={`cursor-pointer rounded-2xl border p-5 shadow-xs transition-all ${
                selectedBatchId === s.batchId ? 'ring-2 ring-[var(--primary-600)]' : 'hover:shadow-md'
              }`}
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{s.batchName}</h3>
                  <div className="text-xs text-gray-500 mt-0.5">Coach: {s.coachName || 'Unassigned'}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    s.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : s.status === 'CANCELLED'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {s.status}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-emerald-50 py-1.5 font-bold text-emerald-700">
                  {s.summary?.present || 0} <div className="text-[10px] font-normal">Present</div>
                </div>
                <div className="rounded-lg bg-red-50 py-1.5 font-bold text-red-700">
                  {s.summary?.absent || 0} <div className="text-[10px] font-normal">Absent</div>
                </div>
                <div className="rounded-lg bg-amber-50 py-1.5 font-bold text-amber-700">
                  {s.summary?.late || 0} <div className="text-[10px] font-normal">Late</div>
                </div>
                <div className="rounded-lg bg-gray-100 py-1.5 font-bold text-gray-700">
                  {s.summary?.unmarked || 0} <div className="text-[10px] font-normal">Unmarked</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Roster Table with Manager Correction Actions */}
        {activeSession && (
          <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="border-b px-6 py-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                {activeSession.batchName} Cadet Roster &amp; Marks
              </h2>
              <p className="text-xs text-gray-500">
                Managers can correct historical attendance status with a logged justification reason.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                    {['Cadet Code', 'Cadet Name', 'Status', 'Late Entry', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeSession.roster.map((r, idx) => (
                    <tr
                      key={r.studentId}
                      style={{
                        borderBottom: idx < activeSession.roster.length - 1 ? '1px solid var(--border)' : undefined,
                        background: idx % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)',
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-emerald-700">{r.studentCode}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${
                            r.status === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-800'
                              : r.status === 'ABSENT'
                              ? 'bg-red-100 text-red-800'
                              : r.status === 'LATE'
                              ? 'bg-amber-100 text-amber-800'
                              : r.status === 'EXCUSED'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-gray-50 text-gray-400'
                          }`}
                        >
                          {r.status || 'UNMARKED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.isLateEntry ? (
                          <span className="font-semibold text-amber-600">⚠️ Late entry (&gt;2 hrs)</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            setCorrectingStudent({
                              sessionId: activeSession.id,
                              studentId: r.studentId,
                              name: r.name,
                              currentStatus: r.status || null,
                            })
                            setNewStatus(r.status === 'PRESENT' ? 'EXCUSED' : 'PRESENT')
                            setCorrectionReason('')
                          }}
                          className="flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          <Edit2 className="h-3 w-3" /> Correct
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Correction Modal */}
      {correctingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Correct Attendance: {correctingStudent.name}
              </h2>
              <button onClick={() => setCorrectingStudent(null)} style={{ color: 'var(--text-muted)' }}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCorrectionSubmit} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">New Attendance Status *</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as AttendanceStatus)}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="LATE">LATE</option>
                  <option value="EXCUSED">EXCUSED</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600">Reason for Correction (Mandatory for Audit) *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Cadet arrived late due to school exams, coach mis-marked"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCorrectingStudent(null)}
                  className="flex-1 rounded-xl border px-4 py-2 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCorrection}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--primary-600)' }}
                >
                  {savingCorrection ? 'Saving…' : 'Save Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

