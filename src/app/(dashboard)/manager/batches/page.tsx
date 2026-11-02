'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Clock,
  Users,
  Calendar,
  AlertTriangle,
  AlertCircle,
  X,
  Loader2,
  UserCheck,
  UserPlus,
  Trash2,
  Search,
  Check,
  CheckCircle2,
  User,
  Phone,
  RotateCcw,
  Archive,
} from 'lucide-react'

interface Batch {
  id: string
  name: string
  ageGroup?: string | null
  capacity: number
  enrolledCount: number
  daysOfWeek: number[]
  startTime: string
  endTime: string
  isActive: boolean
  currentCoach?: {
    id: string
    name: string
    loginId?: string
    isPrimary?: boolean
  } | null
  coachingStaff?: {
    id: string
    name: string
    loginId?: string
    isPrimary: boolean
  }[]
}

interface CoachOption {
  id: string
  name: string
  loginId: string
  isActive: boolean
}

interface BatchStudent {
  id: string
  studentCode: string
  name: string
  dob: string
  gender?: string | null
  status: 'ACTIVE' | 'INACTIVE'
  joinedOn: string
  guardianName?: string
  guardianPhone?: string
  currentBatch?: { id: string; name: string } | null
}

interface NewCadetDraft {
  name: string
  dob: string
  gender: string
  guardianName: string
  whatsappNumber: string
  notes?: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function ManagerBatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [archivedBatches, setArchivedBatches] = useState<Batch[]>([])
  const [batchTab, setBatchTab] = useState<'active' | 'archived'>('active')
  const [coaches, setCoaches] = useState<CoachOption[]>([])
  const [loading, setLoading] = useState(true)
  const [branchType, setBranchType] = useState<'OWNED' | 'FRANCHISE'>('OWNED')
  const [managerBranchId, setManagerBranchId] = useState('branch-kkp')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Batch Delete & Archive Modal State
  const [deleteModalBatch, setDeleteModalBatch] = useState<Batch | null>(null)
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [restoringBatchId, setRestoringBatchId] = useState<string | null>(null)

  // Toast notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => {
      setToast(null)
    }, 4500)
  }

  // Coaching Staff Modal State
  const [reassignModal, setReassignModal] = useState<{
    batch: Batch
    selectedCoachId: string
    action: 'add_coach' | 'replace_coach'
    isPrimary: boolean
  } | null>(null)
  const [reassigning, setReassigning] = useState(false)
  const [reassignError, setReassignError] = useState<string | null>(null)

  // Form State for New Batch
  const [name, setName] = useState('')
  const [ageGroup, setAgeGroup] = useState('U14')
  const [capacity, setCapacity] = useState(20)
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5])
  const [startTime, setStartTime] = useState('06:00')
  const [endTime, setEndTime] = useState('08:00')
  const [coachId, setCoachId] = useState('')

  // Batch Cadets & Multi-Enrollment Modal State
  const [cadetsModal, setCadetsModal] = useState<{ batch: Batch; activeTab: 'enrolled' | 'bulk_existing' | 'quick_new' } | null>(null)
  const [enrolledStudents, setEnrolledStudents] = useState<BatchStudent[]>([])
  const [availableStudents, setAvailableStudents] = useState<BatchStudent[]>([])
  const [loadingCadets, setLoadingCadets] = useState(false)
  const [cadetSearch, setCadetSearch] = useState('')
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [savingCadets, setSavingCadets] = useState(false)
  const [cadetActionSuccess, setCadetActionSuccess] = useState<string | null>(null)
  const [cadetActionError, setCadetActionError] = useState<string | null>(null)

  // Multi-cadet dynamic rows for quick admission
  const [multiNewCadets, setMultiNewCadets] = useState<NewCadetDraft[]>([
    { name: '', dob: '2013-05-15', gender: 'Male', guardianName: '', whatsappNumber: '+91' },
  ])

  const fetchCoaches = async () => {
    try {
      const res = await fetch('/api/users?role=COACH')
      const data = await res.json()
      if (data.success && Array.isArray(data.users)) {
        const active = data.users.filter((u: any) => u.isActive !== false)
        setCoaches(active)
        if (active.length > 0) {
          setCoachId((prev) => (active.some((c: any) => c.id === prev) ? prev : active[0].id))
        }
      }
    } catch (err) {
      console.error('Failed to fetch coaches', err)
    }
  }

  const fetchBatches = async () => {
    setLoading(true)
    try {
      const [activeRes, archivedRes] = await Promise.all([
        fetch('/api/batches'),
        fetch('/api/batches?archived=true'),
      ])
      const activeData = await activeRes.json()
      const archivedData = await archivedRes.json()

      if (activeData.success) {
        setBatches(activeData.batches || [])
      }
      if (archivedData.success) {
        setArchivedBatches(archivedData.batches || [])
      }

      const meRes = await fetch('/api/auth/me')
      const meData = await meRes.json()
      if (meData?.user?.branchId) {
        setManagerBranchId(meData.user.branchId)
        if (meData.user.branchId === 'branch-hbn') {
          setBranchType('FRANCHISE')
        } else {
          setBranchType('OWNED')
        }
      }
    } catch {
      showToast('error', 'Failed to load batch list.')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDeleteBatch = async () => {
    if (!deleteModalBatch) return
    setIsDeletingBatch(true)
    setDeleteError(null)

    try {
      const res = await fetch(`/api/batches/${deleteModalBatch.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete batch')
        return
      }

      showToast('success', data.message || `Batch "${deleteModalBatch.name}" safely deleted & archived.`)
      setDeleteModalBatch(null)
      await fetchBatches()
    } catch {
      setDeleteError('Network error while deleting batch. Please try again.')
    } finally {
      setIsDeletingBatch(false)
    }
  }

  const handleRestoreBatch = async (batch: Batch) => {
    setRestoringBatchId(batch.id)
    try {
      const res = await fetch(`/api/batches/${batch.id}/restore`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        showToast('error', data.error || 'Failed to restore batch')
        return
      }
      showToast('success', data.message || `Batch "${batch.name}" has been restored successfully.`)
      await fetchBatches()
    } catch {
      showToast('error', 'Network error while restoring batch.')
    } finally {
      setRestoringBatchId(null)
    }
  }

  useEffect(() => {
    fetchBatches()
    fetchCoaches()
  }, [])

  // Open the Cadets Management Modal
  const openCadetsModal = async (batch: Batch, tab: 'enrolled' | 'bulk_existing' | 'quick_new') => {
    setCadetsModal({ batch, activeTab: tab })
    setSelectedStudentIds([])
    setCadetSearch('')
    setCadetActionSuccess(null)
    setCadetActionError(null)
    setLoadingCadets(true)

    try {
      const res = await fetch(`/api/batches/${batch.id}/students`)
      const data = await res.json()
      if (data.success) {
        setEnrolledStudents(data.enrolledStudents || [])
        setAvailableStudents(data.availableStudents || [])
      }
    } catch {
      setCadetActionError('Failed to load batch cadets.')
    } finally {
      setLoadingCadets(false)
    }
  }

  const refreshBatchCadets = async (batchId: string) => {
    setLoadingCadets(true)
    try {
      const res = await fetch(`/api/batches/${batchId}/students`)
      const data = await res.json()
      if (data.success) {
        setEnrolledStudents(data.enrolledStudents || [])
        setAvailableStudents(data.availableStudents || [])
        // Also update local batch's enrolled count
        setBatches((prev) =>
          prev.map((b) =>
            b.id === batchId ? { ...b, enrolledCount: (data.enrolledStudents || []).length } : b
          )
        )
      }
    } catch {
      setCadetActionError('Failed to refresh cadets.')
    } finally {
      setLoadingCadets(false)
    }
  }

  // Handle Bulk Existing Students Assignment
  const handleBulkAssignExisting = async () => {
    if (!cadetsModal || selectedStudentIds.length === 0) return
    setSavingCadets(true)
    setCadetActionError(null)
    setCadetActionSuccess(null)

    try {
      const res = await fetch(`/api/batches/${cadetsModal.batch.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_existing',
          studentIds: selectedStudentIds,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCadetActionError(data.error || 'Failed to assign students')
        setSavingCadets(false)
        return
      }

      setCadetActionSuccess(`Successfully enrolled ${selectedStudentIds.length} cadets into ${cadetsModal.batch.name}!`)
      setSelectedStudentIds([])
      await refreshBatchCadets(cadetsModal.batch.id)
      fetchBatches()
      // Switch to enrolled tab to view the updated list
      setCadetsModal((prev) => (prev ? { ...prev, activeTab: 'enrolled' } : null))
    } catch {
      setCadetActionError('Network error while assigning cadets.')
    } finally {
      setSavingCadets(false)
    }
  }

  // Handle Multi-Cadet Quick Admission
  const handleBulkAdmitNew = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cadetsModal) return

    // Validate that all rows have required fields
    for (let i = 0; i < multiNewCadets.length; i++) {
      const c = multiNewCadets[i]
      if (!c.name.trim() || !c.guardianName.trim() || !c.whatsappNumber.trim()) {
        setCadetActionError(`Please fill Cadet #${i + 1}'s Name, Guardian Name, and WhatsApp Number.`)
        return
      }
    }

    setSavingCadets(true)
    setCadetActionError(null)
    setCadetActionSuccess(null)

    try {
      const res = await fetch(`/api/batches/${cadetsModal.batch.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_admit',
          students: multiNewCadets,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCadetActionError(data.error || 'Failed to admit students')
        setSavingCadets(false)
        return
      }

      setCadetActionSuccess(`Successfully admitted & enrolled ${multiNewCadets.length} cadets into ${cadetsModal.batch.name}!`)
      setMultiNewCadets([{ name: '', dob: '2013-05-15', gender: 'Male', guardianName: '', whatsappNumber: '+91' }])
      await refreshBatchCadets(cadetsModal.batch.id)
      fetchBatches()
      setCadetsModal((prev) => (prev ? { ...prev, activeTab: 'enrolled' } : null))
    } catch {
      setCadetActionError('Network error while creating cadets.')
    } finally {
      setSavingCadets(false)
    }
  }

  // Handle Remove Student from Batch
  const handleRemoveCadetFromBatch = async (studentId: string, studentName: string) => {
    if (!cadetsModal) return
    if (!confirm(`Are you sure you want to remove ${studentName} from ${cadetsModal.batch.name}?`)) return

    setSavingCadets(true)
    setCadetActionError(null)
    try {
      const res = await fetch(`/api/batches/${cadetsModal.batch.id}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'remove',
          studentId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setCadetActionError(data.error || 'Failed to remove cadet')
        setSavingCadets(false)
        return
      }

      setCadetActionSuccess(`Removed ${studentName} from ${cadetsModal.batch.name}.`)
      await refreshBatchCadets(cadetsModal.batch.id)
      fetchBatches()
    } catch {
      setCadetActionError('Network error while removing cadet.')
    } finally {
      setSavingCadets(false)
    }
  }

  const toggleDay = (dayIndex: number) => {
    if (daysOfWeek.includes(dayIndex)) {
      if (daysOfWeek.length > 1) {
        setDaysOfWeek(daysOfWeek.filter((d) => d !== dayIndex))
      }
    } else {
      setDaysOfWeek([...daysOfWeek, dayIndex].sort())
    }
  }

  const handleOpenCreateModal = () => {
    setFormError(null)
    fetchCoaches()
    setIsModalOpen(true)
  }

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (branchType === 'FRANCHISE') {
      setFormError('Franchise branch managers have view-only access to batch schedules.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          branchId: managerBranchId,
          ageGroup,
          capacity: Number(capacity),
          daysOfWeek,
          startTime,
          endTime,
          coachId: coachId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create batch')
        setSubmitting(false)
        return
      }

      setIsModalOpen(false)
      setName('')
      fetchBatches()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReassignCoach = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reassignModal) return
    setReassigning(true)
    setReassignError(null)

    try {
      const res = await fetch(`/api/batches/${reassignModal.batch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachId: reassignModal.selectedCoachId,
          action: reassignModal.action,
          isPrimary: reassignModal.isPrimary,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setReassignError(data.error || 'Failed to update coaching staff')
        setReassigning(false)
        return
      }

      setReassignModal(null)
      fetchBatches()
    } catch {
      setReassignError('Network error. Please try again.')
    } finally {
      setReassigning(false)
    }
  }

  const handleRemoveCoach = async (coachId: string, coachName: string) => {
    if (!reassignModal) return
    if (!confirm(`Remove ${coachName} from the coaching staff of ${reassignModal.batch.name}?`)) return
    setReassigning(true)
    setReassignError(null)

    try {
      const res = await fetch(`/api/batches/${reassignModal.batch.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_coach', removeCoachId: coachId }),
      })

      const data = await res.json()
      if (!res.ok) {
        setReassignError(data.error || 'Failed to remove coach')
        setReassigning(false)
        return
      }

      await fetchBatches()
      // Refresh modal batch state
      const updatedStaff = (reassignModal.batch.coachingStaff || []).filter((c) => c.id !== coachId)
      setReassignModal((prev) =>
        prev
          ? {
              ...prev,
              batch: {
                ...prev.batch,
                coachingStaff: updatedStaff,
                currentCoach: prev.batch.currentCoach?.id === coachId ? updatedStaff[0] || null : prev.batch.currentCoach,
              },
            }
          : null
      )
    } catch {
      setReassignError('Network error while removing coach.')
    } finally {
      setReassigning(false)
    }
  }

  const filteredEnrolled = enrolledStudents.filter((s) => {
    if (!cadetSearch.trim()) return true
    const q = cadetSearch.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q)
  })

  const filteredAvailable = availableStudents.filter((s) => {
    if (!cadetSearch.trim()) return true
    const q = cadetSearch.toLowerCase()
    return s.name.toLowerCase().includes(q) || s.studentCode.toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/manager"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Manager Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight">
              Branch Batches &amp; Pitch Schedules
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Operational batches, cadet rosters, coach assignments, and dynamic capacity tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {batches.length > 0 && (
            <button
              onClick={() => openCadetsModal(batches[0], 'bulk_existing')}
              className="h-8 px-3 rounded-md border border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)] hover:bg-[var(--primary-100)] text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Cadets to Batch</span>
              <span className="sm:hidden">Add Cadets</span>
            </button>
          )}

          {branchType === 'OWNED' ? (
            <button
              onClick={handleOpenCreateModal}
              className="h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Batch</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--warning)] bg-[var(--accent-50)] px-3 py-1 rounded-full border border-[var(--warning)]/30">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Franchise View-Only</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-container max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-5 min-w-0">
        {/* Toast Notification */}
        {toast && (
          <div
            className={`p-3 rounded-md flex items-center justify-between text-xs font-semibold animate-in fade-in duration-200 border ${
              toast.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 hover:opacity-75 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Section Tabs: Active Batches vs Archived Batches */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBatchTab('active')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                batchTab === 'active'
                  ? 'bg-[var(--primary-600)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Active Batches</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  batchTab === 'active' ? 'bg-white/20 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {batches.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBatchTab('archived')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                batchTab === 'archived'
                  ? 'bg-[var(--primary-600)] text-white shadow-xs'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archived Batches</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  batchTab === 'archived' ? 'bg-white/20 text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]'
                }`}
              >
                {archivedBatches.length}
              </span>
            </button>
          </div>

          <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
            {batchTab === 'active' ? 'Active scheduled training groups' : 'Archived batches (historical logs preserved)'}
          </span>
        </div>

        {branchType === 'FRANCHISE' && (
          <div className="p-4 rounded-lg bg-[var(--accent-50)] border border-[var(--warning)]/30 text-xs text-[var(--warning)] font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Franchise Schedule Rule:</strong> Batches, pitch timings, and coach allocations are centrally governed by the Academy Office.
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--primary-600)]" />
            <p className="text-xs text-[var(--text-muted)] font-medium">Loading batches &amp; schedules…</p>
          </div>
        ) : batchTab === 'active' ? (
          batches.length === 0 ? (
            <div className="p-12 text-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)]">
              <Users className="w-10 h-10 mx-auto text-[var(--text-muted)] opacity-50 mb-3" />
              <h3 className="text-base font-bold text-[var(--text)]">No Batches Configured</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mt-1">
                Create your first training batch to start enrolling cadets and allocating coaches.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {batches.map((batch) => {
                const occupancyPct = Math.round((batch.enrolledCount / batch.capacity) * 100)
                return (
                  <div
                    key={batch.id}
                    className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between hover:border-[var(--primary-600)]/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-base font-bold text-[var(--text)]">{batch.name}</h3>
                          {batch.ageGroup && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20">
                              {batch.ageGroup}
                            </span>
                          )}
                        </div>

                        {branchType === 'OWNED' && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteModalBatch(batch)
                            }}
                            className="p-1.5 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-colors cursor-pointer"
                            title={`Delete / Archive batch ${batch.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                        <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                          <Clock className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                          <span>{batch.startTime} - {batch.endTime} IST</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                          <div className="flex items-center gap-1">
                            {DAY_NAMES.map((day, idx) => {
                              const active = batch.daysOfWeek.includes(idx)
                              return (
                                <span
                                  key={day}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    active
                                      ? 'bg-[var(--primary-600)] text-white'
                                      : 'text-[var(--text-muted)]/50'
                                  }`}
                                >
                                  {day}
                                </span>
                              )
                            })}
                          </div>
                        </div>

                        <div className="flex items-start gap-1.5 pt-1">
                          <span className="text-[var(--text-muted)] shrink-0">Staff:</span>
                          <span className="font-semibold text-[var(--text)] line-clamp-1">
                            {batch.coachingStaff && batch.coachingStaff.length > 0
                              ? batch.coachingStaff.map((c) => c.name).join(', ')
                              : batch.currentCoach ? batch.currentCoach.name : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="pt-3 border-t border-[var(--border)] space-y-1.5 text-xs">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[var(--text-muted)]">Capacity</span>
                          <span className="font-semibold text-[var(--text)] font-mono">
                            {batch.enrolledCount} / {batch.capacity} Cadets ({occupancyPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--primary-600)] transition-all"
                            style={{ width: `${Math.min(occupancyPct, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Cadets Actions */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => openCadetsModal(batch, 'enrolled')}
                          className="py-1.5 px-2.5 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          title="View all students in this batch"
                        >
                          <Users className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                          <span>Cadets ({batch.enrolledCount})</span>
                        </button>
                        <button
                          onClick={() => openCadetsModal(batch, 'bulk_existing')}
                          className="py-1.5 px-2.5 rounded bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="Add multiple students to this batch"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>+ Add Cadets</span>
                        </button>
                      </div>

                      {branchType === 'OWNED' && (
                        <button
                          onClick={() => {
                            fetchCoaches()
                            setReassignError(null)
                            setReassignModal({
                              batch,
                              selectedCoachId: coaches[0]?.id || '',
                              action: 'add_coach',
                              isPrimary: false,
                            })
                          }}
                          className="w-full py-1.5 px-3 rounded border border-[var(--border)] hover:bg-[var(--surface-2)] text-xs font-medium text-[var(--text)] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                          <span>Coaching Staff ({batch.coachingStaff?.length || (batch.currentCoach ? 1 : 0)})</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          /* Tab 2: Archived Batches */
          archivedBatches.length === 0 ? (
            <div className="p-12 text-center rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--surface)]">
              <Archive className="w-10 h-10 mx-auto text-[var(--text-muted)] opacity-50 mb-3" />
              <h3 className="text-base font-bold text-[var(--text)]">No Archived Batches</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto mt-1">
                Batches that you archive or delete will appear here. Historical attendance and records are fully preserved and can be restored anytime.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {archivedBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-dashed border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between opacity-85 hover:opacity-100 transition-all"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-[var(--text)]">{batch.name}</h3>
                        {batch.ageGroup && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                            {batch.ageGroup}
                          </span>
                        )}
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-300 dark:border-gray-700">
                        ARCHIVED
                      </span>
                    </div>

                    <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{batch.startTime} - {batch.endTime} IST</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{batch.daysOfWeek.map((d) => DAY_NAMES[d]).join(', ') || 'No days configured'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs gap-2">
                    <span className="text-[11px] text-[var(--text-muted)] italic">
                      Preserved History
                    </span>

                    {branchType === 'OWNED' && (
                      <button
                        type="button"
                        disabled={restoringBatchId === batch.id}
                        onClick={() => handleRestoreBatch(batch)}
                        className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-600 hover:text-white transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title={`Restore ${batch.name}`}
                      >
                        {restoringBatchId === batch.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Restore Batch</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </main>

      {/* Batch Cadets & Multi-Enrollment Modal */}
      {cadetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-3xl max-h-[90vh] bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between shrink-0 bg-[var(--surface)]">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[var(--text)]">{cadetsModal.batch.name}</h2>
                  {cadetsModal.batch.ageGroup && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20">
                      {cadetsModal.batch.ageGroup}
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                    {cadetsModal.batch.enrolledCount} / {cadetsModal.batch.capacity} Enrolled
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {cadetsModal.batch.startTime} - {cadetsModal.batch.endTime} IST · Coach:{' '}
                  {cadetsModal.batch.currentCoach?.name || 'Unassigned'}
                </p>
              </div>

              <button
                onClick={() => setCadetsModal(null)}
                className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notification Alerts */}
            {cadetActionSuccess && (
              <div className="mx-5 mt-4 p-3 rounded bg-[var(--primary-50)] border border-[var(--primary-600)]/30 text-xs text-[var(--primary-700)] font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--primary-600)]" />
                <span>{cadetActionSuccess}</span>
              </div>
            )}
            {cadetActionError && (
              <div className="mx-5 mt-4 p-3 rounded bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-xs text-[var(--danger)] font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{cadetActionError}</span>
              </div>
            )}

            {/* Segmented Navigation Tabs */}
            <div className="flex border-b border-[var(--border)] px-5 pt-3 bg-[var(--surface)] shrink-0 gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => {
                  setCadetActionSuccess(null)
                  setCadetActionError(null)
                  setCadetsModal({ ...cadetsModal, activeTab: 'enrolled' })
                }}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  cadetsModal.activeTab === 'enrolled'
                    ? 'border-[var(--primary-600)] text-[var(--primary-600)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Enrolled Cadets ({enrolledStudents.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCadetActionSuccess(null)
                  setCadetActionError(null)
                  setCadetsModal({ ...cadetsModal, activeTab: 'bulk_existing' })
                }}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  cadetsModal.activeTab === 'bulk_existing'
                    ? 'border-[var(--primary-600)] text-[var(--primary-600)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Existing Cadets (Bulk)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCadetActionSuccess(null)
                  setCadetActionError(null)
                  setCadetsModal({ ...cadetsModal, activeTab: 'quick_new' })
                }}
                className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  cadetsModal.activeTab === 'quick_new'
                    ? 'border-[var(--primary-600)] text-[var(--primary-600)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Quick Add New Cadets</span>
              </button>
            </div>

            {/* Tab 1: Enrolled Cadets */}
            {cadetsModal.activeTab === 'enrolled' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Search cadets in this batch…"
                      value={cadetSearch}
                      onChange={(e) => setCadetSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                    />
                  </div>
                  <button
                    onClick={() => setCadetsModal({ ...cadetsModal, activeTab: 'bulk_existing' })}
                    className="h-8 px-3 rounded-lg bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>+ Add More Cadets</span>
                  </button>
                </div>

                {loadingCadets ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--primary-600)]" />
                    <p className="text-xs text-[var(--text-muted)]">Loading batch roster…</p>
                  </div>
                ) : filteredEnrolled.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-2)]/40 p-6">
                    <Users className="w-8 h-8 mx-auto text-[var(--text-muted)] opacity-40 mb-2" />
                    <p className="text-sm font-semibold text-[var(--text)]">No cadets found in this batch</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1 max-w-sm mx-auto">
                      Use the &quot;Add Existing Cadets&quot; or &quot;Quick Add New Cadets&quot; tabs to enroll students.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">
                    {filteredEnrolled.map((cadet) => (
                      <div
                        key={cadet.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[var(--surface-2)]/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20 flex items-center justify-center text-xs font-bold shrink-0">
                            {cadet.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-[var(--text)]">{cadet.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                                {cadet.studentCode}
                              </span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                                Active
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-muted)]">
                              <span>Guardian: {cadet.guardianName || 'Guardian'}</span>
                              {cadet.guardianPhone && (
                                <span className="flex items-center gap-1 font-mono">
                                  <Phone className="w-3 h-3 text-[var(--text-muted)]" />
                                  {cadet.guardianPhone}
                                </span>
                              )}
                              {cadet.gender && <span>· {cadet.gender}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            disabled={savingCadets}
                            onClick={() => handleRemoveCadetFromBatch(cadet.id, cadet.name)}
                            className="px-2.5 py-1 rounded-md border border-[var(--danger)]/30 hover:bg-[var(--danger-bg)] text-[var(--danger)] text-[11px] font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                            title="Remove from batch"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Add Existing Cadets (Bulk Select) */}
            {cadetsModal.activeTab === 'bulk_existing' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text)]">Select Branch Cadets</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Checkmark multiple cadets to assign them simultaneously into {cadetsModal.batch.name}.
                      </p>
                    </div>

                    {filteredAvailable.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedStudentIds.length === filteredAvailable.length) {
                            setSelectedStudentIds([])
                          } else {
                            setSelectedStudentIds(filteredAvailable.map((s) => s.id))
                          }
                        }}
                        className="text-xs font-semibold text-[var(--primary-600)] hover:underline self-start sm:self-center"
                      >
                        {selectedStudentIds.length === filteredAvailable.length
                          ? 'Deselect All'
                          : `Select All (${filteredAvailable.length})`}
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                      type="text"
                      placeholder="Search available cadets by name or code…"
                      value={cadetSearch}
                      onChange={(e) => setCadetSearch(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                    />
                  </div>

                  {filteredAvailable.length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-2)]/40 p-6">
                      <p className="text-xs font-semibold text-[var(--text)]">No eligible branch cadets available</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        All branch cadets are currently assigned to this batch, or switch to the Quick Add tab to admit new cadets.
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl bg-[var(--surface)]">
                      {filteredAvailable.map((cadet) => {
                        const isSelected = selectedStudentIds.includes(cadet.id)
                        return (
                          <div
                            key={cadet.id}
                            onClick={() => {
                              setSelectedStudentIds((prev) =>
                                isSelected ? prev.filter((id) => id !== cadet.id) : [...prev, cadet.id]
                              )
                            }}
                            className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                              isSelected ? 'bg-[var(--primary-50)]/50' : 'hover:bg-[var(--surface-2)]/50'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? 'bg-[var(--primary-600)] border-[var(--primary-600)] text-white'
                                    : 'border-[var(--border)] bg-[var(--surface)]'
                                }`}
                              >
                                {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-[var(--text)]">{cadet.name}</span>
                                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                                    {cadet.studentCode}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                                    {cadet.currentBatch ? `In ${cadet.currentBatch.name}` : 'Unassigned'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                  Guardian: {cadet.guardianName || 'Guardian'} {cadet.guardianPhone && `· ${cadet.guardianPhone}`}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Bulk Action Bar */}
                <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--text-muted)]">
                    <strong className="text-[var(--text)] font-semibold">{selectedStudentIds.length}</strong> cadet(s) selected
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCadetsModal(null)}
                      className="h-8 px-3 rounded-lg border border-[var(--border)] text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingCadets || selectedStudentIds.length === 0}
                      onClick={handleBulkAssignExisting}
                      className="h-8 px-4 rounded-lg bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-2xs"
                    >
                      {savingCadets && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Add {selectedStudentIds.length} Cadets to Batch</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Quick Add New Cadets (Multi-Row Entry) */}
            {cadetsModal.activeTab === 'quick_new' && (
              <form onSubmit={handleBulkAdmitNew} className="flex-1 overflow-y-auto p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-[var(--text)]">Admit Multiple New Cadets</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Quickly enter new cadet details. All entries will be created and enrolled directly into {cadetsModal.batch.name}.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setMultiNewCadets([
                          ...multiNewCadets,
                          { name: '', dob: '2013-05-15', gender: 'Male', guardianName: '', whatsappNumber: '+91' },
                        ])
                      }
                      className="h-7 px-2.5 rounded-md border border-[var(--primary-600)] text-[var(--primary-600)] hover:bg-[var(--primary-50)] text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add Another Row</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {multiNewCadets.map((cadet, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)]/40 space-y-2 relative"
                      >
                        <div className="flex items-center justify-between pb-1 border-b border-[var(--border)]/60">
                          <span className="text-[11px] font-bold text-[var(--text)] flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-[var(--primary-600)] text-white text-[10px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            Cadet #{idx + 1}
                          </span>

                          {multiNewCadets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setMultiNewCadets(multiNewCadets.filter((_, i) => i !== idx))}
                              className="text-[var(--danger)] hover:opacity-80 p-1"
                              title="Delete row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-0.5">
                              Cadet Full Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Samar Sen"
                              value={cadet.name}
                              onChange={(e) => {
                                const copy = [...multiNewCadets]
                                copy[idx].name = e.target.value
                                setMultiNewCadets(copy)
                              }}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-0.5">
                              Date of Birth *
                            </label>
                            <input
                              type="date"
                              required
                              value={cadet.dob}
                              onChange={(e) => {
                                const copy = [...multiNewCadets]
                                copy[idx].dob = e.target.value
                                setMultiNewCadets(copy)
                              }}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-0.5">
                              Gender
                            </label>
                            <select
                              value={cadet.gender}
                              onChange={(e) => {
                                const copy = [...multiNewCadets]
                                copy[idx].gender = e.target.value
                                setMultiNewCadets(copy)
                              }}
                              className="w-full h-8 px-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                            >
                              <option value="Male">Male</option>
                              <option value="Female">Female</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-0.5">
                              Guardian Name *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Ramesh Sen"
                              value={cadet.guardianName}
                              onChange={(e) => {
                                const copy = [...multiNewCadets]
                                copy[idx].guardianName = e.target.value
                                setMultiNewCadets(copy)
                              }}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-semibold text-[var(--text-muted)] uppercase mb-0.5">
                              Guardian WhatsApp Number *
                            </label>
                            <input
                              type="tel"
                              required
                              placeholder="+91 98765 43210"
                              value={cadet.whatsappNumber}
                              onChange={(e) => {
                                const copy = [...multiNewCadets]
                                copy[idx].whatsappNumber = e.target.value
                                setMultiNewCadets(copy)
                              }}
                              className="w-full h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] font-mono outline-none focus:ring-1 focus:ring-[var(--primary-600)]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="pt-4 border-t border-[var(--border)] flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--text-muted)]">
                    Ready to admit <strong className="text-[var(--text)] font-semibold">{multiNewCadets.length}</strong> new cadet(s)
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCadetsModal(null)}
                      className="h-8 px-3 rounded-lg border border-[var(--border)] text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingCadets}
                      className="h-8 px-4 rounded-lg bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-2xs"
                    >
                      {savingCadets && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Admit &amp; Enroll All ({multiNewCadets.length}) Cadets</span>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* New Batch Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text)]">Create Training Batch</h2>
              <button onClick={() => setIsModalOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-xs text-[var(--danger)] font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBatch} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Batch Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Under-14 Morning Elite"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                    Age Group
                  </label>
                  <select
                    value={ageGroup}
                    onChange={(e) => setAgeGroup(e.target.value)}
                    className="w-full h-9 px-2 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  >
                    <option value="U12">Under-12</option>
                    <option value="U14">Under-14</option>
                    <option value="U17">Under-17</option>
                    <option value="Open">Open</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                    Pitch Capacity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={capacity}
                    onChange={(e) => setCapacity(Number(e.target.value))}
                    className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Days of Week
                </label>
                <div className="grid grid-cols-7 gap-1">
                  {DAY_NAMES.map((day, idx) => {
                    const active = daysOfWeek.includes(idx)
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => toggleDay(idx)}
                        className={`h-8 rounded font-semibold transition-colors ${
                          active
                            ? 'bg-[var(--primary-600)] text-white'
                            : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]'
                        }`}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase text-[var(--text-muted)] mb-1">
                  Assign Coach
                </label>
                <select
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                >
                  {coaches.length === 0 ? (
                    <option value="">No coaches found</option>
                  ) : (
                    coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.loginId})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-3 rounded border font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Batch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Coaching Staff Modal */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h2 className="text-base font-bold text-[var(--text)]">
                  Coaching Staff · {reassignModal.batch.name}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  {reassignModal.batch.startTime} - {reassignModal.batch.endTime} IST · Manage coaching staff assignments.
                </p>
              </div>
              <button onClick={() => setReassignModal(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {reassignError && (
              <div className="p-3 rounded bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-xs text-[var(--danger)] font-medium flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{reassignError}</span>
              </div>
            )}

            {/* Current Active Coaching Staff */}
            <div className="space-y-2 text-xs">
              <label className="block font-semibold uppercase text-[var(--text-muted)]">
                Assigned Coaching Staff ({reassignModal.batch.coachingStaff?.length || (reassignModal.batch.currentCoach ? 1 : 0)})
              </label>

              {(!reassignModal.batch.coachingStaff || reassignModal.batch.coachingStaff.length === 0) && !reassignModal.batch.currentCoach ? (
                <div className="p-3 rounded-lg border border-dashed border-[var(--border)] text-center text-[var(--text-muted)]">
                  No coaches currently assigned to this batch.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg bg-[var(--surface-2)]/50 overflow-hidden">
                  {(reassignModal.batch.coachingStaff && reassignModal.batch.coachingStaff.length > 0
                    ? reassignModal.batch.coachingStaff
                    : reassignModal.batch.currentCoach
                    ? [{ id: reassignModal.batch.currentCoach.id, name: reassignModal.batch.currentCoach.name, isPrimary: true }]
                    : []
                  ).map((coach) => (
                    <div key={coach.id} className="p-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-[var(--primary-600)]" />
                        <span className="font-bold text-[var(--text)]">{coach.name}</span>
                        {coach.isPrimary ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--primary-50)] text-[var(--primary-700)] border border-[var(--primary-600)]/20">
                            Primary / Head Coach
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)]">
                            Coaching Staff
                          </span>
                        )}
                      </div>

                      {(reassignModal.batch.coachingStaff && reassignModal.batch.coachingStaff.length > 1) && (
                        <button
                          type="button"
                          disabled={reassigning}
                          onClick={() => handleRemoveCoach(coach.id, coach.name)}
                          className="p-1 rounded text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                          title="Remove coach from batch"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add / Assign Coach Section */}
            <form onSubmit={handleReassignCoach} className="space-y-3 pt-2 border-t border-[var(--border)] text-xs">
              <label className="block font-semibold uppercase text-[var(--text-muted)]">
                Assign / Add Coach
              </label>

              <div>
                <select
                  value={reassignModal.selectedCoachId}
                  onChange={(e) =>
                    setReassignModal({ ...reassignModal, selectedCoachId: e.target.value })
                  }
                  required
                  className="w-full h-9 px-2.5 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                >
                  {coaches.length === 0 ? (
                    <option value="">No coaches found</option>
                  ) : (
                    coaches.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.loginId})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Mode Options */}
              <div className="space-y-1.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/40">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-[var(--text)]">
                  <input
                    type="radio"
                    name="coachAction"
                    checked={reassignModal.action === 'add_coach'}
                    onChange={() => setReassignModal({ ...reassignModal, action: 'add_coach' })}
                    className="accent-[var(--primary-600)]"
                  />
                  <span>Add to Coaching Staff (Keep existing coaching staff)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-medium text-[var(--text)]">
                  <input
                    type="radio"
                    name="coachAction"
                    checked={reassignModal.action === 'replace_coach'}
                    onChange={() => setReassignModal({ ...reassignModal, action: 'replace_coach' })}
                    className="accent-[var(--primary-600)]"
                  />
                  <span>Replace Primary Coach</span>
                </label>

                <div className="pt-1.5 border-t border-[var(--border)]/60">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={reassignModal.isPrimary}
                      onChange={(e) => setReassignModal({ ...reassignModal, isPrimary: e.target.checked })}
                      className="accent-[var(--primary-600)]"
                    />
                    <span>Mark this coach as Primary / Head Coach</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReassignModal(null)}
                  className="h-9 px-3 rounded border font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning || !reassignModal.selectedCoachId}
                  className="h-9 px-4 rounded bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {reassigning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Coaching Staff</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CONFIRM DELETE / ARCHIVE BATCH MODAL (MANAGER)           */}
      {/* ======================================================== */}
      {deleteModalBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center text-red-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base text-[var(--text)]">Delete Batch</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Safely remove or archive an old training batch.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteModalBatch(null)
                  setDeleteError(null)
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-md bg-[var(--surface-2)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">Batch Name</span>
                {deleteModalBatch.ageGroup && (
                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                    {deleteModalBatch.ageGroup}
                  </span>
                )}
              </div>
              <p className="font-bold text-sm text-[var(--text)]">{deleteModalBatch.name}</p>
              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                <span>{deleteModalBatch.startTime} - {deleteModalBatch.endTime}</span>
                <span>·</span>
                <span className={deleteModalBatch.enrolledCount > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>
                  {deleteModalBatch.enrolledCount} active cadets enrolled
                </span>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}

            {deleteModalBatch.enrolledCount > 0 ? (
              <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-200 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>Active Cadets Enrolled ({deleteModalBatch.enrolledCount})</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  This batch cannot be deleted while cadets are actively enrolled in it. Please transfer or remove students before deleting this batch.
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-200 text-xs space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0 text-blue-600" />
                  <span>Preserve Historical Records</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Historical attendance records and coaching history are safely preserved in your branch archives. This batch will be moved to the <strong>Archived Batches</strong> tab and can be restored if needed.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={() => {
                  setDeleteModalBatch(null)
                  setDeleteError(null)
                }}
                className="h-9 px-3 rounded-md border border-[var(--border)] text-[var(--text)] text-xs font-semibold hover:bg-[var(--surface-2)] cursor-pointer"
              >
                Cancel
              </button>
              {deleteModalBatch.enrolledCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const b = deleteModalBatch
                    setDeleteModalBatch(null)
                    setDeleteError(null)
                    openCadetsModal(b, 'enrolled')
                  }}
                  className="h-9 px-4 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manage Cadets First</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isDeletingBatch}
                  onClick={handleConfirmDeleteBatch}
                  className="h-9 px-4 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isDeletingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Confirm Delete / Archive</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
