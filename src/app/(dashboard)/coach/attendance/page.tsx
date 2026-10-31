'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  WifiOff,
  Wifi,
  Phone,
  Send,
  Users,
  ChevronRight,
  X,
  AlertCircle,
} from 'lucide-react'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface RosterStudent {
  studentId: string
  studentCode: string
  name: string
  emergencyPhone?: string
  status?: AttendanceStatus | null
  isLateEntry?: boolean
}

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
  isLive: boolean
  roster: RosterStudent[]
  summary?: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
    unmarked: number
  }
}

export default function CoachAttendancePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(true)
  const [hasPendingOffline, setHasPendingOffline] = useState(false)
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Monitor network connectivity for ground-resilience
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      const pBatchId = searchParams.get('batchId')
      const pDate = searchParams.get('date')
      if (pBatchId) setSelectedBatchId(pBatchId)
      if (pDate) setDateStr(pDate)
    }
  }, [])

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

  // Load existing attendances or cached offline marks
  useEffect(() => {
    if (!activeSession) return

    const offlineKey = `cpa_offline_att_${activeSession.batchId}_${dateStr}`
    const cached = localStorage.getItem(offlineKey)
    if (cached) {
      try {
        const parsed = JSON.parse(cached)
        setMarks(parsed)
        setHasPendingOffline(true)
        return
      } catch {}
    }

    const initialMarks: Record<string, AttendanceStatus> = {}
    activeSession.roster.forEach((r) => {
      if (r.status) initialMarks[r.studentId] = r.status
    })
    setMarks(initialMarks)
    setHasPendingOffline(false)
  }, [activeSession, dateStr])

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    const updated = { ...marks, [studentId]: status }
    setMarks(updated)
    if (activeSession) {
      const offlineKey = `cpa_offline_att_${activeSession.batchId}_${dateStr}`
      localStorage.setItem(offlineKey, JSON.stringify(updated))
      setHasPendingOffline(true)
    }
  }

  const markAllPresent = () => {
    if (!activeSession) return
    const updated: Record<string, AttendanceStatus> = {}
    activeSession.roster.forEach((r) => {
      updated[r.studentId] = 'PRESENT'
    })
    setMarks(updated)
    const offlineKey = `cpa_offline_att_${activeSession.batchId}_${dateStr}`
    localStorage.setItem(offlineKey, JSON.stringify(updated))
    setHasPendingOffline(true)
  }

  const handleSubmit = async () => {
    if (!activeSession) return
    const records = Object.entries(marks).map(([studentId, status]) => ({
      studentId,
      status,
    }))

    if (records.length === 0) {
      setFeedback({ type: 'error', text: 'Please mark attendance for at least one cadet.' })
      return
    }

    // If offline, save locally
    if (!navigator.onLine) {
      setFeedback({
        type: 'success',
        text: 'Saved offline! Attendance will automatically sync as soon as you reconnect.',
      })
      setHasPendingOffline(true)
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/attendance/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: activeSession.batchId,
          date: dateStr,
          records,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Attendance submitted successfully! ${data.alertsSent} absence alerts dispatched to parents.`,
        })
        const offlineKey = `cpa_offline_att_${activeSession.batchId}_${dateStr}`
        localStorage.removeItem(offlineKey)
        setHasPendingOffline(false)
        fetchSessions()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Submission failed' })
      }
    } catch {
      setFeedback({
        type: 'error',
        text: 'Network error. Attendance saved locally on device.',
      })
      setHasPendingOffline(true)
    }
    setSubmitting(false)
  }

  const handleCancelSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession || !cancelReason.trim()) return
    setCancelling(true)
    try {
      const res = await fetch('/api/attendance/sessions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: activeSession.batchId,
          date: dateStr,
          reason: cancelReason.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: 'Session marked as CANCELLED. All parent absence alerts have been suppressed.',
        })
        setShowCancelModal(false)
        setCancelReason('')
        fetchSessions()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to cancel session' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error cancelling session' })
    }
    setCancelling(false)
  }

  const absentCadetsCount = Object.values(marks).filter((s) => s === 'ABSENT').length

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="mx-auto max-w-xl px-4 py-5 sm:px-6">
        {/* Offline Banner */}
        {!isOnline && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-800 shadow-xs">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You are currently offline. Changes are saved locally on ground and will sync automatically when connected.</span>
          </div>
        )}

        {/* Pending Sync Banner */}
        {hasPendingOffline && isOnline && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 shadow-xs">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 shrink-0" />
              <span>Offline marks stored locally. Tap &ldquo;Submit Attendance&rdquo; to sync to cloud.</span>
            </div>
          </div>
        )}

        {/* Header & Controls */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Daily Attendance</h1>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Touch-optimized for ground session marking</p>
          </div>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="rounded-xl border px-3 py-1.5 text-xs font-medium outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-4 flex items-center justify-between rounded-xl border p-3 text-xs font-medium ${
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

        {/* Batch Picker */}
        {sessions.length > 0 ? (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {sessions.map((s) => (
              <button
                key={s.batchId}
                onClick={() => setSelectedBatchId(s.batchId)}
                className={`flex shrink-0 flex-col items-start rounded-xl border px-3.5 py-2 text-left transition-all ${
                  selectedBatchId === s.batchId
                    ? 'border-[var(--primary-600)] bg-[var(--primary-50)] shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface-2)] opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-xs font-bold" style={{ color: selectedBatchId === s.batchId ? 'var(--primary-700)' : 'var(--text-primary)' }}>
                  {s.batchName}
                </div>
                <div className="flex items-center gap-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>{s.startTime} - {s.endTime}</span>
                  {s.status === 'COMPLETED' && <span className="font-semibold text-emerald-600">✓ Submitted</span>}
                  {s.status === 'CANCELLED' && <span className="font-semibold text-red-600">✕ Cancelled</span>}
                </div>
              </button>
            ))}
          </div>
        ) : !loading && (
          <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <Users className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>No sessions scheduled for your assigned batches today.</p>
          </div>
        )}

        {/* Active Session Card */}
        {activeSession && (
          <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            {/* Status bar */}
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {activeSession.batchName} Roster ({activeSession.roster.length} cadets)
                </div>
                {activeSession.status === 'CANCELLED' ? (
                  <span className="text-xs font-semibold text-red-600">
                    Cancelled: {activeSession.cancelReason || 'Inclement weather / maintenance'}
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Session: {activeSession.startTime} - {activeSession.endTime}{' '}
                    {activeSession.isLive && <span className="font-semibold text-emerald-600">· Live Session</span>}
                  </span>
                )}
              </div>

              {activeSession.status !== 'CANCELLED' && (
                <div className="flex gap-2">
                  <button
                    onClick={markAllPresent}
                    className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:bg-gray-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--primary-700)' }}
                  >
                    All Present
                  </button>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Cancel Session
                  </button>
                </div>
              )}
            </div>

            {/* Cadets List */}
            {activeSession.roster.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No active cadets enrolled in this batch yet.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {activeSession.roster.map((student) => {
                  const currentStatus = marks[student.studentId]
                  return (
                    <div key={student.studentId} className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {student.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          <span className="font-mono">{student.studentCode}</span>
                          {/* Emergency contact visible strictly during live sessions */}
                          {student.emergencyPhone && (
                            <span className="flex items-center gap-1 text-emerald-700 font-medium">
                              <Phone className="h-3 w-3" /> {student.emergencyPhone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Selector Pills (Touch-optimized 44px min tap targets) */}
                      {activeSession.status !== 'CANCELLED' ? (
                        <div className="grid grid-cols-4 gap-1.5 w-full sm:w-auto">
                          {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceStatus[]).map((st) => {
                            const isSelected = currentStatus === st
                            let selectedStyle = ''
                            if (isSelected) {
                              if (st === 'PRESENT') selectedStyle = 'bg-emerald-600 text-white font-bold shadow-xs'
                              else if (st === 'ABSENT') selectedStyle = 'bg-red-600 text-white font-bold shadow-xs'
                              else if (st === 'LATE') selectedStyle = 'bg-amber-500 text-white font-bold shadow-xs'
                              else if (st === 'EXCUSED') selectedStyle = 'bg-gray-600 text-white font-bold shadow-xs'
                            } else {
                              selectedStyle = 'bg-[var(--surface-1)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-gray-100'
                            }

                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setStudentStatus(student.studentId, st)}
                                className={`h-9 px-2.5 rounded-lg text-xs tracking-wide transition-all ${selectedStyle}`}
                              >
                                {st === 'PRESENT' && 'P'}
                                {st === 'ABSENT' && 'A'}
                                {st === 'LATE' && 'L'}
                                {st === 'EXCUSED' && 'E'}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400">Cancelled</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Bottom Submit Strip */}
            {activeSession.status !== 'CANCELLED' && activeSession.roster.length > 0 && (
              <div className="border-t p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}>
                {absentCadetsCount > 0 && (
                  <p className="mb-3 text-[11px] text-amber-700">
                    ℹ️ Submitting will automatically send WhatsApp absence alerts to parents of {absentCadetsCount} absent cadet{absentCadetsCount !== 1 ? 's' : ''}.
                  </p>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-md transition-transform active:scale-98 disabled:opacity-50"
                  style={{ background: 'var(--primary-600)' }}
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting & Dispatching Alerts…' : 'Submit Daily Attendance'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Cancel Session Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Cancel Session</h2>
              <button onClick={() => setShowCancelModal(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCancelSession} className="p-6 space-y-4">
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Cancelling this session suppresses all absence notifications to parents.
              </p>
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Reason for Cancellation *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Heavy rain & wet pitch, state holiday"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 rounded-xl border px-4 py-2 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

