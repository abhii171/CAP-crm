'use client'

import React, { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  BarChart3,
  IndianRupee,
  Calendar,
  Building2,
  Download,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Users,
  Search,
  Filter,
  FileSpreadsheet,
} from 'lucide-react'
import { formatPaise } from '@/lib/utils'

export default function AdminReportsPage() {
  const [activeTab, setActiveTab] = useState<
    'OUTSTANDING_FEES' | 'COLLECTIONS' | 'UNCLOSED_DAYS' | 'ATTENDANCE'
  >('OUTSTANDING_FEES')

  const [loading, setLoading] = useState(true)
  const [branchFilter, setBranchFilter] = useState('')
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])

  // Reports data states
  const [outstandingData, setOutstandingData] = useState<any>(null)
  const [collectionsData, setCollectionsData] = useState<any>(null)
  const [unclosedData, setUnclosedData] = useState<any>(null)
  const [attendanceData, setAttendanceData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/branches')
      .then((r) => r.json())
      .then((d) => {
        if (d.branches) setBranches(d.branches)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const branchParam = branchFilter ? `?branchId=${branchFilter}` : ''

    if (activeTab === 'OUTSTANDING_FEES') {
      fetch(`/api/reports/outstanding${branchParam}`)
        .then((r) => r.json())
        .then((d) => setOutstandingData(d.report))
        .finally(() => setLoading(false))
    } else if (activeTab === 'COLLECTIONS') {
      fetch(`/api/reports/collections${branchParam}`)
        .then((r) => r.json())
        .then((d) => setCollectionsData(d.report))
        .finally(() => setLoading(false))
    } else if (activeTab === 'UNCLOSED_DAYS') {
      fetch(`/api/reports/unclosed-days${branchParam}`)
        .then((r) => r.json())
        .then((d) => setUnclosedData(d.report))
        .finally(() => setLoading(false))
    } else if (activeTab === 'ATTENDANCE') {
      fetch(`/api/reports/attendance${branchParam}`)
        .then((r) => r.json())
        .then((d) => setAttendanceData(d.report))
        .finally(() => setLoading(false))
    }
  }, [activeTab, branchFilter])

  const handleDownloadCsv = () => {
    const branchParam = branchFilter ? `&branchId=${branchFilter}` : ''
    window.location.href = `/api/reports/export?type=${activeTab}${branchParam}`
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-100)]">
              <BarChart3 className="h-5 w-5 text-[var(--primary-600)]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
                Academy Reports &amp; Financial Insights
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-0.5">
                Multi-branch audit reports, outstanding collections, aging schedules, and CSV exports
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-9 px-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)]"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-bold text-white bg-[var(--primary-600)] hover:bg-[var(--primary-700)] shadow-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[var(--border)]">
          {[
            { id: 'OUTSTANDING_FEES', label: 'Outstanding Fees', icon: IndianRupee },
            { id: 'COLLECTIONS', label: 'Collections (Cash vs Online)', icon: FileSpreadsheet },
            { id: 'UNCLOSED_DAYS', label: 'Unclosed Days & Reconciliation', icon: AlertTriangle },
            { id: 'ATTENDANCE', label: 'Attendance Summary', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold transition-colors border-b-2 ${
                  isActive
                    ? 'border-[var(--primary-600)] text-[var(--primary-700)] bg-[var(--surface-2)]/50'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary-200)] border-t-transparent" />
          </div>
        ) : (
          <>
            {/* TAB 1: OUTSTANDING FEES */}
            {activeTab === 'OUTSTANDING_FEES' && outstandingData && (
              <div className="space-y-6">
                {/* Aging Schedule Metric Tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Total Outstanding
                    </div>
                    <div className="text-xl font-bold text-[var(--text)] tabular-nums mt-1">
                      {formatPaise(outstandingData.totalOutstandingPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {outstandingData.totalCadetsWithDues} cadets with dues
                    </div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary-700)]">
                      Current (&lt; Due Date)
                    </div>
                    <div className="text-xl font-bold text-[var(--primary-700)] tabular-nums mt-1">
                      {formatPaise(outstandingData.currentPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Upcoming payments</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-600)]">
                      1 - 7 Days Overdue
                    </div>
                    <div className="text-xl font-bold text-[var(--accent-600)] tabular-nums mt-1">
                      {formatPaise(outstandingData.overdue1to7Paise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Friendly reminder stage</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--warning)]">
                      8 - 14 Days Overdue
                    </div>
                    <div className="text-xl font-bold text-[var(--warning)] tabular-nums mt-1">
                      {formatPaise(outstandingData.overdue8to14Paise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Overdue alert stage</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-red-200 bg-red-50/30 shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
                      &gt; 14 Days Overdue
                    </div>
                    <div className="text-xl font-bold text-red-700 tabular-nums mt-1">
                      {formatPaise(outstandingData.overdue14PlusPaise)}
                    </div>
                    <div className="text-[11px] text-red-600 mt-0.5 font-medium">Flagged for Manager</div>
                  </div>
                </div>

                {/* Table of Outstanding Dues */}
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Cadet Balances &amp; Aging Schedule
                    </h3>
                    <span className="text-xs text-[var(--text-muted)]">
                      {outstandingData.items.length} due items
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                          {['Cadet', 'Branch', 'Period', 'Due Date', 'Total', 'Paid', 'Outstanding', 'Aging Bucket', 'Status'].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {outstandingData.items.map((item: any) => (
                          <tr key={item.dueId} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-bold text-[var(--text)]">{item.studentName}</div>
                              <div className="font-mono text-xs text-[var(--text-muted)]">{item.studentCode}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--text-muted)]">{item.branchName}</td>
                            <td className="px-4 py-3 text-xs font-medium text-[var(--text)]">{item.description}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">{item.dueDate}</td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums text-[var(--text)]">{formatPaise(item.amountPaise)}</td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums text-[var(--success)]">{formatPaise(item.paidPaise)}</td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums font-bold text-[var(--text)]">{formatPaise(item.outstandingPaise)}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  item.agingBucket === 'OVER_14_DAYS'
                                    ? 'bg-red-100 text-red-800 border border-red-300'
                                    : item.agingBucket === '8-14_DAYS'
                                    ? 'bg-[var(--accent-100)] text-[var(--accent-800)] border border-[var(--accent-300)]'
                                    : item.agingBucket === '1-7_DAYS'
                                    ? 'bg-[var(--accent-50)] text-[var(--accent-700)]'
                                    : 'bg-[var(--primary-50)] text-[var(--primary-700)]'
                                }`}
                              >
                                {item.agingBucket} ({item.daysOverdue}d)
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {item.flaggedForManager && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600">
                                  <AlertTriangle className="w-3 h-3" /> Flagged
                                </span>
                              )}
                              {item.isPaused && (
                                <span className="text-[11px] font-medium text-[var(--text-muted)]">Paused</span>
                              )}
                              {!item.flaggedForManager && !item.isPaused && (
                                <span className="text-[11px] font-medium text-[var(--primary-700)]">Active</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: COLLECTIONS REPORT */}
            {activeTab === 'COLLECTIONS' && collectionsData && (
              <div className="space-y-6">
                {/* Metric Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Total Collections (Gross)
                    </div>
                    <div className="text-2xl font-bold text-[var(--text)] tabular-nums mt-1">
                      {formatPaise(collectionsData.grandTotalCollectionsPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Across all branches</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary-700)]">
                      Cash Revenue
                    </div>
                    <div className="text-2xl font-bold text-[var(--primary-700)] tabular-nums mt-1">
                      {formatPaise(collectionsData.grandTotalCashPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Collected at front desk</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-600)]">
                      Online Gateway Revenue
                    </div>
                    <div className="text-2xl font-bold text-[var(--accent-600)] tabular-nums mt-1">
                      {formatPaise(collectionsData.grandTotalOnlinePaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Razorpay payment links</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--success)]">
                      Net Academy Revenue
                    </div>
                    <div className="text-2xl font-bold text-[var(--success)] tabular-nums mt-1">
                      {formatPaise(collectionsData.grandTotalNetPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">After payment reversals</div>
                  </div>
                </div>

                {/* Branch Breakdown Table */}
                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                          {['Branch Code', 'Branch Name', 'Cash Collected (Receipts)', 'Online Collected (Receipts)', 'Gross Collections', 'Reversals', 'Net Collections'].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {collectionsData.branches.map((b: any) => (
                          <tr key={b.branchId} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/50">
                            <td className="px-4 py-3 font-mono text-xs font-bold text-[var(--text)]">{b.branchCode}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-[var(--text)]">{b.branchName}</td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums text-[var(--primary-700)]">
                              {formatPaise(b.cashTotalPaise)} ({b.cashCount} receipts)
                            </td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums text-[var(--accent-600)]">
                              {formatPaise(b.onlineTotalPaise)} ({b.onlineCount} receipts)
                            </td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums font-bold text-[var(--text)]">
                              {formatPaise(b.totalCollectionsPaise)}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums text-red-600">
                              {formatPaise(b.reversalsTotalPaise)}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono tabular-nums font-bold text-[var(--success)]">
                              {formatPaise(b.netCollectionsPaise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: UNCLOSED DAYS & RECONCILIATION */}
            {activeTab === 'UNCLOSED_DAYS' && unclosedData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--warning)]">
                      Unclosed Business Days
                    </div>
                    <div className="text-2xl font-bold text-[var(--warning)] tabular-nums mt-1">
                      {unclosedData.unclosedCount}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Days pending reconciliation</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
                      Cash Discrepancy Days
                    </div>
                    <div className="text-2xl font-bold text-red-600 tabular-nums mt-1">
                      {unclosedData.discrepancyCount}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Closed with cash variance</div>
                  </div>

                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Net Discrepancy Amount
                    </div>
                    <div className="text-2xl font-bold text-[var(--text)] tabular-nums mt-1">
                      {formatPaise(unclosedData.totalDiscrepancyPaise)}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Total variance across branches</div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                          {['Branch', 'Business Date', 'Status', 'Expected Cash', 'Counted Cash', 'Variance', 'Discrepancy Note', 'Receipts'].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {unclosedData.items.map((item: any, idx: number) => (
                          <tr key={idx} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/50">
                            <td className="px-4 py-3 font-semibold text-[var(--text)]">{item.branchName}</td>
                            <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{item.businessDate}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  item.status === 'OPEN'
                                    ? 'bg-[var(--accent-100)] text-[var(--accent-800)] border border-[var(--accent-300)]'
                                    : 'bg-red-100 text-red-800 border border-red-300'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text)]">{formatPaise(item.cashCollectedPaise)}</td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                              {item.countedCashPaise ? formatPaise(item.countedCashPaise) : '—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums font-bold text-red-600">
                              {item.discrepancyPaise ? formatPaise(item.discrepancyPaise) : '0.00'}
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--text-muted)] max-w-xs truncate" title={item.discrepancyNote}>
                              {item.discrepancyNote || '—'}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--text)]">{item.receiptsCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: ATTENDANCE SUMMARY */}
            {activeTab === 'ATTENDANCE' && attendanceData && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Sessions Held
                    </div>
                    <div className="text-2xl font-bold text-[var(--primary-600)] tabular-nums mt-1">
                      {attendanceData.totalSessionsHeld}
                    </div>
                  </div>
                  <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Overall Attendance Rate
                    </div>
                    <div className="text-2xl font-bold text-[var(--success)] tabular-nums mt-1">
                      {attendanceData.overallAttendanceRate}%
                    </div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                          {['Branch', 'Batch Name', 'Sessions', 'Possible Marks', 'Present', 'Absent', 'Late', 'Excused', 'Attendance Rate'].map((h) => (
                            <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceData.batches.map((b: any) => (
                          <tr key={b.batchId} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)]/50">
                            <td className="px-4 py-3 text-xs font-medium text-[var(--text-muted)]">{b.branchName}</td>
                            <td className="px-4 py-3 font-semibold text-[var(--text)]">{b.batchName}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--text)]">{b.sessionsHeld}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">{b.totalPossibleMarks}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--success)] font-bold">{b.presentCount}</td>
                            <td className="px-4 py-3 text-xs font-mono text-red-600 font-bold">{b.absentCount}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--warning)]">{b.lateCount}</td>
                            <td className="px-4 py-3 text-xs font-mono text-[var(--text-muted)]">{b.excusedCount}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`rounded px-2.5 py-1 text-xs font-bold ${
                                  b.attendanceRate >= 85
                                    ? 'bg-[var(--success-50)] text-[var(--success-700)]'
                                    : b.attendanceRate >= 70
                                    ? 'bg-[var(--accent-50)] text-[var(--accent-700)]'
                                    : 'bg-red-50 text-red-700'
                                }`}
                              >
                                {b.attendanceRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
