'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import {
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Search,
  Filter,
  X,
  Building2,
  ShieldAlert,
} from 'lucide-react'

interface Branch {
  id: string
  name: string
  code: string
}

interface MessageRecord {
  id: string
  branchId: string
  recipientPhone: string
  direction: 'OUTBOUND' | 'INBOUND'
  templateName?: string | null
  body: string
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED' | 'RECEIVED'
  skipReason?: string | null
  attempts: number
  error?: string | null
  inboxStatus?: 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED' | null
  createdAt: string
  sentAt?: string | null
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState('')
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (branchFilter) params.set('branchId', branchFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (directionFilter) params.set('direction', directionFilter)
      const res = await fetch(`/api/whatsapp/messages?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.messages || [])
      }
    } catch {}
    setLoading(false)
  }, [search, branchFilter, statusFilter, directionFilter])

  useEffect(() => {
    fetchMessages()
    fetch('/api/branches')
      .then((r) => r.json())
      .then((d) => setBranches(d.branches || []))
      .catch(() => {})
  }, [fetchMessages])

  const handleRetry = async (messageId: string) => {
    setRetryingId(messageId)
    setFeedback(null)
    try {
      const res = await fetch(`/api/whatsapp/messages/${messageId}/retry`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Message retry succeeded and delivered!' })
        fetchMessages()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Retry failed' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error during retry' })
    }
    setRetryingId(null)
  }

  const failedMessages = messages.filter((m) => m.status === 'FAILED')
  const deliveredCount = messages.filter((m) => m.status === 'DELIVERED').length
  const inboundCount = messages.filter((m) => m.direction === 'INBOUND').length
  const skippedCount = messages.filter((m) => m.status === 'SKIPPED').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
      case 'READ':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--success-50)', color: 'var(--success-700)' }}>
            <CheckCircle2 className="h-3 w-3" /> Delivered
          </span>
        )
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--primary-50)', color: 'var(--primary-700)' }}>
            <Clock className="h-3 w-3" /> Sent
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--error-50)', color: 'var(--error-700)' }}>
            <AlertTriangle className="h-3 w-3" /> Failed
          </span>
        )
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--surface-1)', color: 'var(--text-muted)' }}>
            <ShieldAlert className="h-3 w-3" /> Skipped (Opt-out)
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}>
            {status}
          </span>
        )
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="dashboard-container mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--primary-100)' }}>
              <MessageSquare className="h-5 w-5" style={{ color: 'var(--primary-600)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>WhatsApp Monitoring (All Branches)</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Global queue oversight, delivery rate tracking &amp; opt-out logs</p>
            </div>
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

        {/* Stats Grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border p-4 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Delivered</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: 'var(--primary-600)' }}>{deliveredCount}</div>
          </div>
          <div className="rounded-2xl border p-4 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Inbound Inquiries</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{inboundCount}</div>
          </div>
          <div className="rounded-2xl border p-4 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Skipped (Opt-out)</div>
            <div className="mt-1 text-2xl font-bold" style={{ color: 'var(--accent-600)' }}>{skippedCount}</div>
          </div>
          <div className="rounded-2xl border p-4 shadow-xs" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Failed (Max Retry)</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{failedMessages.length}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by phone, branch, or message text…"
              className="w-full rounded-xl border py-2 pl-9 pr-3 text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
            />
          </div>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="rounded-xl border py-2 px-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          >
            <option value="">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value)}
            className="rounded-xl border py-2 px-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          >
            <option value="">All Directions</option>
            <option value="OUTBOUND">Outbound</option>
            <option value="INBOUND">Inbound Replies</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border py-2 px-3 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--text-primary)' }}
          >
            <option value="">All Statuses</option>
            <option value="DELIVERED">Delivered</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped (Opt-out)</option>
            <option value="RECEIVED">Received</option>
          </select>
          {(search || branchFilter || statusFilter || directionFilter) && (
            <button
              onClick={() => { setSearch(''); setBranchFilter(''); setStatusFilter(''); setDirectionFilter('') }}
              className="flex items-center gap-1 rounded-xl border px-3 py-2 text-xs font-medium"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--primary-200)', borderTopColor: 'transparent' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <MessageSquare className="mb-2 h-10 w-10" style={{ color: 'var(--text-muted)' }} />
              <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No messages found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}>
                    {['Timestamp', 'Branch', 'Direction', 'Recipient Phone', 'Template', 'Content', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m, idx) => (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: idx < messages.length - 1 ? '1px solid var(--border)' : undefined,
                        background: idx % 2 === 0 ? 'var(--surface-2)' : 'var(--surface-1)',
                      }}
                    >
                      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {m.branchId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                            m.direction === 'OUTBOUND' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {m.direction}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                        {m.recipientPhone}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium" style={{ color: 'var(--primary-700)' }}>
                        {m.templateName || (m.direction === 'INBOUND' ? 'Inbound' : '—')}
                      </td>
                      <td className="px-4 py-3 max-w-sm truncate text-xs" title={m.body} style={{ color: 'var(--text-primary)' }}>
                        {m.body}
                        {m.error && <div className="text-[11px] font-medium text-red-600 mt-0.5">Error: {m.error}</div>}
                        {m.skipReason && <div className="text-[11px] font-medium text-amber-600 mt-0.5">{m.skipReason}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {getStatusBadge(m.status)}
                          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            {m.attempts} attempt{m.attempts !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {m.status === 'FAILED' && m.attempts < 3 && (
                          <button
                            onClick={() => handleRetry(m.id)}
                            disabled={retryingId === m.id}
                            className="flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            <RotateCcw className={`h-3 w-3 ${retryingId === m.id ? 'animate-spin' : ''}`} />
                            {retryingId === m.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
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

