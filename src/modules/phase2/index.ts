/**
 * CPA Cricket Academy CRM — Phase 2 Module Entry Point
 * 
 * Strict architectural isolation (A-01, A-02):
 * - Phase 2 code lives under this directory (`src/modules/phase2/`).
 * - Phase 1 modules must never import from `src/modules/phase2/`.
 * - Direction of dependencies is always Phase 2 -> Phase 1.
 */

export * from './flags/feature-flags.service'
export * from './utils/phone'
export * from './enquiries/enquiry.service'
export * from './enquiries/pipeline.service'
export * from './enquiries/lost-reasons'
export * from './enquiries/follow-up.service'
export * from './trials/trial.service'
export * from './enquiries/conversion.service'
export * from './enquiries/enquiry-assignment.service'
export * from './notifications/notification-events'
export * from './notifications/notification.service'
export * from './notifications/evaluators.service'
export * from './metrics/metric-definitions'
export * from './metrics/snapshot.service'
export * from './metrics/reconciliation.service'
export * from './dashboards/dashboard.service'


