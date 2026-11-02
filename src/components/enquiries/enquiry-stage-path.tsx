'use client'

import React from 'react'
import { Check, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react'

export type EnquiryStage = 'NEW' | 'CONTACTED' | 'TRIAL_SCHEDULED' | 'TRIAL_DONE' | 'CONVERTED' | 'LOST'

interface StageDef {
  key: EnquiryStage
  label: string
}

export const PATH_STAGES: StageDef[] = [
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'TRIAL_SCHEDULED', label: 'Trial Scheduled' },
  { key: 'TRIAL_DONE', label: 'Trial Attended' },
  { key: 'CONVERTED', label: 'Converted' },
]

interface EnquiryStagePathProps {
  currentStage: EnquiryStage
  onSelectStage?: (stage: EnquiryStage) => void
  onMarkComplete?: () => void
  isUpdating?: boolean
}

export function EnquiryStagePath({
  currentStage,
  onSelectStage,
  onMarkComplete,
  isUpdating = false,
}: EnquiryStagePathProps) {
  const isLost = currentStage === 'LOST'
  const isConverted = currentStage === 'CONVERTED'

  const currentIndex = PATH_STAGES.findIndex((s) => s.key === currentStage)
  const nextStage = currentIndex >= 0 && currentIndex < PATH_STAGES.length - 1 ? PATH_STAGES[currentIndex + 1] : null

  return (
    <div className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-3 sm:p-4 space-y-3">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Stage Path
          </span>
          {isLost && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5" />
              Closed / Lost
            </span>
          )}
          {isConverted && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Converted Cadet
            </span>
          )}
        </div>

        {onMarkComplete && !isConverted && !isLost && nextStage && (
          <button
            onClick={onMarkComplete}
            disabled={isUpdating}
            className="w-full sm:w-auto px-4 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isUpdating ? (
              <span>Updating...</span>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Mark Stage as Complete ({nextStage.label})</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Chevron Stages Bar */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="flex items-stretch min-w-max rounded-md overflow-hidden border border-[var(--border)] text-xs font-medium">
          {PATH_STAGES.map((stage, idx) => {
            const isCurrent = stage.key === currentStage
            const isCompleted = !isLost && currentIndex > idx

            let bgClass = 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--surface)]'
            if (isCurrent) {
              bgClass = 'bg-emerald-600 text-white font-semibold'
            } else if (isCompleted) {
              bgClass = 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60'
            }

            return (
              <button
                key={stage.key}
                type="button"
                disabled={isUpdating}
                onClick={() => onSelectStage && onSelectStage(stage.key)}
                className={`relative px-4 py-2.5 flex items-center gap-2 transition-all cursor-pointer border-r last:border-r-0 border-[var(--border)] disabled:opacity-60 disabled:cursor-not-allowed ${bgClass}`}
                title={`Move to Stage: ${stage.label}`}
              >
                {isCompleted && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                {isCurrent && (
                  <span className="w-2 h-2 rounded-full bg-white shrink-0 animate-pulse" />
                )}
                <span className="whitespace-nowrap">{stage.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

