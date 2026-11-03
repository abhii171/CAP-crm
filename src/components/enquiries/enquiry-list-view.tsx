'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Phone,
  Calendar,
  User,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react'

export interface EnquiryItem {
  id: string
  branchId: string
  branchName?: string
  childName: string
  guardianName?: string | null
  phone: string
  email?: string | null
  childAgeYears?: number | null
  status: 'NEW' | 'CONTACTED' | 'TRIAL_SCHEDULED' | 'TRIAL_DONE' | 'CONVERTED' | 'LOST'
  source: string
  createdVia?: string
  createdAt: string
  nextFollowUpAt?: string | null
  assignedToUserId?: string | null
  version: number
}

interface StaffUser {
  id: string
  name: string
  role?: string
}

interface BranchMeta {
  id: string
  name: string
  code?: string
}

interface EnquiryListViewProps {
  enquiries: EnquiryItem[]
  loading?: boolean
  error?: string | null
  staffList?: StaffUser[]
  branches?: BranchMeta[]
  showBranch?: boolean
  baseDetailUrl?: string // e.g. "/manager/enquiries" or "/admin/enquiries"
  onRefresh?: () => void
}

type SortField = 'childName' | 'phone' | 'branchId' | 'source' | 'status' | 'assignedToUserId' | 'nextFollowUpAt' | 'createdAt'
type SortOrder = 'asc' | 'desc'

const STAGE_CONFIG: Record<
  EnquiryItem['status'],
  { label: string; badge: string }
> = {
  NEW: {
    label: 'New Enquiry',
    badge: 'border-neutral-500/30 text-neutral-300 bg-neutral-800/40',
  },
  CONTACTED: {
    label: 'Contacted',
    badge: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
  },
  TRIAL_SCHEDULED: {
    label: 'Trial Scheduled',
    badge: 'border-emerald-600/40 text-emerald-300 bg-emerald-950/30',
  },
  TRIAL_DONE: {
    label: 'Trial Attended',
    badge: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/15',
  },
  CONVERTED: {
    label: 'Converted',
    badge: 'border-green-500/50 text-green-400 bg-green-500/20',
  },
  LOST: {
    label: 'Lost / Closed',
    badge: 'border-rose-500/40 text-rose-400 bg-rose-500/10',
  },
}

export function EnquiryListView({
  enquiries,
  loading = false,
  error = null,
  staffList = [],
  branches = [],
  showBranch = false,
  baseDetailUrl = '/manager/enquiries',
  onRefresh,
}: EnquiryListViewProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  // Reassignment Modal State
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [targetUserId, setTargetUserId] = useState('')
  const [reassignNote, setReassignNote] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignError, setReassignError] = useState<string | null>(null)

  // Map staff id to name
  const staffMap = useMemo(() => {
    const map = new Map<string, string>()
    staffList.forEach((s) => map.set(s.id, s.name))
    return map
  }, [staffList])

  // Map branch id to name
  const branchMap = useMemo(() => {
    const map = new Map<string, string>()
    branches.forEach((b) => map.set(b.id, b.name || b.code || b.id))
    return map
  }, [branches])

  // Filtered & Sorted Enquiries
  const processedEnquiries = useMemo(() => {
    let result = [...enquiries]

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (e) =>
          e.childName?.toLowerCase().includes(q) ||
          e.phone?.includes(q) ||
          (e.guardianName && e.guardianName.toLowerCase().includes(q)) ||
          e.source?.toLowerCase().includes(q) ||
          (showBranch && (branchMap.get(e.branchId)?.toLowerCase().includes(q) || e.branchName?.toLowerCase().includes(q)))
      )
    }

    result.sort((a, b) => {
      let valA: any = a[sortField] || ''
      let valB: any = b[sortField] || ''

      if (sortField === 'nextFollowUpAt') {
        const hasA = Boolean(a.nextFollowUpAt)
        const hasB = Boolean(b.nextFollowUpAt)
        // Null follow-up dates sort last in both ascending and descending order
        if (!hasA && !hasB) return 0
        if (!hasA) return 1
        if (!hasB) return -1
        const timeA = new Date(a.nextFollowUpAt!).getTime()
        const timeB = new Date(b.nextFollowUpAt!).getTime()
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
      }

      if (sortField === 'createdAt') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA
      }

      if (sortField === 'branchId') {
        const nameA = branchMap.get(a.branchId) || a.branchName || a.branchId || ''
        const nameB = branchMap.get(b.branchId) || b.branchName || b.branchId || ''
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
      }

      if (typeof valA === 'string') valA = valA.toLowerCase()
      if (typeof valB === 'string') valB = valB.toLowerCase()

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [enquiries, search, sortField, sortOrder, branchMap, showBranch])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(processedEnquiries.length / pageSize))
  const paginatedEnquiries = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return processedEnquiries.slice(start, start + pageSize)
  }, [processedEnquiries, currentPage, pageSize])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(paginatedEnquiries.map((e) => e.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id])
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id))
    }
  }

  const handleBulkReassign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetUserId) {
      setReassignError('Please select a team member.')
      return
    }

    setReassigning(true)
    setReassignError(null)

    try {
      const res = await fetch('/api/enquiries/reassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enquiryIds: selectedIds,
          targetUserId,
          note: reassignNote.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to reassign enquiries')
      }

      setShowReassignModal(false)
      setSelectedIds([])
      setReassignNote('')
      setTargetUserId('')
      if (onRefresh) onRefresh()
    } catch (err: any) {
      setReassignError(err.message)
    } finally {
      setReassigning(false)
    }
  }

  const isAllSelected =
    paginatedEnquiries.length > 0 &&
    paginatedEnquiries.every((e) => selectedIds.includes(e.id))

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="w-3.5 h-3.5 text-[var(--text-muted)] opacity-40 ml-1 inline" />
    }
    return sortOrder === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-emerald-400 ml-1 inline" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-emerald-400 ml-1 inline" />
    )
  }

  return (
    <div className="space-y-4">
      {/* Search & Meta Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search leads by name, phone, guardian..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-md pl-9 pr-3 py-1.5 text-xs text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="text-xs text-[var(--text-muted)] flex items-center justify-between sm:justify-end gap-2">
          <span>{processedEnquiries.length} items</span>
          <span>•</span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      </div>

      {/* Bulk Action Bar (Docked when items are selected) */}
      {selectedIds.length > 0 && (
        <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold text-emerald-200">
              {selectedIds.length} enquiries selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReassignModal(true)}
              className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Change Owner</span>
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-2.5 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] p-6 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 bg-[var(--surface-2)] rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg p-6 text-center text-rose-400 space-y-2">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="text-sm font-semibold">{error}</p>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-1.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && processedEnquiries.length === 0 && (
        <div className="border border-[var(--border)] rounded-lg bg-[var(--surface)] p-12 text-center text-[var(--text-muted)] space-y-2">
          <Users className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm font-medium text-[var(--text)]">No enquiries found</p>
          <p className="text-xs">
            {search ? 'Try clearing or modifying your search query.' : 'No enquiries are recorded for this list view.'}
          </p>
        </div>
      )}

      {/* Table for Desktop */}
      {!loading && !error && processedEnquiries.length > 0 && (
        <div className="hidden sm:block border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[var(--surface-2)] border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-[var(--border)] bg-[var(--surface)] text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th
                    onClick={() => handleSort('childName')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Name {renderSortIndicator('childName')}
                  </th>
                  <th
                    onClick={() => handleSort('phone')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Phone {renderSortIndicator('phone')}
                  </th>
                  {showBranch && (
                    <th
                      onClick={() => handleSort('branchId')}
                      className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                    >
                      Branch {renderSortIndicator('branchId')}
                    </th>
                  )}
                  <th
                    onClick={() => handleSort('source')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Source {renderSortIndicator('source')}
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Stage {renderSortIndicator('status')}
                  </th>
                  <th
                    onClick={() => handleSort('assignedToUserId')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Owner {renderSortIndicator('assignedToUserId')}
                  </th>
                  <th
                    onClick={() => handleSort('nextFollowUpAt')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Next Follow-up {renderSortIndicator('nextFollowUpAt')}
                  </th>
                  <th
                    onClick={() => handleSort('createdAt')}
                    className="py-2.5 px-3 font-semibold text-[var(--text)] cursor-pointer hover:text-emerald-400 select-none"
                  >
                    Created {renderSortIndicator('createdAt')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {paginatedEnquiries.map((enquiry) => {
                  const stage = STAGE_CONFIG[enquiry.status] || STAGE_CONFIG.NEW
                  const ownerName = enquiry.assignedToUserId
                    ? staffMap.get(enquiry.assignedToUserId) || 'Assigned Staff'
                    : 'Unassigned'
                  const isSelected = selectedIds.includes(enquiry.id)

                  const isOverdue =
                    enquiry.nextFollowUpAt &&
                    new Date(enquiry.nextFollowUpAt).getTime() < Date.now() &&
                    enquiry.status !== 'CONVERTED' &&
                    enquiry.status !== 'LOST'

                  return (
                    <tr
                      key={enquiry.id}
                      className={`hover:bg-[var(--surface-2)]/60 transition-colors ${
                        isSelected ? 'bg-emerald-950/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectRow(enquiry.id, e.target.checked)}
                          className="rounded border-[var(--border)] bg-[var(--surface)] text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`${baseDetailUrl}/${enquiry.id}` as any}
                          className="font-medium text-[var(--text)] hover:text-emerald-400 transition-colors block"
                        >
                          {enquiry.childName}
                          {enquiry.guardianName && (
                            <span className="block text-[11px] text-[var(--text-muted)] font-normal">
                              Guardian: {enquiry.guardianName}
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)]">
                        <div className="flex items-center gap-1.5 font-mono tabular-nums">
                          <Phone className="w-3 h-3 shrink-0 opacity-70" />
                          <span>{enquiry.phone}</span>
                        </div>
                      </td>
                      {showBranch && (
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text)] font-medium bg-[var(--surface-2)] px-2 py-0.5 rounded border border-[var(--border)]">
                            <Building2 className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{branchMap.get(enquiry.branchId) || enquiry.branchName || enquiry.branchId}</span>
                          </span>
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-[var(--text-muted)]">
                        <span className="capitalize">{enquiry.source?.toLowerCase().replace(/_/g, ' ')}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <Link
                          href={`${baseDetailUrl}/${enquiry.id}` as any}
                          title="Open lead to view or advance stage"
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border hover:opacity-85 transition-opacity ${stage.badge}`}
                        >
                          {stage.label}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)]">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 shrink-0 opacity-70" />
                          <span className={enquiry.assignedToUserId ? 'text-[var(--text)]' : 'italic text-[var(--text-muted)]'}>
                            {ownerName}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        {enquiry.nextFollowUpAt ? (
                          <div
                            className={`flex items-center gap-1.5 tabular-nums ${
                              isOverdue ? 'text-rose-400 font-semibold' : 'text-[var(--text-muted)]'
                            }`}
                          >
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>
                              {new Date(enquiry.nextFollowUpAt).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </span>
                            {isOverdue && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/10 border border-rose-500/30">
                                Overdue
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)] italic">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] tabular-nums">
                        {new Date(enquiry.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mobile Card List */}
      {!loading && !error && processedEnquiries.length > 0 && (
        <div className="sm:hidden space-y-3">
          {paginatedEnquiries.map((enquiry) => {
            const stage = STAGE_CONFIG[enquiry.status] || STAGE_CONFIG.NEW
            const ownerName = enquiry.assignedToUserId
              ? staffMap.get(enquiry.assignedToUserId) || 'Assigned Staff'
              : 'Unassigned'
            const isSelected = selectedIds.includes(enquiry.id)

            return (
              <div
                key={enquiry.id}
                className={`p-3.5 rounded-lg border bg-[var(--surface)] space-y-2.5 transition-colors ${
                  isSelected ? 'border-emerald-500 bg-emerald-950/20' : 'border-[var(--border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleSelectRow(enquiry.id, e.target.checked)}
                      className="rounded border-[var(--border)] bg-[var(--surface)] text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <Link
                      href={`${baseDetailUrl}/${enquiry.id}` as any}
                      className="font-semibold text-sm text-[var(--text)] hover:text-emerald-400"
                    >
                      {enquiry.childName}
                    </Link>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${stage.badge}`}>
                    {stage.label}
                  </span>
                </div>

                <div className="text-xs text-[var(--text-muted)] space-y-1 pl-6">
                  {showBranch && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span>{branchMap.get(enquiry.branchId) || enquiry.branchName || enquiry.branchId}</span>
                    </div>
                  )}
                  {enquiry.guardianName && <div>Guardian: {enquiry.guardianName}</div>}
                  <div className="flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{enquiry.phone}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {ownerName}
                    </span>
                    <span>
                      {new Date(enquiry.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 text-xs text-[var(--text-muted)]">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1.5 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Change Owner Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 transition-all">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Change Owner ({selectedIds.length} leads)
              </h3>
              <button
                onClick={() => setShowReassignModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reassignError && (
              <div className="p-2.5 rounded text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400">
                {reassignError}
              </div>
            )}

            <form onSubmit={handleBulkReassign} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Assign to *
                </label>
                <select
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  required
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Select coach / staff member...</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.role ? `(${s.role})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                  Reassignment Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reassignNote}
                  onChange={(e) => setReassignNote(e.target.value)}
                  placeholder="Reason for transferring these leads..."
                  className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReassignModal(false)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {reassigning ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
