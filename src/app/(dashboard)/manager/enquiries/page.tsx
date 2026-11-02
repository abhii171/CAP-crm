'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { EnquiryListView, EnquiryItem } from '@/components/enquiries/enquiry-list-view'
import { EnquiryBoardView } from '@/components/enquiries/enquiry-board-view'
import {
  Users,
  Plus,
  RefreshCw,
  LayoutGrid,
  List as ListIcon,
  ChevronDown,
  Filter,
  X,
  UserCheck,
} from 'lucide-react'

type ListViewFilter = 'ALL' | 'ALL_OPEN' | 'MY_ENQUIRIES' | 'UNASSIGNED' | 'OVERDUE' | 'CONVERTED' | 'LOST'

const LIST_VIEWS: Array<{ id: ListViewFilter; label: string }> = [
  { id: 'ALL', label: 'All enquiries' },
  { id: 'ALL_OPEN', label: 'All open' },
  { id: 'MY_ENQUIRIES', label: 'My enquiries' },
  { id: 'UNASSIGNED', label: 'Unassigned' },
  { id: 'OVERDUE', label: 'Overdue follow-ups' },
  { id: 'CONVERTED', label: 'Converted' },
  { id: 'LOST', label: 'Lost' },
]

export default function ManagerEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table')
  const [selectedListView, setSelectedListView] = useState<ListViewFilter>('ALL')
  const [showAddModal, setShowAddModal] = useState(false)

  // Meta state
  const [branches, setBranches] = useState<Array<{ id: string; name: string; code: string }>>([])
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; role?: string }>>([])
  const [currentUser, setCurrentUser] = useState<{ role: string; branchId: string | null; userId?: string } | null>(null)

  // Capture Lead Form state
  const [formData, setFormData] = useState({
    branchId: '',
    childName: '',
    guardianName: '',
    phone: '',
    childAgeYears: '',
    source: 'WALK_IN',
    status: 'NEW',
    assignedToUserId: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Initial fetch for session, branches, staff
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.user) {
          setCurrentUser(data.user)
          setFormData((prev) => ({
            ...prev,
            branchId: data.user.branchId || prev.branchId,
            assignedToUserId: data.user.userId || '',
          }))
        }
      })
      .catch(() => {})

    fetch('/api/branches')
      .then((res) => res.json())
      .then((data) => {
        if (data.branches && Array.isArray(data.branches)) {
          setBranches(data.branches)
        }
      })
      .catch(() => {})

    fetch('/api/users')
      .then((res) => res.json())
      .then((data) => {
        if (data.users && Array.isArray(data.users)) {
          setStaffList(data.users.filter((u: any) => u.isActive !== false))
        }
      })
      .catch(() => {})
  }, [])

  // Fetch enquiries
  const fetchEnquiries = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/enquiries')
      const data = await res.json()
      if (data.success && Array.isArray(data.enquiries)) {
        setEnquiries(data.enquiries)
      } else {
        throw new Error(data.error || 'Failed to fetch enquiries')
      }
    } catch (err: any) {
      setError(err.message || 'Network error while fetching leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEnquiries()
  }, [fetchEnquiries])

  // Filter leads based on selected List-View Dropdown
  const filteredEnquiries = useMemo(() => {
    const now = Date.now()
    return enquiries.filter((item) => {
      switch (selectedListView) {
        case 'ALL_OPEN':
          return item.status !== 'CONVERTED' && item.status !== 'LOST'
        case 'MY_ENQUIRIES':
          return (
            currentUser?.userId &&
            item.assignedToUserId === currentUser.userId &&
            item.status !== 'CONVERTED' &&
            item.status !== 'LOST'
          )
        case 'UNASSIGNED':
          return !item.assignedToUserId && item.status !== 'CONVERTED' && item.status !== 'LOST'
        case 'OVERDUE':
          return (
            item.nextFollowUpAt &&
            new Date(item.nextFollowUpAt).getTime() < now &&
            item.status !== 'CONVERTED' &&
            item.status !== 'LOST'
          )
        case 'LOST':
          return item.status === 'LOST'
        case 'CONVERTED':
          return item.status === 'CONVERTED'
        case 'ALL':
        default:
          return true
      }
    })
  }, [enquiries, selectedListView, currentUser])

  // Handle Create Enquiry
  const handleCreateEnquiry = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: formData.branchId || undefined,
          childName: formData.childName.trim(),
          guardianName: formData.guardianName.trim() || undefined,
          phone: formData.phone.trim(),
          childAgeYears: formData.childAgeYears ? parseInt(formData.childAgeYears) : undefined,
          source: formData.source,
          status: formData.status,
          assignedToUserId: formData.assignedToUserId || undefined,
          notes: formData.notes.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to capture enquiry')
      }

      setShowAddModal(false)
      setFormData((prev) => ({
        ...prev,
        childName: '',
        guardianName: '',
        phone: '',
        childAgeYears: '',
        source: 'WALK_IN',
        notes: '',
      }))
      await fetchEnquiries()
    } catch (err: any) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const currentViewLabel =
    LIST_VIEWS.find((v) => v.id === selectedListView)?.label || 'All open'

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="dashboard-container max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Salesforce Leads Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
                Enquiries
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Own branch only
              </span>
            </div>

            {/* List-View Dropdown */}
            <div className="flex items-center gap-2 pt-0.5">
              <label htmlFor="list-view-select" className="text-xs text-[var(--text-muted)] font-medium">
                View:
              </label>
              <div className="relative inline-block">
                <select
                  id="list-view-select"
                  value={selectedListView}
                  onChange={(e) => setSelectedListView(e.target.value as ListViewFilter)}
                  className="appearance-none bg-[var(--surface-2)] border border-[var(--border)] rounded-md pl-3 pr-8 py-1 text-xs font-semibold text-[var(--text)] hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  {LIST_VIEWS.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Table / Board View Toggle */}
            <div className="flex items-center bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-0.5">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
                title="Table View"
              >
                <ListIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
                title="Kanban Board"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Board</span>
              </button>
            </div>

            {/* Refresh */}
            <button
              onClick={fetchEnquiries}
              className="p-1.5 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
              title="Refresh leads"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* New Enquiry Button */}
            <button
              onClick={() => setShowAddModal(true)}
              className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Enquiry</span>
            </button>
          </div>
        </div>

        {/* Views */}
        {viewMode === 'table' ? (
          <EnquiryListView
            enquiries={filteredEnquiries}
            loading={loading}
            error={error}
            staffList={staffList}
            baseDetailUrl="/manager/enquiries"
            onRefresh={fetchEnquiries}
          />
        ) : (
          <EnquiryBoardView
            enquiries={enquiries}
            loading={loading}
            baseDetailUrl="/manager/enquiries"
            onRefresh={fetchEnquiries}
          />
        )}

        {/* Capture New Enquiry Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-[var(--text)]">Capture New Enquiry</h3>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-2.5 rounded text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreateEnquiry} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Child / Cadet Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.childName}
                      onChange={(e) => setFormData({ ...formData, childName: e.target.value })}
                      placeholder="e.g. Virat Sharma"
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Parent / Guardian Name
                    </label>
                    <input
                      type="text"
                      value={formData.guardianName}
                      onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                      placeholder="e.g. Ramesh Sharma"
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      WhatsApp Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Child Age (Years)
                    </label>
                    <input
                      type="number"
                      min="4"
                      max="25"
                      value={formData.childAgeYears}
                      onChange={(e) => setFormData({ ...formData, childAgeYears: e.target.value })}
                      placeholder="e.g. 11"
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Source *
                    </label>
                    <select
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    >
                      <option value="WALK_IN">Walk In</option>
                      <option value="PHONE_CALL">Phone Call</option>
                      <option value="WHATSAPP_INBOUND">WhatsApp Inbound</option>
                      <option value="WEBSITE">Website Form</option>
                      <option value="REFERRAL">Referral</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Initial Status *
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    >
                      <option value="NEW">New Enquiry</option>
                      <option value="CONTACTED">Contacted</option>
                      <option value="TRIAL_SCHEDULED">Trial Scheduled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                      Assign To Staff
                    </label>
                    <select
                      value={formData.assignedToUserId}
                      onChange={(e) => setFormData({ ...formData, assignedToUserId: e.target.value })}
                      className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Notes & Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Parent's interest, bat/ball skill, trial availability..."
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Enquiry'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
