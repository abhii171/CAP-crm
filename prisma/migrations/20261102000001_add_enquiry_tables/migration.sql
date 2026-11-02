-- CreateTable
CREATE TABLE "lost_reasons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiries" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "child_name" TEXT NOT NULL,
    "guardian_name" TEXT,
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "email" TEXT,
    "child_age_years" INTEGER,
    "interest" TEXT,
    "source" "EnquirySource" NOT NULL,
    "source_detail" TEXT,
    "created_via" "EnquiryCreatedVia" NOT NULL DEFAULT 'MANUAL',
    "status" "EnquiryStatus" NOT NULL DEFAULT 'NEW',
    "assigned_to_user_id" TEXT,
    "lost_reason_id" TEXT,
    "lost_note" TEXT,
    "next_follow_up_at" TIMESTAMP(3),
    "last_contacted_at" TIMESTAMP(3),
    "possible_duplicate" BOOLEAN NOT NULL DEFAULT false,
    "merged_into_id" TEXT,
    "converted_student_id" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_by_user_id" TEXT,
    "anonymized_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_stage_history" (
    "id" TEXT NOT NULL,
    "enquiry_id" TEXT NOT NULL,
    "from_status" "EnquiryStatus",
    "to_status" "EnquiryStatus" NOT NULL,
    "changed_by_user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_follow_ups" (
    "id" TEXT NOT NULL,
    "enquiry_id" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "channel" "FollowUpChannel" NOT NULL,
    "note" TEXT,
    "outcome" TEXT,
    "done_at" TIMESTAMP(3),
    "done_by_user_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enquiry_consents" (
    "id" TEXT NOT NULL,
    "enquiry_id" TEXT NOT NULL,
    "channel" "ConsentChannel" NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "capture_method" "ConsentCaptureMethod" NOT NULL,
    "text_version" TEXT NOT NULL,
    "recorded_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enquiry_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_sessions" (
    "id" TEXT NOT NULL,
    "enquiry_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "session_date" DATE NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome_marked_by_user_id" TEXT,
    "outcome_marked_at" TIMESTAMP(3),
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trial_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "branch_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "in_digest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quiet_start" TEXT,
    "quiet_end" TEXT,
    "digest_time" TEXT,

    CONSTRAINT "notification_user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_daily_branch" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "collections_cash_paise" INTEGER NOT NULL DEFAULT 0,
    "collections_online_paise" INTEGER NOT NULL DEFAULT 0,
    "reversals_paise" INTEGER NOT NULL DEFAULT 0,
    "outstanding_paise" INTEGER NOT NULL DEFAULT 0,
    "overdue_paise" INTEGER NOT NULL DEFAULT 0,
    "active_students" INTEGER NOT NULL DEFAULT 0,
    "attendance_sessions_marked" INTEGER NOT NULL DEFAULT 0,
    "attendance_present" INTEGER NOT NULL DEFAULT 0,
    "attendance_absent" INTEGER NOT NULL DEFAULT 0,
    "enquiries_created" INTEGER NOT NULL DEFAULT 0,
    "enquiries_contacted" INTEGER NOT NULL DEFAULT 0,
    "enquiries_converted" INTEGER NOT NULL DEFAULT 0,
    "enquiries_lost" INTEGER NOT NULL DEFAULT 0,
    "trials_attended" INTEGER NOT NULL DEFAULT 0,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "source_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "metric_daily_branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_reconciliation_runs" (
    "id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "branch_id" TEXT,
    "status" "ReconciliationStatus" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lost_reasons_code_key" ON "lost_reasons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "enquiries_converted_student_id_key" ON "enquiries"("converted_student_id");

-- CreateIndex
CREATE INDEX "enquiries_branch_id_status_idx" ON "enquiries"("branch_id", "status");

-- CreateIndex
CREATE INDEX "enquiries_branch_id_assigned_to_user_id_status_idx" ON "enquiries"("branch_id", "assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "enquiries_assigned_to_user_id_next_follow_up_at_idx" ON "enquiries"("assigned_to_user_id", "next_follow_up_at");

-- CreateIndex
CREATE INDEX "enquiries_phone_normalized_idx" ON "enquiries"("phone_normalized");

-- CreateIndex
CREATE INDEX "enquiries_branch_id_created_at_idx" ON "enquiries"("branch_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiries_source_created_at_idx" ON "enquiries"("source", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_stage_history_enquiry_id_created_at_idx" ON "enquiry_stage_history"("enquiry_id", "created_at");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_enquiry_id_done_at_idx" ON "enquiry_follow_ups"("enquiry_id", "done_at");

-- CreateIndex
CREATE INDEX "enquiry_follow_ups_due_at_idx" ON "enquiry_follow_ups"("due_at");

-- CreateIndex
CREATE INDEX "enquiry_consents_enquiry_id_channel_created_at_idx" ON "enquiry_consents"("enquiry_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "trial_sessions_batch_id_session_date_idx" ON "trial_sessions"("batch_id", "session_date");

-- CreateIndex
CREATE INDEX "trial_sessions_enquiry_id_idx" ON "trial_sessions"("enquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_sessions_enquiry_id_batch_id_session_date_key" ON "trial_sessions"("enquiry_id", "batch_id", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_dedupe_key_key" ON "notification_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_events_type_created_at_idx" ON "notification_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_user_id_read_at_created_at_idx" ON "notifications"("recipient_user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_event_id_recipient_user_id_key" ON "notifications"("event_id", "recipient_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_type_key" ON "notification_preferences"("user_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "notification_user_settings_user_id_key" ON "notification_user_settings"("user_id");

-- CreateIndex
CREATE INDEX "metric_daily_branch_business_date_idx" ON "metric_daily_branch"("business_date");

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_branch_branch_id_business_date_key" ON "metric_daily_branch"("branch_id", "business_date");

-- CreateIndex
CREATE INDEX "metric_reconciliation_runs_business_date_status_idx" ON "metric_reconciliation_runs"("business_date", "status");

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_converted_student_id_fkey" FOREIGN KEY ("converted_student_id") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_lost_reason_id_fkey" FOREIGN KEY ("lost_reason_id") REFERENCES "lost_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "enquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_stage_history" ADD CONSTRAINT "enquiry_stage_history_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_stage_history" ADD CONSTRAINT "enquiry_stage_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_done_by_user_id_fkey" FOREIGN KEY ("done_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_follow_ups" ADD CONSTRAINT "enquiry_follow_ups_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_consents" ADD CONSTRAINT "enquiry_consents_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enquiry_consents" ADD CONSTRAINT "enquiry_consents_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_enquiry_id_fkey" FOREIGN KEY ("enquiry_id") REFERENCES "enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_outcome_marked_by_user_id_fkey" FOREIGN KEY ("outcome_marked_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_sessions" ADD CONSTRAINT "trial_sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_user_settings" ADD CONSTRAINT "notification_user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily_branch" ADD CONSTRAINT "metric_daily_branch_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_reconciliation_runs" ADD CONSTRAINT "metric_reconciliation_runs_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

