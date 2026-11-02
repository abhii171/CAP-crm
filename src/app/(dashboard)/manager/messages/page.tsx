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
  Send,
  X,
  Inbox,
  ShieldAlert,
  Megaphone,
  Radio,
  Reply,
  CloudRain,
  User,
  Users,
} from 'lucide-react'

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

interface InboxItem extends MessageRecord {
  cadetName?: string
  studentCode?: string
  hoursAgo: number
  canFreeFormReply: boolean
  escalationLevel: 'NONE' | 'MANAGER' | 'ADMIN'
}

interface TemplateDef {
  name: string
  description: string
  bodyTemplate: string
  variables: string[]
}

interface NoticePreview {
  branchId: string
  branchName: string
  totalCadets: number
  optedInCount: number
  optedOutCount: number
}

export default function ManagerMessagesPage() {
  const [activeTab, setActiveTab] = useState<'LOGS' | 'INBOX'>('LOGS')
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [templates, setTemplates] = useState<TemplateDef[]>([])
  const [loading, setLoading] = useState(true)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [directionFilter, setDirectionFilter] = useState('')
  const [inboxStatusFilter, setInboxStatusFilter] = useState('')

  // Single test message modal
  const [showSendModal, setShowSendModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('notice_broadcast')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({
    branchName: 'CPA Kukatpally',
    headline: 'Ground Maintenance Notice',
    details: 'Main pitch under maintenance this Saturday morning. Nets session continues.',
  })
  const [sending, setSending] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  // Broadcast Notice Modal
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastHeadline, setBroadcastHeadline] = useState('')
  const [broadcastDetails, setBroadcastDetails] = useState('')
  const [cancelSessions, setCancelSessions] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [noticePreview, setNoticePreview] = useState<NoticePreview | null>(null)
  const [dispatchingNotice, setDispatchingNotice] = useState(false)

  // Reply Modal
  const [replyingItem, setReplyingItem] = useState<InboxItem | null>(null)
  const [replyText, setReplyText] = useState('')
  const [replyTemplate, setReplyTemplate] = useState('notice_broadcast')
  const [sendingReply, setSendingReply] = useState(false)

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchMessages = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (directionFilter) params.set('direction', directionFilter)
      const res = await fetch(`/api/whatsapp/messages?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.messages || [])
      }
    } catch {}
    setLoading(false)
  }, [search, statusFilter, directionFilter])

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true)
    try {
      const params = new URLSearchParams()
      if (inboxStatusFilter) params.set('status', inboxStatusFilter)
      const res = await fetch(`/api/whatsapp/inbox?${params.toString()}`)
      const data = await res.json()
      if (data.success) {
        setInboxItems(data.messages || [])
      }
    } catch {}
    setInboxLoading(false)
  }, [inboxStatusFilter])

  const [managerBranchId, setManagerBranchId] = useState('branch-kkp')

  useEffect(() => {
    fetchMessages()
    fetchInbox()
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.branchId) setManagerBranchId(d.user.branchId)
      })
      .catch(() => {})
    fetch('/api/whatsapp/templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => {})
  }, [fetchMessages, fetchInbox])

  // Fetch notice recipient preview whenever broadcast modal opens
  const openBroadcastModal = async () => {
    setShowBroadcastModal(true)
    setPreviewLoading(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/notices/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: managerBranchId }),
      })
      const data = await res.json()
      if (data.success) {
        setNoticePreview(data.preview)
      }
    } catch {}
    setPreviewLoading(false)
  }

  const handleDispatchNotice = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastHeadline.trim() || !broadcastDetails.trim()) {
      setFeedback({ type: 'error', text: 'Headline and details are required' })
      return
    }
    setDispatchingNotice(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/notices/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: managerBranchId,
          headline: broadcastHeadline.trim(),
          details: broadcastDetails.trim(),
          cancelSessions,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: `Broadcast dispatched to ${data.dispatchedCount} guardians! (${data.skippedOptOutCount} opted-out skipped, ${data.cancelledSessionsCount} sessions cancelled)`,
        })
        setShowBroadcastModal(false)
        setBroadcastHeadline('')
        setBroadcastDetails('')
        setCancelSessions(false)
        fetchMessages()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to dispatch broadcast notice' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error dispatching notice' })
    }
    setDispatchingNotice(false)
  }

  const handleUpdateInboxStatus = async (item: InboxItem, newStatus: 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED') => {
    try {
      const res = await fetch(`/api/whatsapp/inbox/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchInbox()
      }
    } catch {}
  }

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyingItem || !replyText.trim()) return

    setSendingReply(true)
    setFeedback(null)
    try {
      const payload: any = { replyText: replyText.trim() }
      if (!replyingItem.canFreeFormReply) {
        payload.templateName = replyTemplate
      }

      const res = await fetch(`/api/whatsapp/inbox/${replyingItem.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ type: 'success', text: 'Reply sent successfully and thread marked RESOLVED!' })
        setReplyingItem(null)
        setReplyText('')
        fetchInbox()
        fetchMessages()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to send reply' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error sending reply' })
    }
    setSendingReply(false)
  }

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipientPhone.trim()) {
      setFeedback({ type: 'error', text: 'Recipient phone number is required' })
      return
    }
    setSending(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/whatsapp/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: 'branch-kkp',
          recipientPhone: recipientPhone.trim(),
          templateName: selectedTemplate,
          variables: templateVars,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({
          type: 'success',
          text:
            data.message?.status === 'SKIPPED'
              ? 'Message skipped: Recipient has opted out of WhatsApp notifications.'
              : 'Message successfully queued and dispatched!',
        })
        setShowSendModal(false)
        setRecipientPhone('')
        fetchMessages()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to dispatch message' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error sending message' })
    }
    setSending(false)
  }

  const failedMessages = messages.filter((m) => m.status === 'FAILED')
  const deliveredCount = messages.filter((m) => m.status === 'DELIVERED').length
  const inboundCount = messages.filter((m) => m.direction === 'INBOUND').length
  const skippedCount = messages.filter((m) => m.status === 'SKIPPED').length
  const unreadInboxCount = inboxItems.filter((i) => i.inboxStatus === 'UNREAD').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
      case 'READ':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--success-50)] text-[var(--success-700)]">
            <CheckCircle2 className="h-3 w-3" /> Delivered
          </span>
        )
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--primary-50)] text-[var(--primary-700)]">
            <Clock className="h-3 w-3" /> Sent
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--error-50)] text-[var(--error-700)]">
            <AlertTriangle className="h-3 w-3" /> Failed
          </span>
        )
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--surface-1)] text-[var(--text-muted)]">
            <ShieldAlert className="h-3 w-3" /> Skipped (Opt-out)
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--surface-1)] text-[var(--text-secondary)]">
            {status}
          </span>
        )
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-1)]">
      <DashboardHeader />
      <main className="dashboard-container mx-auto max-w-7xl px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Header */}
        <div className="mb-4 sm:mb-6 flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-100)] shrink-0">
              <MessageSquare className="h-5 w-5 text-[var(--primary-600)] shrink-0" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] truncate">WhatsApp Communications</h1>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
                Broadcast notices, automated alerts, delivery tracking &amp; shared reply triage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={openBroadcastModal}
              className="flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white shadow transition-transform active:scale-95 bg-[var(--primary-600)] hover:bg-[var(--primary-700)] shrink-0"
            >
              <Megaphone className="h-4 w-4 shrink-0" /> Broadcast Notice
            </button>
            <button
              onClick={() => { setShowSendModal(true); setFeedback(null) }}
              className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 sm:px-3.5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-2)] shadow-xs shrink-0"
            >
              <Send className="h-4 w-4 text-[var(--accent-600)] shrink-0" /> Test Notice
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mb-4 sm:mb-6 flex border-b border-[var(--border)] overflow-x-auto no-scrollbar whitespace-nowrap min-w-0">
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'LOGS'
                ? 'border-[var(--primary-600)] text-[var(--primary-700)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Radio className="h-4 w-4" />
            <span>Message Logs &amp; Delivery</span>
            <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {messages.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('INBOX')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'INBOX'
                ? 'border-[var(--primary-600)] text-[var(--primary-700)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Inbox className="h-4 w-4" />
            <span>Shared Reply Inbox</span>
            {unreadInboxCount > 0 && (
              <span className="rounded-full bg-[var(--accent-100)] px-2 py-0.5 text-xs font-bold text-[var(--accent-700)]">
                {unreadInboxCount} unread
              </span>
            )}
          </button>
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

        {/* TAB 1: MESSAGE LOGS */}
        {activeTab === 'LOGS' && (
          <>
            {/* Failed Messages Banner (WORKFLOWS.md § 13) */}
            {failedMessages.length > 0 && (
              <div className="mb-6 rounded-2xl border border-[var(--error-200)] bg-[var(--error-50)] p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-red-900">
                        {failedMessages.length} Outbound Delivery Failure{failedMessages.length !== 1 ? 's' : ''}
                      </h3>
                      <p className="text-xs text-red-700">
                        Messages that failed provider delivery after retries. You can manually re-trigger delivery or contact parents directly.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setStatusFilter('FAILED')}
                    className="h-8 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    View Failed Queue
                  </button>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Delivered</div>
                <div className="mt-1 text-2xl font-bold text-[var(--primary-600)]">{deliveredCount}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Inbound Inquiries</div>
                <div className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{inboundCount}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Skipped (Opt-out)</div>
                <div className="mt-1 text-2xl font-bold text-[var(--accent-600)]">{skippedCount}</div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Failed Deliveries</div>
                <div className="mt-1 text-2xl font-bold text-red-600">{failedMessages.length}</div>
              </div>
            </div>

            {/* Filters */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by phone, template, or message content…"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2 px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="">All Directions</option>
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound Replies</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] py-2 px-3 text-sm text-[var(--text-primary)]"
              >
                <option value="">All Statuses</option>
                <option value="DELIVERED">Delivered</option>
                <option value="SENT">Sent</option>
                <option value="FAILED">Failed</option>
                <option value="SKIPPED">Skipped (Opt-Out)</option>
                <option value="RECEIVED">Received</option>
              </select>
              {(search || statusFilter || directionFilter) && (
                <button
                  onClick={() => { setSearch(''); setStatusFilter(''); setDirectionFilter('') }}
                  className="flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>

            {/* Message Log Table */}
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-sm">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary-200)] border-t-transparent" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <MessageSquare className="mb-2 h-10 w-10 text-[var(--text-muted)]" />
                  <p className="font-semibold text-[var(--text-primary)]">No messages found</p>
                  <p className="text-xs text-[var(--text-secondary)]">Messages dispatched from alerts, dues, or receipts will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-1)]">
                        {['Timestamp', 'Direction', 'Recipient Phone', 'Template / Purpose', 'Message Content', 'Status / Attempts', 'Actions'].map((h) => (
                          <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {messages.map((m, idx) => (
                        <tr
                          key={m.id}
                          className={`border-b border-[var(--border)] ${idx % 2 === 0 ? 'bg-[var(--surface-2)]' : 'bg-[var(--surface-1)]'}`}
                        >
                          <td className="px-4 py-3 text-xs font-mono whitespace-nowrap text-[var(--text-secondary)]">
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{' '}
                            <span className="text-[10px] text-[var(--text-muted)]">
                              {new Date(m.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                                m.direction === 'OUTBOUND'
                                  ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-200)]'
                                  : 'bg-[var(--accent-50)] text-[var(--accent-700)] border border-[var(--accent-200)]'
                              }`}
                            >
                              {m.direction}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-[var(--text-primary)]">
                            {m.recipientPhone}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-[var(--primary-700)]">
                            {m.templateName || (m.direction === 'INBOUND' ? 'Inbound Reply' : 'Freeform')}
                          </td>
                          <td className="px-4 py-3 max-w-sm truncate text-xs text-[var(--text-primary)]" title={m.body}>
                            {m.body}
                            {m.error && <div className="text-[11px] font-medium text-red-600 mt-0.5">Error: {m.error}</div>}
                            {m.skipReason && <div className="text-[11px] font-medium text-amber-600 mt-0.5">{m.skipReason}</div>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              {getStatusBadge(m.status)}
                              <span className="text-[10px] text-[var(--text-muted)]">
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
          </>
        )}

        {/* TAB 2: SHARED REPLY INBOX */}
        {activeTab === 'INBOX' && (
          <div className="space-y-4">
            {/* Inbox Triage Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">Shared Parent Reply Inbox</h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Parent inquiries routed here with 24-hour Meta service window tracking and auto-escalation
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-muted)]">Filter:</span>
                {['', 'UNREAD', 'IN_PROGRESS', 'RESOLVED'].map((status) => (
                  <button
                    key={status}
                    onClick={() => setInboxStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      inboxStatusFilter === status
                        ? 'bg-[var(--primary-600)] text-white'
                        : 'border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {status || 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Inbox Message List */}
            {inboxLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary-200)] border-t-transparent" />
              </div>
            ) : inboxItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
                <Inbox className="mb-2 h-10 w-10 text-[var(--text-muted)]" />
                <p className="font-semibold text-[var(--text-primary)]">Shared Inbox is clear!</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Inbound replies from parents will show here for branch triage.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {inboxItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] shadow-xs transition-shadow hover:shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-50)] text-[var(--primary-700)] font-bold text-xs">
                          {item.cadetName ? item.cadetName.charAt(0) : 'G'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[var(--text-primary)]">
                              {item.cadetName || 'Guardian'}
                            </span>
                            {item.studentCode && (
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--surface-1)] text-[var(--text-secondary)] border border-[var(--border)]">
                                {item.studentCode}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs text-[var(--text-muted)]">{item.recipientPhone}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Escalation Badge */}
                        {item.escalationLevel === 'ADMIN' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-red-100 text-red-800 border border-red-300">
                            <AlertTriangle className="h-3 w-3" /> Escalated to ADMIN (&gt;48h)
                          </span>
                        )}
                        {item.escalationLevel === 'MANAGER' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            <AlertTriangle className="h-3 w-3" /> Escalated to MANAGER (&gt;24h)
                          </span>
                        )}

                        {/* 24-Hour WhatsApp Service Window Badge */}
                        {item.canFreeFormReply ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--success-50)] text-[var(--success-700)] border border-[var(--success-200)]">
                            <Clock className="h-3 w-3" /> 24h Window Open ({24 - item.hoursAgo}h left)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-[var(--accent-50)] text-[var(--accent-700)] border border-[var(--accent-200)]">
                            <Clock className="h-3 w-3" /> 24h Window Expired (Template Required)
                          </span>
                        )}

                        {/* Triage Status Dropdown */}
                        <select
                          value={item.inboxStatus || 'UNREAD'}
                          onChange={(e) =>
                            handleUpdateInboxStatus(item, e.target.value as 'UNREAD' | 'IN_PROGRESS' | 'RESOLVED')
                          }
                          className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)]"
                        >
                          <option value="UNREAD">UNREAD</option>
                          <option value="IN_PROGRESS">IN PROGRESS</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
                      </div>
                    </div>

                    {/* Message Body */}
                    <div className="p-3.5 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-sm text-[var(--text-primary)]">
                      {item.body}
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-[var(--text-muted)]">
                        Received {item.hoursAgo === 0 ? 'just now' : `${item.hoursAgo}h ago`} ·{' '}
                        {new Date(item.createdAt).toLocaleString()}
                      </span>

                      <button
                        onClick={() => {
                          setReplyingItem(item)
                          setReplyText('')
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--primary-600)] hover:bg-[var(--primary-700)] shadow-xs transition-colors"
                      >
                        <Reply className="h-3.5 w-3.5" />
                        <span>Reply</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Broadcast Notice Modal (Step 1.15) */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-[var(--surface-2)] shadow-2xl overflow-hidden border border-[var(--border)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-100)] text-[var(--primary-600)]">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">Broadcast WhatsApp Notice</h2>
                  <p className="text-xs text-[var(--text-muted)]">Meta template notice_broadcast (WORKFLOWS.md § 4)</p>
                </div>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchNotice} className="p-6 space-y-4">
              {/* Live Recipient Preview Strip */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    Recipient Compliance Preview
                  </span>
                  {previewLoading && <span className="text-xs text-[var(--text-muted)]">Calculating…</span>}
                </div>

                {noticePreview ? (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-center">
                      <div className="text-[11px] text-[var(--text-muted)]">Total Cadets</div>
                      <div className="text-lg font-bold text-[var(--text-primary)]">{noticePreview.totalCadets}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--primary-50)] border border-[var(--primary-200)] text-center">
                      <div className="text-[11px] font-medium text-[var(--primary-700)]">Opted-In (Will Receive)</div>
                      <div className="text-lg font-bold text-[var(--primary-700)]">{noticePreview.optedInCount}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-center">
                      <div className="text-[11px] text-[var(--text-muted)]">Opted-Out (Skipped)</div>
                      <div className="text-lg font-bold text-[var(--text-muted)]">{noticePreview.optedOutCount}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--text-muted)]">Loading preview...</div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Headline *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ground Waterlogged - Morning Nets Cancelled"
                  value={broadcastHeadline}
                  onChange={(e) => setBroadcastHeadline(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Notice Details *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Heavy rain overnight has rendered the pitch unplayable. All outdoor sessions cancelled."
                  value={broadcastDetails}
                  onChange={(e) => setBroadcastDetails(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>

              {/* Rain / Session Cancellation Option */}
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-1)] flex items-start gap-3">
                <input
                  type="checkbox"
                  id="cancelSessionCheck"
                  checked={cancelSessions}
                  onChange={(e) => setCancelSessions(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--primary-600)] focus:ring-[var(--primary-500)]"
                />
                <label htmlFor="cancelSessionCheck" className="text-xs cursor-pointer">
                  <span className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                    <CloudRain className="h-3.5 w-3.5 text-[var(--primary-600)]" /> Automatically Mark Today&apos;s Sessions Cancelled
                  </span>
                  <span className="text-[var(--text-muted)] block mt-0.5">
                    Suppresses coach attendance expectations and ensures NO automated absence alerts fire for parents.
                  </span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchingNotice}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--primary-600)] hover:bg-[var(--primary-700)] disabled:opacity-50"
                >
                  {dispatchingNotice ? 'Dispatching…' : 'Confirm & Dispatch Notice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reply Modal (Step 1.15) */}
      {replyingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-2)] shadow-2xl overflow-hidden border border-[var(--border)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
              <div className="flex items-center gap-2">
                <Reply className="h-4 w-4 text-[var(--primary-600)]" />
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Reply to {replyingItem.cadetName || replyingItem.recipientPhone}
                </h2>
              </div>
              <button onClick={() => setReplyingItem(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSendReply} className="p-6 space-y-4">
              <div className="p-3 rounded-xl bg-[var(--surface-1)] border border-[var(--border)] text-xs text-[var(--text-secondary)]">
                <div className="font-semibold text-[var(--text-muted)] mb-1">Inbound Parent Message:</div>
                <div className="italic text-[var(--text-primary)]">&ldquo;{replyingItem.body}&rdquo;</div>
              </div>

              {/* Service Window Policy Notice */}
              {replyingItem.canFreeFormReply ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--success-50)] text-[var(--success-700)] text-xs font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>24-Hour customer service window is active. Free-form text reply permitted.</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[var(--accent-50)] border border-[var(--accent-200)] text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-[var(--accent-800)]">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>24-Hour window expired ({replyingItem.hoursAgo}h ago).</span>
                  </div>
                  <p className="text-[var(--accent-700)]">
                    Per Meta WhatsApp policy, customer service replies outside 24h must use an approved Meta template.
                  </p>
                  <select
                    value={replyTemplate}
                    onChange={(e) => setReplyTemplate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value="notice_broadcast">notice_broadcast (Approved Template)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Reply Message *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Type your response to the parent…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReplyingItem(null)}
                  className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingReply}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--primary-600)] hover:bg-[var(--primary-700)] disabled:opacity-50"
                >
                  {sendingReply ? 'Sending…' : 'Send Reply & Resolve'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Test Single Message Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--surface-2)] shadow-2xl overflow-hidden border border-[var(--border)]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-1)]">
              <h2 className="text-base font-bold text-[var(--text-primary)]">Send WhatsApp Test Template</h2>
              <button onClick={() => setShowSendModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSendMessage} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Recipient WhatsApp Number *</label>
                <input
                  type="text"
                  required
                  placeholder="+919876543210"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
                <span className="text-[11px] text-[var(--text-muted)] mt-1 block">
                  Tip: Ending with 0000 simulates network gateway failure for test retries.
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">Template *</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  {templates.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name} — {t.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Variables */}
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-1)] p-3 space-y-2">
                <div className="text-xs font-semibold text-[var(--text-secondary)]">Template Variables Preview</div>
                {selectedTemplate === 'notice_broadcast' && (
                  <>
                    <input
                      placeholder="Headline"
                      value={templateVars.headline || ''}
                      onChange={(e) => setTemplateVars({ ...templateVars, headline: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-primary)]"
                    />
                    <input
                      placeholder="Details"
                      value={templateVars.details || ''}
                      onChange={(e) => setTemplateVars({ ...templateVars, details: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-primary)]"
                    />
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-[var(--primary-600)] hover:bg-[var(--primary-700)] disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Queue & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
