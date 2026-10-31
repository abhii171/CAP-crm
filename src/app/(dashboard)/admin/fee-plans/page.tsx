'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard-header'
import { formatPaise } from '@/lib/utils'
import {
  CreditCard,
  Plus,
  CheckCircle2,
  AlertTriangle,
  X,
  IndianRupee,
  Layers,
  Calendar,
} from 'lucide-react'

interface FeePlan {
  id: string
  branchId?: string | null
  name: string
  amountPaise: number
  frequency: 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'
  isActive: boolean
  createdAt: string
}

export default function AdminFeePlansPage() {
  const [plans, setPlans] = useState<FeePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [name, setName] = useState('')
  const [amountRupees, setAmountRupees] = useState('')
  const [frequency, setFrequency] = useState<'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY'>('MONTHLY')
  const [creating, setCreating] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchPlans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/fees/plans')
      const data = await res.json()
      if (data.success && data.plans) {
        setPlans(data.plans)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountVal = parseFloat(amountRupees)
    if (!name.trim() || isNaN(amountVal) || amountVal <= 0) {
      setFeedback({ type: 'error', text: 'Please provide a valid plan name and positive amount.' })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/fees/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          amountPaise: Math.round(amountVal * 100),
          frequency,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ type: 'success', text: `Fee plan "${name}" created successfully!` })
        setShowCreateModal(false)
        setName('')
        setAmountRupees('')
        fetchPlans()
      } else {
        setFeedback({ type: 'error', text: data.error || 'Failed to create fee plan' })
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error creating fee plan' })
    }
    setCreating(false)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--surface-1)' }}>
      <DashboardHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--primary-100)' }}>
              <CreditCard className="h-5 w-5" style={{ color: 'var(--primary-600)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Fee Structures &amp; Plans</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Global academy fee plans, recurring billing schedules &amp; dues pricing</p>
            </div>
          </div>
          <button
            onClick={() => { setShowCreateModal(true); setFeedback(null) }}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow"
            style={{ background: 'var(--primary-600)' }}
          >
            <Plus className="h-4 w-4" /> Create Fee Plan
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

        {/* Plans Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl border p-6 shadow-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                    {p.frequency}
                  </span>
                  <h3 className="mt-2 text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {p.name}
                  </h3>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold" style={{ color: 'var(--primary-600)' }}>
                    {formatPaise(p.amountPaise)}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {p.frequency === 'ONE_TIME' ? 'One-time fee' : `per ${p.frequency.toLowerCase().replace('_', ' ')}`}
                  </div>
                </div>
              </div>

              <div className="mt-6 border-t pt-4 text-xs text-gray-500" style={{ borderColor: 'var(--border)' }}>
                {p.branchId ? 'Branch Specific' : 'Global (Standard for all branches)'}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Create Fee Plan</h2>
              <button onClick={() => setShowCreateModal(false)} style={{ color: 'var(--text-muted)' }}><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Plan Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monthly Academy Training, Kit Fee"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Amount (₹) *</label>
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="2500"
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Billing Frequency *</label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as any)}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
                >
                  <option value="MONTHLY">MONTHLY (Every Month)</option>
                  <option value="QUARTERLY">QUARTERLY (Every 3 Months)</option>
                  <option value="HALF_YEARLY">HALF_YEARLY (Every 6 Months)</option>
                  <option value="YEARLY">YEARLY (Annual)</option>
                  <option value="ONE_TIME">ONE_TIME (Admission / Kit)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: 'var(--primary-600)' }}
                >
                  {creating ? 'Creating…' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

