'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield, Filter, RefreshCw, Clock, Building2, User, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface AuditLogRecord {
  id: string
  action: string
  entityType: string
  entityId: string | null
  actorId: string | null
  actorName: string
  actorLoginId: string | null
  branchId: string | null
  branchName?: string
  before: any
  after: any
  reason: string | null
  ip: string | null
  createdAt: string
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string; code: string; type: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('ALL')
  const [filterBranch, setFilterBranch] = useState('ALL')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/branches')
      .then((r) => r.json())
      .then((d) => setBranches(d.branches || []))
      .catch(() => {})
  }, [])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAction !== 'ALL') params.append('action', filterAction)
      if (filterBranch !== 'ALL') params.append('branchId', filterBranch)

      const res = await fetch(`/api/audit?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setLogs(data.logs || [])
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [filterAction, filterBranch])

  const formatISTTime = (isoString: string) => {
    const d = new Date(isoString)
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
  }

  const getActionBadge = (action: string) => {
    if (action.includes('login_failed') || action.includes('lockout')) {
      return 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/30'
    }
    if (action.includes('login') || action.includes('seed')) {
      return 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
    }
    if (action.includes('reversal')) {
      return 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
    }
    return 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Admin Overview"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base text-[var(--text)] tracking-tight">
                System Audit Log
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent-50)] text-[var(--warning)] border border-[var(--warning)]/30">
                Append-Only
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Tamper-evident record of security events, logins, role actions, and fee alterations.
            </p>
          </div>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[var(--primary-600)] ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Filter Bar */}
        <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5" /> Filter by:
            </div>

            {/* Branch Filter */}
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)] focus:ring-1 focus:ring-[var(--primary-600)]"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.type === 'OWNED' ? 'Owned' : 'Franchise'})
                </option>
              ))}
            </select>

            {/* Action Filter */}
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="h-8 px-2.5 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)] focus:ring-1 focus:ring-[var(--primary-600)]"
            >
              <option value="ALL">All Actions</option>
              <option value="user.login">user.login</option>
              <option value="user.login_failed">user.login_failed</option>
              <option value="user.logout">user.logout</option>
              <option value="user.lockout">user.lockout</option>
              <option value="system.seed">system.seed</option>
            </select>
          </div>

          <div className="text-xs text-[var(--text-muted)] font-mono">
            Showing {logs.length} entries
          </div>
        </div>

        {/* Logs Table */}
        <div className="rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs overflow-hidden">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              Loading audit logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-muted)]">
              No audit records match the selected filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-8"></th>
                    <th className="py-2.5 px-3">Timestamp (IST)</th>
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">Actor</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Entity</th>
                    <th className="py-2.5 px-3">Details / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {logs.map((log) => {
                    const isExpanded = expandedRow === log.id
                    const hasDiff = log.before || log.after
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className={`hover:bg-[var(--surface-2)]/60 transition-colors ${
                            isExpanded ? 'bg-[var(--primary-50)]/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            {hasDiff ? (
                              <button
                                onClick={() => setExpandedRow(isExpanded ? null : log.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--text)]"
                                title="Toggle diff details"
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap tabular-nums font-mono text-[11px] text-[var(--text-muted)]">
                            <div>{formatDate(log.createdAt)}</div>
                            <div className="text-[10px] text-[var(--text-muted)]/80">
                              {formatISTTime(log.createdAt)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium border ${getActionBadge(
                                log.action
                              )}`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-[var(--text)]">
                              {log.actorName}
                            </div>
                            {log.actorLoginId && (
                              <div className="text-[10px] font-mono text-[var(--text-muted)]">
                                {log.actorLoginId}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-muted)]">
                            {log.branchName || (log.branchId ? log.branchId : 'Global (All)')}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px]">
                            <span className="text-[var(--text)]">{log.entityType}</span>
                            {log.entityId && (
                              <span className="text-[var(--text-muted)] ml-1">#{log.entityId}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text)]">
                            {log.reason || '—'}
                          </td>
                        </tr>

                        {/* Expandable Before/After Diff Drawer */}
                        {isExpanded && hasDiff && (
                          <tr className="bg-[var(--surface-2)]/80 border-b border-[var(--border)]">
                            <td colSpan={7} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                <div>
                                  <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                                    Before State
                                  </div>
                                  <pre className="p-3 rounded bg-[var(--surface)] border border-[var(--border)] overflow-x-auto text-[11px]">
                                    {log.before
                                      ? JSON.stringify(log.before, null, 2)
                                      : 'null (Created)'}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)] mb-1">
                                    After State
                                  </div>
                                  <pre className="p-3 rounded bg-[var(--surface)] border border-[var(--border)] overflow-x-auto text-[11px]">
                                    {log.after
                                      ? JSON.stringify(log.after, null, 2)
                                      : 'null (Deleted)'}
                                  </pre>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

