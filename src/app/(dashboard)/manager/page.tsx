'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  Users,
  Clock,
  Calendar,
  IndianRupee,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Plus,
  ArrowUpRight,
  RefreshCw,
  UserCheck,
  Building2,
  ShieldAlert,
  FileText,
  UserPlus,
} from 'lucide-react'
import { formatPaise } from '@/lib/utils'

interface ManagerStats {
  branchName: string
  branchId: string
  branchCode: string
  branchType: 'OWNED' | 'FRANCHISE'
  cadetsCount: number
  batchesCount: number
  coachesCount: number
  outstandingPaise: number
  todaySessionsCount: number
  unmarkedSessionsCount: number
  unreadInboxCount: number
  todayCashPaise: number
  todayReceiptCount: number
  isDayClosed: boolean
  recentLogs: Array<{
    id: string
    action: string
    entityType: string
    reason?: string | null
    createdAt: string
  }>
  batches: Array<{
    id: string
    name: string
    capacity: number
    enrolledCount: number
    startTime: string
    endTime: string
    currentCoach?: { name: string } | null
    coachingStaff?: Array<{ id: string; name: string; isPrimary: boolean }>
  }>
}

export default function ManagerPage() {
  const [stats, setStats] = useState<ManagerStats>({
    branchName: 'CPA Branch',
    branchId: 'branch-kkp',
    branchCode: 'KKP',
    branchType: 'OWNED',
    cadetsCount: 0,
    batchesCount: 0,
    coachesCount: 0,
    outstandingPaise: 0,
    todaySessionsCount: 0,
    unmarkedSessionsCount: 0,
    unreadInboxCount: 0,
    todayCashPaise: 0,
    todayReceiptCount: 0,
    isDayClosed: false,
    recentLogs: [],
    batches: [],
  })
  const [loading, setLoading] = useState(true)

  const fetchLiveData = async () => {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const [
        meRes,
        branchesRes,
        studentsRes,
        batchesRes,
        coachesRes,
        dailyCloseRes,
        sessionsRes,
        inboxRes,
        auditRes,
      ] = await Promise.all([
        fetch('/api/auth/me').catch(() => null),
        fetch('/api/branches').catch(() => null),
        fetch('/api/students').catch(() => null),
        fetch('/api/batches').catch(() => null),
        fetch('/api/users?role=COACH').catch(() => null),
        fetch(`/api/payments/daily-summary?businessDate=${today}`).catch(() => null),
        fetch(`/api/attendance/sessions?date=${today}`).catch(() => null),
        fetch('/api/whatsapp/inbox?status=UNREAD').catch(() => null),
        fetch('/api/audit?limit=6').catch(() => null),
      ])

      const meData = meRes ? await meRes.json().catch(() => ({})) : {}
      const branchesData = branchesRes ? await branchesRes.json().catch(() => ({})) : {}
      const studentsData = studentsRes ? await studentsRes.json().catch(() => ({})) : {}
      const batchesData = batchesRes ? await batchesRes.json().catch(() => ({})) : {}
      const coachesData = coachesRes ? await coachesRes.json().catch(() => ({})) : {}
      const dailyData = dailyCloseRes ? await dailyCloseRes.json().catch(() => ({})) : {}
      const sessionsData = sessionsRes ? await sessionsRes.json().catch(() => ({})) : {}
      const inboxData = inboxRes ? await inboxRes.json().catch(() => ({})) : {}
      const auditData = auditRes ? await auditRes.json().catch(() => ({})) : {}

      const user = meData.user || {}
      const branches = branchesData.branches || (Array.isArray(branchesData) ? branchesData : [])
      const branchRecord = branches.find((b: any) => b.id === user.branchId) || branches[0] || {}

      const branchName = branchRecord.name || user.branchName || 'CPA Academy Branch'
      const branchCode = branchRecord.code || 'KKP'
      const branchType = (branchRecord.type as 'OWNED' | 'FRANCHISE') || (user.branchId === 'branch-hbn' ? 'FRANCHISE' : 'OWNED')

      const students = studentsData.students || (Array.isArray(studentsData) ? studentsData : [])
      const batches = batchesData.batches || (Array.isArray(batchesData) ? batchesData : [])
      const coaches = coachesData.users || []
      const sessions = sessionsData.sessions || []
      const inboxItems = inboxData.messages || []
      const logs = auditData.logs || []

      const unmarked = sessions.filter(
        (s: any) => s.status !== 'CANCELLED' && !s.attendanceSubmittedAt
      ).length

      // Calculate branch total outstanding dues
      const totalOutstanding = students.reduce(
        (acc: number, s: any) => acc + (s.outstandingDuesPaise || 0),
        0
      )

      setStats({
        branchName,
        branchId: user.branchId || branchRecord.id || 'branch-kkp',
        branchCode,
        branchType,
        cadetsCount: students.length,
        batchesCount: batches.length,
        coachesCount: coaches.length,
        outstandingPaise: totalOutstanding,
        todaySessionsCount: sessions.length,
        unmarkedSessionsCount: unmarked,
        unreadInboxCount: inboxItems.length,
        todayCashPaise: dailyData.summary?.expectedCashPaise || 0,
        todayReceiptCount: dailyData.summary?.receiptCount || 0,
        isDayClosed: dailyData.summary?.isClosed || false,
        recentLogs: logs.slice(0, 5),
        batches: batches.slice(0, 6),
      })
    } catch (err) {
      console.error('Failed to load manager dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLiveData()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="dashboard-container max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Welcome Section & Navigation Bar (Mirrors Admin Overview) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] shrink-0">
                {stats.branchCode}
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)] truncate">
                {stats.branchName} Overview
              </h1>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${
                  stats.branchType === 'OWNED'
                    ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                    : 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                }`}
              >
                {stats.branchType === 'OWNED' ? 'Owned Facility' : 'Franchise Partner'}
              </span>
              <button
                onClick={fetchLiveData}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors ml-1 shrink-0"
                title="Refresh Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
              Ground operations, live cadet roster, coaching staff, and daily financials for {stats.branchName}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/manager/students"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Cadets ({stats.cadetsCount})</span>
            </Link>
            <Link
              href="/manager/batches"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Calendar className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Batches ({stats.batchesCount})</span>
            </Link>
            <Link
              href="/manager/coaches"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5 text-[var(--accent-500)] shrink-0" />
              <span>Coaches ({stats.coachesCount})</span>
            </Link>
            <Link
              href="/manager/attendance"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Clock className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Attendance</span>
            </Link>
            <Link
              href="/manager/payments"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <IndianRupee className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
              <span>Cash Close</span>
            </Link>
            <Link
              href="/manager/messages"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[var(--accent-500)] shrink-0" />
              <span>WhatsApp ({stats.unreadInboxCount})</span>
            </Link>
          </div>
        </div>

        {/* 4 Snapshot KPI Tiles (Matches Admin Overview Layout) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <Link
            href="/manager/batches"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Training Batches</span>
              <Calendar className="w-4 h-4 text-[var(--primary-600)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.batchesCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1">
              <span>View &amp; allocate cohorts</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--primary-600)] shrink-0" />
            </div>
          </Link>

          <Link
            href="/manager/students"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Enrolled Cadets</span>
              <Users className="w-4 h-4 text-[var(--accent-500)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.cadetsCount}
            </div>
            <div className="text-xs text-[var(--success)] mt-2 font-medium flex items-center gap-1">
              <span>Active roster in this facility</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--success)] shrink-0" />
            </div>
          </Link>

          <Link
            href="/manager/payments"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Outstanding Dues</span>
              <IndianRupee className="w-4 h-4 text-[var(--warning)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--warning)] tabular-nums truncate">
              {formatPaise(stats.outstandingPaise)}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1">
              <span>Branch balance &amp; receipts</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--warning)] shrink-0" />
            </div>
          </Link>

          <Link
            href="/manager/coaches"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Coaching Staff</span>
              <UserCheck className="w-4 h-4 text-[var(--success)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.coachesCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1">
              <span>Assigned coaches &amp; staff</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--success)] shrink-0" />
            </div>
          </Link>
        </div>

        {/* Real-time Branch Operations Badges (4 Actionable Tiles) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/manager/payments"
            className="p-3.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)]/40 transition-colors block"
          >
            <div className="text-xs text-[var(--text-muted)] font-medium">Today&apos;s Physical Cash</div>
            <div className="text-xl font-bold text-[var(--text)] tabular-nums mt-1">
              {formatPaise(stats.todayCashPaise)}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {stats.todayReceiptCount} receipt{stats.todayReceiptCount !== 1 ? 's' : ''} issued
            </div>
          </Link>

          <Link
            href="/manager/payments"
            className="p-3.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)]/40 transition-colors block"
          >
            <div className="text-xs text-[var(--text-muted)] font-medium">Daily Close Status</div>
            <div className="mt-1 flex items-center gap-1.5">
              {stats.isDayClosed ? (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--success-50)] text-[var(--success)] border border-[var(--success)]/20 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Reconciled &amp; Locked
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-[var(--warning-50)] text-[var(--warning)] border border-[var(--warning)]/20 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Day Open (Pending Close)
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">
              {stats.isDayClosed ? 'Financial records locked' : 'Reconcile before midnight'}
            </div>
          </Link>

          <Link
            href="/manager/attendance"
            className="p-3.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)]/40 transition-colors block"
          >
            <div className="text-xs text-[var(--text-muted)] font-medium">Unmarked Sessions</div>
            <div className="text-xl font-bold text-[var(--text)] tabular-nums mt-1">
              {stats.unmarkedSessionsCount}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {stats.todaySessionsCount} sessions scheduled today
            </div>
          </Link>

          <Link
            href="/manager/messages"
            className="p-3.5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)]/40 transition-colors block"
          >
            <div className="text-xs text-[var(--text-muted)] font-medium">Unread Parent Inquiries</div>
            <div
              className={`text-xl font-bold tabular-nums mt-1 ${
                stats.unreadInboxCount > 0 ? 'text-[var(--warning)]' : 'text-[var(--text)]'
              }`}
            >
              {stats.unreadInboxCount}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Shared branch WhatsApp inbox</div>
          </Link>
        </div>

        {/* Recent Branch Activity Strip (Matches Admin's Recent System Activity, strictly scoped) */}
        <div className="p-6 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">Recent Branch Activity</h2>
              <p className="text-xs text-[var(--text-muted)]">Live operations and audit trail events for {stats.branchName}</p>
            </div>
            <span className="text-xs font-semibold text-[var(--primary-600)] flex items-center gap-1 font-mono">
              Branch: {stats.branchCode}
            </span>
          </div>

          {stats.recentLogs.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">No recent operations logged for this branch.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {stats.recentLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)]">
                      {log.action}
                    </span>
                    <span className="font-medium text-[var(--text)]">{log.entityType}</span>
                    {log.reason && (
                      <span className="text-[var(--text-muted)] hidden sm:inline truncate max-w-md">
                        · {log.reason}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Active Training Batches Grid */}
        <div className="p-6 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--text)]">Branch Batches &amp; Assigned Coaches</h2>
              <p className="text-xs text-[var(--text-muted)]">
                Live capacity and coach allocations for {stats.branchName}
              </p>
            </div>
            <Link
              href="/manager/batches"
              className="text-xs font-semibold text-[var(--primary-600)] hover:underline flex items-center gap-1"
            >
              <span>Manage Batches</span>
              <span>→</span>
            </Link>
          </div>

          {stats.batches.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-dashed border-[var(--border)] rounded-lg">
              <Calendar className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-40" />
              <p className="text-sm font-semibold text-[var(--text)]">No batches configured for this branch</p>
              <p className="text-xs text-[var(--text-muted)]">Create your first training batch to begin enrolling cadets.</p>
              <Link
                href="/manager/batches"
                className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Batch</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {stats.batches.map((batch) => {
                const occupancy = Math.round((batch.enrolledCount / batch.capacity) * 100)
                const coachDisplay = (batch.coachingStaff && batch.coachingStaff.length > 0)
                  ? batch.coachingStaff.map((c) => c.name).join(', ')
                  : (batch.currentCoach?.name || 'Unassigned')

                return (
                  <div
                    key={batch.id}
                    className="p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] space-y-2.5 hover:border-[var(--primary-600)]/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[var(--text)]">{batch.name}</h3>
                      <span className="text-[11px] font-mono font-semibold text-[var(--primary-700)]">
                        {batch.enrolledCount}/{batch.capacity}
                      </span>
                    </div>

                    <div className="text-xs text-[var(--text-muted)] space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-[var(--primary-600)]" />
                        <span>{batch.startTime} - {batch.endTime} IST</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-3 h-3 text-[var(--accent-500)]" />
                        <span className="font-medium text-[var(--text)] truncate">
                          Staff: {coachDisplay}
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary-600)] rounded-full"
                        style={{ width: `${Math.min(occupancy, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Operational Shortcuts (Matches Admin's 3 Cards at Bottom) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/manager/payments"
            className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-700)]">
                Daily Financials
              </span>
              <IndianRupee className="w-4 h-4 text-[var(--primary-600)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text)]">Daily Cash Close</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Record physical cash payments, generate instant receipts, and complete end-of-day cash reconciliation.
            </p>
          </Link>

          <Link
            href="/manager/messages"
            className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-500)]">
                Guardian Messaging
              </span>
              <MessageCircle className="w-4 h-4 text-[var(--accent-500)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text)]">WhatsApp Communications</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Send fee reminders, batch schedule alerts, rain delay notices, and reply to incoming parent messages.
            </p>
          </Link>

          <Link
            href="/manager/attendance"
            className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
                Ground Supervision
              </span>
              <Clock className="w-4 h-4 text-[var(--warning)]" />
            </div>
            <h3 className="text-base font-bold text-[var(--text)]">Daily Attendance Roster</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Monitor coach submissions for morning and evening drills, verify attendance, and manage attendance credits.
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
