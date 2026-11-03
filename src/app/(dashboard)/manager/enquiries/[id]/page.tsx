'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard-header'
import { EnquiryStagePath, PATH_STAGES, EnquiryStage } from '@/components/enquiries/enquiry-stage-path'
import { LOST_REASONS } from '@/components/enquiries/enquiry-board-view'
import {
  ChevronLeft,
  Phone,
  User,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Edit2,
  X,
  MessageSquare,
  Building2,
  Tag,
  FileText,
  UserCog,
  History,
} from 'lucide-react'

interface EnquiryDetail {
  id: string
  branchId: string
  branchName?: string
  childName: string
  guardianName?: string | null
  phone: string
  email?: string | null
  childAgeYears?: number | null
  status: EnquiryStage
  source: string
  createdVia?: string
  notes?: string | null
  nextFollowUpAt?: string | null
  lastContactedAt?: string | null
  convertedAt?: string | null
  assignedToUserId?: string | null
  version: number
  createdAt: string
  updatedAt?: string
}

interface FollowUpItem {
  id: string
  dueAt: string
  channel: string
  note?: string | null
  outcome?: string | null
  doneAt?: string | null
  createdAt: string
}

export default function ManagerEnquiryRecordPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [enquiry, setEnquiry] = useState<EnquiryDetail | null>(null)
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([])
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Stage transition loader
  const [updatingStage, setUpdatingStage] = useState(false)

  // Add Follow-up modal
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [followUpChannel, setFollowUpChannel] = useState('PHONE')
  const [followUpDueAt, setFollowUpDueAt] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [savingFollowUp, setSavingFollowUp] = useState(false)

  // Lost modal
  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReasonId, setLostReasonId] = useState(LOST_REASONS[0].id)
  const [lostNote, setLostNote] = useState('')
  const [submittingLost, setSubmittingLost] = useState(false)

  // Edit Enquiry modal
  const [showEditModal, setShowEditModal] = useState(false)
  const [editChildName, setEditChildName] = useState('')
  const [editGuardianName, setEditGuardianName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAge, setEditAge] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Reassign modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignToUserId, setAssignToUserId] = useState('')
  const [assignNote, setAssignNote] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  // Assignment History modal
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [assignHistory, setAssignHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const showToastMsg = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4500)
  }

  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch enquiry directly
      const enqRes = await fetch(`/api/enquiries/${id}`)
      const enqData = await enqRes.json()
      if (enqData.success && enqData.enquiry) {
        const found = enqData.enquiry
        setEnquiry(found)
        setEditChildName(found.childName || '')
        setEditGuardianName(found.guardianName || '')
        setEditPhone(found.phone || '')
        setEditAge(found.childAgeYears ? String(found.childAgeYears) : '')
        setEditNotes(found.notes || '')
      } else {
        // Fallback to searching enquiry list
        const listRes = await fetch('/api/enquiries')
        const listData = await listRes.json()
        const found = listData.enquiries?.find((e: EnquiryDetail) => e.id === id)
        if (found) {
          setEnquiry(found)
          setEditChildName(found.childName || '')
          setEditGuardianName(found.guardianName || '')
          setEditPhone(found.phone || '')
          setEditAge(found.childAgeYears ? String(found.childAgeYears) : '')
          setEditNotes(found.notes || '')
        } else {
          setError(enqData.error || 'Enquiry record not found.')
        }
      }

      // 2. Fetch follow-ups
      const fuRes = await fetch(`/api/enquiries/${id}/follow-ups`)
      const fuData = await fuRes.json()
      if (fuData.success && Array.isArray(fuData.followUps)) {
        setFollowUps(fuData.followUps)
      }

      // 3. Fetch staff
      const staffRes = await fetch('/api/users')
      const staffData = await staffRes.json()
      if (staffData.users && Array.isArray(staffData.users)) {
        setStaffList(staffData.users)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load record details.')
    } finally {
      setLoading(false)
    }
  }, [id])

  const handleSaveEdit = async () => {
    if (!enquiry) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/enquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childName: editChildName.trim(),
          guardianName: editGuardianName.trim() || undefined,
          phone: editPhone.trim(),
          childAgeYears: editAge ? parseInt(editAge) : undefined,
          notes: editNotes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update lead details')
      }
      setEnquiry(data.enquiry)
      setShowEditModal(false)
      showToastMsg('Lead details updated successfully', 'success')
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message || 'Error updating lead', 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleAssign = async () => {
    if (!enquiry || !assignToUserId) return
    setSavingAssign(true)
    try {
      const res = await fetch(`/api/enquiries/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUserId: assignToUserId, note: assignNote.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reassign')
      setShowAssignModal(false)
      setAssignNote('')
      showToastMsg('Assignment updated successfully', 'success')
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message || 'Error updating assignment', 'error')
    } finally {
      setSavingAssign(false)
    }
  }

  const handleLoadHistory = async () => {
    setShowHistoryModal(true)
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/enquiries/${id}/assign-history`)
      const data = await res.json()
      if (data.success) setAssignHistory(data.history || [])
    } catch {
      // silently fail – modal will show empty state
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [loadData])

  // Advance to next valid stage
  const handleMarkStageComplete = async () => {
    if (!enquiry) return
    const curIdx = PATH_STAGES.findIndex((s) => s.key === enquiry.status)
    if (curIdx < 0 || curIdx >= PATH_STAGES.length - 1) return

    const nextStage = PATH_STAGES[curIdx + 1].key
    setUpdatingStage(true)

    try {
      const res = await fetch(`/api/enquiries/${enquiry.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: nextStage,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to transition stage')
      }

      showToastMsg(`Stage advanced to ${nextStage}`, 'success')
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message, 'error')
    } finally {
      setUpdatingStage(false)
    }
  }

  // Click direct stage chevron to move stage forward
  const handleSelectStage = async (targetStage: EnquiryStage) => {
    if (!enquiry || targetStage === enquiry.status) return

    if (enquiry.status === 'CONVERTED') {
      showToastMsg('This enquiry has already been converted to a cadet.', 'success')
      return
    }

    if (targetStage === 'LOST') {
      setShowLostModal(true)
      return
    }

    setUpdatingStage(true)
    try {
      const res = await fetch(`/api/enquiries/${enquiry.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: targetStage,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update stage')
      }

      showToastMsg(`Stage moved to ${targetStage.replace(/_/g, ' ')}`, 'success')
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message, 'error')
    } finally {
      setUpdatingStage(false)
    }
  }

  // Handle Mark Lost
  const handleConfirmLost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enquiry) return

    setSubmittingLost(true)
    try {
      const res = await fetch(`/api/enquiries/${enquiry.id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toStatus: 'LOST',
          expectedVersion: enquiry.version,
          lostReasonId,
          lostNote: lostNote.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to mark as lost')
      }

      showToastMsg('Enquiry marked as Lost', 'success')
      setShowLostModal(false)
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message, 'error')
    } finally {
      setSubmittingLost(false)
    }
  }

  // Handle Add Follow-up
  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enquiry || !followUpDueAt) return

    setSavingFollowUp(true)
    try {
      const res = await fetch(`/api/enquiries/${enquiry.id}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: followUpChannel,
          dueAt: new Date(followUpDueAt).toISOString(),
          note: followUpNote.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to schedule follow-up')
      }

      showToastMsg('Follow-up scheduled successfully', 'success')
      setShowFollowUpModal(false)
      setFollowUpNote('')
      setFollowUpDueAt('')
      await loadData()
    } catch (err: any) {
      showToastMsg(err.message, 'error')
    } finally {
      setSavingFollowUp(false)
    }
  }

  const assignedStaff = enquiry?.assignedToUserId
    ? staffList.find((s) => s.id === enquiry.assignedToUserId)?.name || 'Assigned Staff'
    : 'Unassigned'

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <DashboardHeader />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Link
            href="/manager/enquiries"
            className="flex items-center gap-1 hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Back to Enquiries</span>
          </Link>
          <span>/</span>
          <span className="text-[var(--text)] font-medium">
            {enquiry?.childName || 'Lead Record'}
          </span>
        </div>

        {/* Toast Alert */}
        {toast && (
          <div
            className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-2 ${
              toast.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button onClick={() => setToast(null)} className="cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <div className="h-28 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
            <div className="h-16 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
              <div className="h-96 bg-[var(--surface)] border border-[var(--border)] rounded-lg animate-pulse" />
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="border border-rose-500/30 bg-rose-500/10 rounded-lg p-10 text-center text-rose-400 space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto" />
            <p className="text-base font-semibold">{error}</p>
            <Link
              href="/manager/enquiries"
              className="inline-block px-4 py-2 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium"
            >
              Return to Enquiries List
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && !error && enquiry && (
          <>
            {/* Highlights Panel */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 sm:p-6 space-y-4 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Lead Headline */}
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text)]">
                      {enquiry.childName}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      {enquiry.status.replace(/_/g, ' ')}
                    </span>
                    {enquiry.childAgeYears && (
                      <span className="text-xs text-[var(--text-muted)] bg-[var(--surface-2)] px-2 py-0.5 rounded border border-[var(--border)]">
                        {enquiry.childAgeYears} years old
                      </span>
                    )}
                  </div>
                  {enquiry.guardianName && (
                    <p className="text-xs text-[var(--text-muted)]">
                      Guardian: <span className="text-[var(--text)] font-medium">{enquiry.guardianName}</span>
                    </p>
                  )}
                </div>

                {/* Top Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] text-[var(--text)] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => { setAssignToUserId(enquiry.assignedToUserId || ''); setAssignNote(''); setShowAssignModal(true) }}
                    className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] text-[var(--text)] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    <span>Edit Assignment</span>
                  </button>
                  <button
                    onClick={handleLoadHistory}
                    className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs font-medium hover:bg-[var(--surface-2)] text-[var(--text)] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Assignment History</span>
                  </button>
                  <button
                    onClick={() => setShowFollowUpModal(true)}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Add Follow-up</span>
                  </button>
                  {enquiry.status !== 'LOST' && enquiry.status !== 'CONVERTED' && (
                    <button
                      onClick={() => setShowLostModal(true)}
                      className="px-3 py-1.5 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Mark Lost</span>
                    </button>
                  )}
                  {/* Disabled Placeholders */}
                  <button
                    disabled
                    title="Phase 1 Trial Scheduling module"
                    className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs text-[var(--text-muted)] opacity-40 cursor-not-allowed"
                  >
                    Book Trial
                  </button>
                  <button
                    disabled
                    title="Phase 1 Admission Conversion"
                    className="px-3 py-1.5 rounded-md border border-[var(--border)] text-xs text-[var(--text-muted)] opacity-40 cursor-not-allowed"
                  >
                    Convert
                  </button>
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-[var(--border)] text-xs">
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Phone</span>
                  <div className="flex items-center gap-1 text-[var(--text)] font-mono font-medium mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{enquiry.phone}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Assigned Owner</span>
                  <div className="flex items-center gap-1 text-[var(--text)] font-medium mt-0.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{assignedStaff}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Source</span>
                  <span className="text-[var(--text)] font-medium block mt-0.5 capitalize">
                    {enquiry.source?.toLowerCase().replace(/_/g, ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Next Follow-up</span>
                  <span className="text-[var(--text)] font-medium block mt-0.5">
                    {enquiry.nextFollowUpAt
                      ? new Date(enquiry.nextFollowUpAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'None scheduled'}
                  </span>
                </div>
              </div>
            </div>

            {/* Stage Path Bar */}
            <EnquiryStagePath
              currentStage={enquiry.status}
              onSelectStage={handleSelectStage}
              onMarkComplete={handleMarkStageComplete}
              isUpdating={updatingStage}
            />

            {/* Two Column Layout: Details (Left) + Activity Timeline (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Details */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
                  <h2 className="text-sm font-bold text-[var(--text)] border-b border-[var(--border)] pb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    Lead Details
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Child Full Name</span>
                      <span className="font-semibold text-[var(--text)]">{enquiry.childName}</span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Parent / Guardian Name</span>
                      <span className="font-semibold text-[var(--text)]">
                        {enquiry.guardianName || '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">WhatsApp Phone Number</span>
                      <span className="font-mono text-[var(--text)]">{enquiry.phone}</span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Email Address</span>
                      <span className="text-[var(--text)]">{enquiry.email || '—'}</span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Age (Years)</span>
                      <span className="text-[var(--text)]">
                        {enquiry.childAgeYears ? `${enquiry.childAgeYears} years` : '—'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Inbound Channel / Source</span>
                      <span className="text-[var(--text)] capitalize">
                        {enquiry.source?.toLowerCase().replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Creation Method</span>
                      <span className="text-[var(--text)]">{enquiry.createdVia || 'Direct Entry'}</span>
                    </div>

                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Lead Version</span>
                      <span className="text-[var(--text)] font-mono">v{enquiry.version}</span>
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="pt-3 border-t border-[var(--border)]">
                    <span className="text-[var(--text-muted)] block text-[11px] mb-1">
                      Notes & Intake Remarks
                    </span>
                    <p className="text-xs text-[var(--text)] bg-[var(--surface-2)] p-3 rounded border border-[var(--border)] whitespace-pre-wrap">
                      {enquiry.notes || 'No remarks captured during intake.'}
                    </p>
                  </div>
                </div>

                {/* System Timestamps Card */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
                  <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    System Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Created Date</span>
                      <span className="text-[var(--text)]">
                        {new Date(enquiry.createdAt).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Last Contacted</span>
                      <span className="text-[var(--text)]">
                        {enquiry.lastContactedAt
                          ? new Date(enquiry.lastContactedAt).toLocaleString('en-IN')
                          : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[var(--text-muted)] block text-[11px]">Conversion Timestamp</span>
                      <span className="text-[var(--text)]">
                        {enquiry.convertedAt
                          ? new Date(enquiry.convertedAt).toLocaleString('en-IN')
                          : 'Not converted'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Activity Timeline */}
              <div className="space-y-4">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      Activity Timeline
                    </h2>
                    <button
                      onClick={() => setShowFollowUpModal(true)}
                      className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log Follow-up</span>
                    </button>
                  </div>

                  {followUps.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[var(--text-muted)] space-y-2">
                      <Clock className="w-8 h-8 mx-auto opacity-30" />
                      <p>No activity or follow-ups logged yet.</p>
                      <button
                        onClick={() => setShowFollowUpModal(true)}
                        className="px-3 py-1.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text)] hover:border-emerald-500 cursor-pointer"
                      >
                        Schedule First Follow-up
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {followUps.map((fu) => {
                        const isDone = Boolean(fu.doneAt)
                        const isPastDue = !isDone && new Date(fu.dueAt).getTime() < Date.now()

                        return (
                          <div
                            key={fu.id}
                            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-md p-3 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-[var(--text)] flex items-center gap-1.5">
                                <span className="capitalize">{fu.channel.toLowerCase()}</span> Follow-up
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                                  isDone
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : isPastDue
                                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                }`}
                              >
                                {isDone ? 'Completed' : isPastDue ? 'Overdue' : 'Scheduled'}
                              </span>
                            </div>

                            {fu.note && (
                              <p className="text-[var(--text-muted)] text-[11px] italic">
                                &ldquo;{fu.note}&rdquo;
                              </p>
                            )}

                            <div className="flex items-center justify-between pt-1 text-[10px] text-[var(--text-muted)] border-t border-[var(--border)]/40">
                              <span>Due: {new Date(fu.dueAt).toLocaleDateString('en-IN')}</span>
                              <span>
                                Created: {new Date(fu.createdAt).toLocaleDateString('en-IN')}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Schedule Follow-up Modal */}
        {showFollowUpModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">Schedule Follow-up</h3>
                <button
                  onClick={() => setShowFollowUpModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateFollowUp} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Channel *
                  </label>
                  <select
                    value={followUpChannel}
                    onChange={(e) => setFollowUpChannel(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PHONE">Phone Call</option>
                    <option value="WHATSAPP">WhatsApp</option>
                    <option value="IN_PERSON">In Person Visit</option>
                    <option value="EMAIL">Email</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Due Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={followUpDueAt}
                    onChange={(e) => setFollowUpDueAt(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Follow-up Instructions / Notes
                  </label>
                  <textarea
                    rows={2}
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                    placeholder="e.g. Call parent to confirm slot for trial match..."
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowFollowUpModal(false)}
                    className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingFollowUp}
                    className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {savingFollowUp ? 'Scheduling...' : 'Save Follow-up'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Mark Lost Modal */}
        {showLostModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">Mark Lead as Lost</h3>
                <button
                  onClick={() => setShowLostModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConfirmLost} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Reason for Loss *
                  </label>
                  <select
                    value={lostReasonId}
                    onChange={(e) => setLostReasonId(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-rose-500"
                  >
                    {LOST_REASONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">
                    Note / Context
                  </label>
                  <textarea
                    rows={2}
                    value={lostNote}
                    onChange={(e) => setLostNote(e.target.value)}
                    placeholder="Details about parent feedback or reason..."
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLostModal(false)}
                    className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingLost}
                    className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {submittingLost ? 'Saving...' : 'Mark as Lost'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reassign Modal */}
        {showAssignModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-emerald-400" />
                  Edit Assignment
                </h3>
                <button onClick={() => setShowAssignModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-[var(--text-muted)] mb-1">Assign To *</label>
                  <select
                    value={assignToUserId}
                    onChange={(e) => setAssignToUserId(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">— Select staff member —</option>
                    {staffList.filter((s: any) => s.isActive !== false).map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}{s.loginId ? ` (${s.loginId})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-muted)] mb-1">Note (optional)</label>
                  <textarea
                    rows={2}
                    value={assignNote}
                    onChange={(e) => setAssignNote(e.target.value)}
                    placeholder="Reason for reassignment..."
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={savingAssign || !assignToUserId}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingAssign ? 'Saving...' : 'Save Assignment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assignment History Modal */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 shadow-xl max-h-[80vh] flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 shrink-0">
                <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  Assignment History
                </h3>
                <button onClick={() => setShowHistoryModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="overflow-y-auto flex-1 space-y-3 pr-1">
                {loadingHistory && (
                  <p className="text-xs text-[var(--text-muted)] text-center py-8">Loading history...</p>
                )}
                {!loadingHistory && assignHistory.length === 0 && (
                  <div className="text-center py-10 space-y-2">
                    <History className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-40" />
                    <p className="text-xs text-[var(--text-muted)]">No assignment history yet.</p>
                  </div>
                )}
                {!loadingHistory && assignHistory.map((entry: any, idx: number) => (
                  <div key={entry.id} className="relative pl-6">
                    {idx < assignHistory.length - 1 && (
                      <span className="absolute left-2 top-5 bottom-0 w-px bg-[var(--border)]" />
                    )}
                    <span className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    </span>
                    <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3 space-y-1 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          entry.actionType === 'INITIAL_ASSIGNMENT'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {entry.actionType === 'INITIAL_ASSIGNMENT' ? 'Initial Assignment' : 'Reassignment'}
                        </span>
                        <span className="text-[var(--text-muted)]">
                          {new Date(entry.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[var(--text)]">
                        {entry.previousUserName
                          ? <><span className="text-[var(--text-muted)]">{entry.previousUserName}</span>{' → '}</>
                          : null}
                        <span className="font-semibold text-emerald-400">{entry.newUserName || '—'}</span>
                      </p>
                      <p className="text-[var(--text-muted)]">by <span className="text-[var(--text)]">{entry.performedByName}</span></p>
                      {entry.note && <p className="text-[var(--text-muted)] italic">"{entry.note}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal Placeholder */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--text)]">Edit Lead Information</h3>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-[var(--text-muted)] mb-1">Child Name</label>
                  <input
                    type="text"
                    value={editChildName}
                    onChange={(e) => setEditChildName(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-muted)] mb-1">Guardian Name</label>
                  <input
                    type="text"
                    value={editGuardianName}
                    onChange={(e) => setEditGuardianName(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[var(--text-muted)] mb-1">Phone</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 rounded border border-[var(--border)] text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

