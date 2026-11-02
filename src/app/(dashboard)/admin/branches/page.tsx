'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Plus,
  Users,
  MapPin,
  CheckCircle,
  AlertCircle,
  X,
  Shield,
  Loader2,
  IndianRupee,
  Clock,
  TrendingUp,
  UserCheck,
  Calendar,
  Layers,
  ArrowUpRight,
  ExternalLink,
  BarChart3,
  Percent,
} from 'lucide-react'
import { formatPaise } from '@/lib/utils'

interface Branch {
  id: string
  code: string
  name: string
  type: 'OWNED' | 'FRANCHISE'
  city: string | null
  address: string | null
  studentSeq: number
  isActive: boolean
  staffCount?: number
  managerCount?: number
  coachCount?: number
  studentCount?: number
  batchCount?: number
  totalAdmissions?: number
  totalCollectedPaise?: number
  admissionFeeCollectedPaise?: number
  monthlyFeeCollectedPaise?: number
  outstandingPaise?: number
  collectionRate?: number
}

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Selected branch for the dedicated Performance Overview Modal
  const [overviewBranch, setOverviewBranch] = useState<Branch | null>(null)

  // Form State
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState<'OWNED' | 'FRANCHISE'>('OWNED')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')

  const fetchBranches = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/branches')
      const data = await res.json()
      if (data.success) {
        setBranches(data.branches || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBranches()
  }, [])

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!code.trim() || !name.trim()) {
      setFormError('Branch Code and Branch Name are required.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          type,
          city: city.trim(),
          address: address.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to create branch')
        setSubmitting(false)
        return
      }

      setIsModalOpen(false)
      setCode('')
      setName('')
      setCity('')
      setAddress('')
      fetchBranches()
    } catch {
      setFormError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Top Header */}
      <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text)] transition-colors"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--primary-600)]" />
              <span>Branch Administration</span>
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Manage owned academy facilities, franchise branches, and review operational performance.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="h-8 px-3 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Branch</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="dashboard-container max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 min-w-0">
        {/* Branch Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((b) => {
            const isOwned = b.type === 'OWNED'
            const bAdmissions = b.totalAdmissions ?? b.studentSeq ?? b.studentCount ?? 0
            const bCollected = b.totalCollectedPaise ?? 0
            const bPending = b.outstandingPaise ?? 0

            return (
              <div
                key={b.id}
                className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between hover:border-[var(--primary-600)]/60 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
                        {b.code}
                      </span>
                      <h3 className="text-base font-bold text-[var(--text)] mt-1.5">{b.name}</h3>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                        isOwned
                          ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                          : 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                      }`}
                    >
                      {b.type}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
                      <span className="truncate">{b.address || b.city || 'No address registered'}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="flex items-center gap-1.5 text-[var(--text)] font-semibold">
                        <Users className="w-3.5 h-3.5 text-[var(--primary-600)] shrink-0" />
                        <span>{b.staffCount ?? 0} Staff Members</span>
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {b.studentCount ?? 0} Cadets · {b.batchCount ?? 0} Batches
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Strip: Operational status on left, Overview + Staff on right */}
                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs gap-2">
                  <span className="flex items-center gap-1.5 text-[var(--success)] font-medium">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Operational</span>
                  </span>

                  <div className="flex items-center gap-2">
                    {/* OVERVIEW OPTION BUTTON */}
                    <button
                      onClick={() => setOverviewBranch(b)}
                      className="px-2.5 py-1 rounded-md bg-[var(--primary-50)] text-[var(--primary-700)] dark:bg-[var(--primary-900)]/40 dark:text-[var(--primary-300)] font-semibold border border-[var(--primary-600)]/30 hover:bg-[var(--primary-600)] hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                      title={`View Performance Overview for ${b.name}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Overview</span>
                    </button>

                    <Link
                      href={{ pathname: '/admin/users', query: { branchId: b.id } }}
                      className="font-semibold text-[var(--primary-600)] hover:underline flex items-center gap-1"
                    >
                      <span>Staff ({b.staffCount ?? 0})</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* ======================================================== */}
      {/* BRANCH PERFORMANCE OVERVIEW MODAL                        */}
      {/* ======================================================== */}
      {overviewBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[var(--border)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)]">
                    {overviewBranch.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      overviewBranch.type === 'OWNED'
                        ? 'bg-[var(--primary-50)] text-[var(--primary-700)] border-[var(--primary-600)]/30'
                        : 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
                    }`}
                  >
                    {overviewBranch.type} FACILITY
                  </span>
                </div>
                <h2 className="text-lg font-bold text-[var(--text)] mt-1.5 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[var(--primary-600)]" />
                  <span>{overviewBranch.name}</span>
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>{overviewBranch.address || overviewBranch.city || 'No street address specified'}</span>
                </p>
              </div>

              <button
                onClick={() => setOverviewBranch(null)}
                className="w-8 h-8 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                title="Close Overview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Performance KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* 1. Total Admissions */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Total Admissions</span>
                  <Users className="w-4 h-4 text-[var(--primary-600)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[var(--text)] tracking-tight">
                    {overviewBranch.totalAdmissions ?? overviewBranch.studentSeq ?? overviewBranch.studentCount ?? 0}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">Cadets</span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Active Enrolled</span>
                  <span className="font-bold text-[var(--success)]">
                    {overviewBranch.studentCount ?? 0} Cadets
                  </span>
                </div>
              </div>

              {/* 2. Total Fee Collections */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Fee Collection</span>
                  <IndianRupee className="w-4 h-4 text-[var(--success)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[var(--success)] tracking-tight">
                    {formatPaise(overviewBranch.totalCollectedPaise ?? 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Admission Fees</span>
                  <span className="font-semibold text-[var(--text)]">
                    {formatPaise(overviewBranch.admissionFeeCollectedPaise ?? 0)}
                  </span>
                </div>
              </div>

              {/* 3. Pending / Outstanding Dues */}
              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="font-semibold uppercase tracking-wider text-[10px]">Pending Dues</span>
                  <Clock className="w-4 h-4 text-[var(--warning)]" />
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`text-2xl font-black tracking-tight ${
                      (overviewBranch.outstandingPaise ?? 0) > 0
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--text)]'
                    }`}
                  >
                    {formatPaise(overviewBranch.outstandingPaise ?? 0)}
                  </span>
                </div>
                <div className="pt-2 border-t border-[var(--border)]/70 flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-muted)]">Collection Rate</span>
                  <span
                    className={`font-bold ${
                      (overviewBranch.collectionRate ?? 100) >= 90
                        ? 'text-[var(--success)]'
                        : 'text-[var(--warning)]'
                    }`}
                  >
                    {overviewBranch.collectionRate ?? 100}%
                  </span>
                </div>
              </div>
            </div>

            {/* Operational Metrics Strip */}
            <div className="p-4 rounded-[var(--radius-md)] bg-[var(--surface-2)] border border-[var(--border)] space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                <span>Ground Operations &amp; Capacity</span>
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Active Batches</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.batchCount ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Staff Members</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.staffCount ?? 0}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Managers</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.managerCount ?? (overviewBranch.staffCount ? 1 : 0)}
                  </div>
                </div>

                <div className="p-2.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                  <div className="text-[10px] text-[var(--text-muted)] uppercase font-semibold">Coaching Staff</div>
                  <div className="text-base font-bold text-[var(--text)] mt-0.5">
                    {overviewBranch.coachCount ?? Math.max(0, (overviewBranch.staffCount ?? 0) - 1)}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-3 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={{ pathname: '/admin/students', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Cadets</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/batches', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Batches</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/users', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--text)] flex items-center gap-1 transition-colors"
                >
                  <UserCheck className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                  <span>View Staff</span>
                </Link>

                <Link
                  href={{ pathname: '/admin/reports', query: { branchId: overviewBranch.id } }}
                  className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--primary-600)] flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Branch Reports</span>
                </Link>
              </div>

              <button
                onClick={() => setOverviewBranch(null)}
                className="px-4 py-1.5 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE NEW BRANCH MODAL                                  */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-xl p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h2 className="text-base font-bold text-[var(--text)]">Create Academy Branch</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-md bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex items-start gap-2 text-xs text-[var(--danger)] font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateBranch} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Code (2-5 Letters)
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. GCH, BDN"
                  maxLength={5}
                  required
                  className="w-full h-9 px-3 text-xs font-mono uppercase rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)]"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  Used for student IDs (e.g. GCH-000001) and receipt sequences.
                </p>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CPA Gachibowli Stadium"
                  required
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] focus:border-[var(--primary-600)]"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  Branch Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('OWNED')}
                    className={`py-2 px-3 rounded-md border text-center font-medium transition-all ${
                      type === 'OWNED'
                        ? 'border-[var(--primary-600)] bg-[var(--primary-50)] text-[var(--primary-700)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
                    }`}
                  >
                    Owned Facility
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('FRANCHISE')}
                    className={`py-2 px-3 rounded-md border text-center font-medium transition-all ${
                      type === 'FRANCHISE'
                        ? 'border-[var(--primary-600)] bg-[var(--accent-50)] text-[var(--warning)]'
                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
                    }`}
                  >
                    Franchise Partner
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
                  City &amp; Address
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City (e.g. Hyderabad)"
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] mb-2"
                />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street / Ground Address"
                  className="w-full h-9 px-3 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-3 rounded-md border border-[var(--border)] text-[var(--text)] font-medium hover:bg-[var(--surface-2)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded-md bg-[var(--primary-600)] hover:bg-[var(--primary-700)] text-white font-semibold flex items-center gap-1.5"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Branch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
