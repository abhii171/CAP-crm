'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, Plus, Users, MapPin, CheckCircle, AlertCircle, X, Shield, Loader2 } from 'lucide-react'

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
}

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

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
            <h1 className="font-bold text-base text-[var(--text)] tracking-tight">
              Branch Administration
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Manage owned academy facilities and franchise branches.
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Branch Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((b) => {
            const isOwned = b.type === 'OWNED'
            return (
              <div
                key={b.id}
                className="p-5 rounded-[var(--radius-md)] bg-[var(--surface)] border border-[var(--border)] shadow-xs space-y-4 flex flex-col justify-between"
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

                  <div className="mt-3 space-y-1.5 text-xs text-[var(--text-muted)]">
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

                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-[var(--success)] font-medium">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Operational
                  </span>
                  <Link
                    href={{ pathname: '/admin/users', query: { branchId: b.id } }}
                    className="font-semibold text-[var(--primary-600)] hover:underline flex items-center gap-1"
                  >
                    <span>Staff ({b.staffCount ?? 0})</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </main>

      {/* New Branch Modal */}
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
