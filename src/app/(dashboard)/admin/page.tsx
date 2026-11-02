'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  Building2,
  Users,
  IndianRupee,
  CheckCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Plus,
  MessageCircle,
  FileText,
  TrendingUp,
  RefreshCw,
  UserCheck,
} from 'lucide-react'
import { formatPaise } from '@/lib/utils'

interface AdminStats {
  branchCount: number
  cadetCount: number
  staffCount: number
  outstandingPaise: number
  todayCollectionsPaise: number
  recentLogs: Array<{
    id: string
    action: string
    entityType: string
    reason?: string | null
    createdAt: string
  }>
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats>({
    branchCount: 0,
    cadetCount: 0,
    staffCount: 0,
    outstandingPaise: 0,
    todayCollectionsPaise: 0,
    recentLogs: [],
  })
  const [loading, setLoading] = useState(true)

  const fetchLiveStats = async () => {
    setLoading(true)
    try {
      const [branchesRes, studentsRes, usersRes, auditRes, outstandingRes] = await Promise.all([
        fetch('/api/branches').catch(() => null),
        fetch('/api/students').catch(() => null),
        fetch('/api/users').catch(() => null),
        fetch('/api/audit').catch(() => null),
        fetch('/api/reports/outstanding').catch(() => null),
      ])

      const branchesData = branchesRes ? await branchesRes.json().catch(() => ({})) : {}
      const studentsData = studentsRes ? await studentsRes.json().catch(() => ({})) : {}
      const usersData = usersRes ? await usersRes.json().catch(() => ({})) : {}
      const auditData = auditRes ? await auditRes.json().catch(() => ({})) : {}
      const outstandingData = outstandingRes ? await outstandingRes.json().catch(() => ({})) : {}

      const branches = branchesData.branches || (Array.isArray(branchesData) ? branchesData : [])
      const students = studentsData.students || (Array.isArray(studentsData) ? studentsData : [])
      const users = usersData.users || (Array.isArray(usersData) ? usersData : [])
      const logs = auditData.logs || []

      // Calculate total outstanding paise dynamically from students or report
      let totalOutstanding = 0
      if (outstandingData.report?.summary?.totalOutstandingPaise != null) {
        totalOutstanding = outstandingData.report.summary.totalOutstandingPaise
      } else {
        totalOutstanding = students.reduce(
          (acc: number, s: any) => acc + (s.outstandingDuesPaise || 0),
          0
        )
      }

      setStats({
        branchCount: branches.length,
        cadetCount: students.length,
        staffCount: users.length,
        outstandingPaise: totalOutstanding,
        todayCollectionsPaise: 0,
        recentLogs: logs.slice(0, 5),
      })
    } catch (err) {
      console.error('Failed to load admin stats:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLiveStats()
  }, [])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="dashboard-container max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Welcome Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)] truncate">
                Admin Overview
              </h1>
              <button
                onClick={fetchLiveStats}
                className="p-1 rounded hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors shrink-0"
                title="Refresh Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
              Multi-branch academy governance, live cadet tracking, and financial reconciliation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              href="/admin/students"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>All Cadets ({stats.cadetCount})</span>
            </Link>
            <Link
              href="/admin/batches"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Users className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Batches</span>
            </Link>
            <Link
              href="/admin/branches"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <Building2 className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Branches ({stats.branchCount})</span>
            </Link>
            <Link
              href="/admin/users"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5 text-[var(--accent-500)] shrink-0" />
              <span>Staff ({stats.staffCount})</span>
            </Link>
            <Link
              href="/admin/reports"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <IndianRupee className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
              <span>Reports</span>
            </Link>
            <Link
              href="/admin/audit"
              className="h-8 px-2.5 sm:px-3 rounded-md bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold flex items-center gap-1.5 transition-colors text-[var(--text)] shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-[var(--warning)] shrink-0" />
              <span>Audit Log</span>
            </Link>
          </div>
        </div>

        {/* Dynamic Multi-Branch Snapshot Tiles - Responsive Grid: 1 col on mobile, 2 on tablet, 4 on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <Link
            href="/admin/branches"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Active Branches</span>
              <Building2 className="w-4 h-4 text-[var(--primary-600)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.branchCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2 flex items-center gap-1">
              <span>View &amp; manage locations</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--primary-600)] shrink-0" />
            </div>
          </Link>

          <Link
            href="/admin/students"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Enrolled Cadets</span>
              <Users className="w-4 h-4 text-[var(--accent-500)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.cadetCount}
            </div>
            <div className="text-xs text-[var(--success)] mt-2 font-medium flex items-center gap-1">
              <span>Active roster across all branches</span>
            </div>
          </Link>

          <Link
            href="/admin/reports"
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
              <span>Academy-wide balance report</span>
              <ArrowUpRight className="w-3 h-3 text-[var(--warning)] shrink-0" />
            </div>
          </Link>

          <Link
            href="/admin/users"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs hover:border-[var(--primary-600)]/40 transition-all flex flex-col justify-between group min-w-0"
          >
            <div className="flex items-center justify-between text-[var(--text-muted)] mb-2">
              <span className="text-xs font-medium uppercase tracking-wider">Staff &amp; Coaches</span>
              <UserCheck className="w-4 h-4 text-[var(--success)] group-hover:scale-110 transition-transform shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)] tabular-nums">
              {stats.staffCount}
            </div>
            <div className="text-xs text-[var(--text-muted)] mt-2">
              Managers, head coaches, and assistants
            </div>
          </Link>
        </div>

        {/* Dynamic Recent Audit Activity Strip */}
        <div className="p-4 sm:p-6 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-3 sm:space-y-4 min-w-0">
          <div className="flex flex-col xs:flex-row xs:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-[var(--text)]">Recent System Activity</h2>
              <p className="text-xs text-[var(--text-muted)]">Live audit trail events across all branches</p>
            </div>
            <Link
              href="/admin/audit"
              className="text-xs font-semibold text-[var(--primary-600)] hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View Full Audit Log</span>
              <span>→</span>
            </Link>
          </div>

          {stats.recentLogs.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">No recent audit logs available.</p>
          ) : (
            <div className="divide-y divide-[var(--border)] min-w-0">
              {stats.recentLogs.map((log) => (
                <div key={log.id} className="py-2.5 flex items-center justify-between text-xs gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0 truncate">
                    <span className="font-mono px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] shrink-0">
                      {log.action}
                    </span>
                    <span className="font-medium text-[var(--text)] shrink-0">{log.entityType}</span>
                    {log.reason && (
                      <span className="text-[var(--text-muted)] hidden md:inline truncate">
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

        {/* Global Configuration Shortcuts - Responsive Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <Link
            href="/admin/fee-plans"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block min-w-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--primary-700)]">
                Fee Structure
              </span>
              <IndianRupee className="w-4 h-4 text-[var(--primary-600)] shrink-0" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--text)]">Global Fee Plans</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Configure standardized monthly, quarterly, and annual cricket clinic tuition tiers.
            </p>
          </Link>

          <Link
            href="/admin/messages"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block min-w-0"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-500)]">
                WhatsApp Platform
              </span>
              <MessageCircle className="w-4 h-4 text-[var(--accent-500)] shrink-0" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--text)]">Outbound Logs &amp; Delivery</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Monitor Meta Cloud delivery receipts, retry queues, and guardian opt-out enforcement.
            </p>
          </Link>

          <Link
            href="/admin/reports"
            className="p-4 sm:p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary-600)] transition-all space-y-2 block min-w-0 sm:col-span-2 lg:col-span-1"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--warning)]">
                Finance &amp; Audits
              </span>
              <FileText className="w-4 h-4 text-[var(--warning)] shrink-0" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[var(--text)]">1-Click CSV Exports</h3>
            <p className="text-xs text-[var(--text-muted)]">
              RFC 4180 compliant export of outstanding dues, unclosed days, and cash collections.
            </p>
          </Link>
        </div>
      </main>
    </div>
  )
}
