'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard-header'
import { Calendar, Users, Clock, Shield, CheckCircle2, AlertCircle, RefreshCw, ChevronRight } from 'lucide-react'

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
  roster: Array<{ studentId: string; name: string }>
  summary?: {
    total: number
    present: number
    absent: number
  }
}

export default function CoachPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const todayStr = new Date().toISOString().split('T')[0]

  const fetchTodaySessions = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attendance/sessions?date=${todayStr}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.sessions)) {
        setSessions(data.sessions)
      }
    } catch (err) {
      console.error('Failed to fetch coach sessions:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTodaySessions()
  }, [])

  const completedCount = sessions.filter((s) => s.attendanceSubmittedAt || s.status === 'COMPLETED').length

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Mobile-first Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
                Today&apos;s Pitch Sessions
              </h1>
              <button
                onClick={fetchTodaySessions}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                title="Refresh Sessions"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
              Live ground attendance &amp; instant absence alerts for parents.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--primary-600)]" />
              <span>
                {completedCount} / {sessions.length} Completed Today
              </span>
            </span>
          </div>
        </div>

        {/* Security Rule Banner */}
        <div className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] flex items-start gap-2.5 text-xs text-[var(--text-muted)]">
          <Shield className="w-4 h-4 text-[var(--primary-600)] shrink-0 mt-0.5" />
          <span>
            <strong>Coach Scope Enforced:</strong> Fee data and parent contact numbers are securely hidden. Emergency contacts are exposed during live pitch sessions only.
          </span>
        </div>

        {/* Sessions List */}
        <div className="space-y-4">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading today&apos;s sessions…</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] space-y-3">
              <Calendar className="w-8 h-8 text-[var(--text-muted)] mx-auto" />
              <h3 className="text-sm font-bold text-[var(--text)]">No Sessions Scheduled For Today</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                No active training batches are allocated to you for today&apos;s date ({todayStr}). Check with your branch manager for schedule assignments.
              </p>
              <Link
                href="/coach/attendance"
                className="inline-block mt-2 text-xs font-semibold text-[var(--primary-600)] hover:underline"
              >
                Open Attendance Register →
              </Link>
            </div>
          ) : (
            sessions.map((session) => {
              const isCompleted = !!session.attendanceSubmittedAt || session.status === 'COMPLETED'
              const isCancelled = session.status === 'CANCELLED'

              return (
                <div
                  key={session.id || session.batchId}
                  className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20">
                        {session.batchName}
                      </span>
                      <h3 className="text-base font-bold text-[var(--text)] mt-1">{session.batchName}</h3>
                    </div>

                    <div>
                      {isCancelled ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/30">
                          Cancelled
                        </span>
                      ) : isCompleted ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--success-50)] text-[var(--success)] border border-[var(--success)]/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Marked
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[var(--accent-50)] text-[var(--warning)] border border-[var(--warning)]/20">
                          Pending Attendance
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
                    <div className="flex items-center gap-1.5 mt-2">
                      <Clock className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                      <span>{session.startTime} - {session.endTime} IST</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2">
                      <Users className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                      <span>{session.roster?.length || 0} Registered Cadets</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 col-span-2 sm:col-span-1">
                      <Calendar className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                      <span>{session.date}</span>
                    </div>
                  </div>

                  {isCancelled && session.cancelReason && (
                    <div className="p-2.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--warning)] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Reason: {session.cancelReason}</span>
                    </div>
                  )}

                  <div className="pt-2">
                    <Link
                      href={`/coach/attendance?batchId=${session.batchId}&date=${session.date}`}
                      className={`w-full sm:w-auto h-11 px-5 rounded-[var(--radius-sm)] text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                        isCancelled
                          ? 'bg-[var(--surface-2)] text-[var(--text-muted)] pointer-events-none'
                          : 'bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white'
                      }`}
                    >
                      <span>{isCompleted ? 'Review / Edit Attendance' : 'Take Attendance'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
