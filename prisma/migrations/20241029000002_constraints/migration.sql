-- Correct raw SQL constraints for CPA Cricket Academy CRM
-- These supplement what Prisma cannot express in the schema.

-- Admin has no branch; manager and coach must have one
ALTER TABLE "User" ADD CONSTRAINT user_role_branch_chk
  CHECK (
    (role = 'ADMIN' AND "branchId" IS NULL) OR
    (role <> 'ADMIN' AND "branchId" IS NOT NULL)
  );

-- Money sanity
ALTER TABLE "Payment"  ADD CONSTRAINT payment_amount_chk  CHECK ("amountPaise" > 0);
ALTER TABLE "FeeDue"   ADD CONSTRAINT due_amount_chk      CHECK ("amountPaise" >= 0 AND "paidPaise" >= 0);
ALTER TABLE "FeePlan"  ADD CONSTRAINT plan_amount_chk     CHECK ("amountPaise" >= 0);
ALTER TABLE "Batch"    ADD CONSTRAINT batch_capacity_chk  CHECK (capacity > 0);

-- Reversal rules
ALTER TABLE "Payment" ADD CONSTRAINT payment_reversal_chk CHECK (
  ("entryType" = 'PAYMENT'  AND "reversalOfId" IS NULL) OR
  ("entryType" = 'REVERSAL' AND "reversalOfId" IS NOT NULL AND reason IS NOT NULL)
);

-- Online payments need a gateway ID; cash payments need a collector
ALTER TABLE "Payment" ADD CONSTRAINT payment_method_chk CHECK (
  (method = 'ONLINE' AND "gatewayPaymentId" IS NOT NULL) OR
  (method = 'CASH'   AND "collectedById"    IS NOT NULL)
);

-- Only one open enrollment per student per batch
CREATE UNIQUE INDEX enrollment_open_uniq
  ON "Enrollment" ("studentId", "batchId")
  WHERE "endDate" IS NULL;

-- Only one current primary assignment per coach per batch
CREATE UNIQUE INDEX batchcoach_open_uniq
  ON "BatchCoach" ("batchId", "coachId")
  WHERE "assignedTo" IS NULL;

-- Append-only enforcement
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_change
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER payment_no_change
  BEFORE UPDATE OR DELETE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TRIGGER alloc_no_change
  BEFORE UPDATE OR DELETE ON "PaymentAllocation"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- Receipt: allow pdfUrl to be set after creation (one-time), block delete and other updates
CREATE OR REPLACE FUNCTION receipt_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Receipt rows are append-only (DELETE blocked)';
  END IF;
  IF NEW."branchId"  IS DISTINCT FROM OLD."branchId"  OR
     NEW."number"    IS DISTINCT FROM OLD."number"     OR
     NEW."paymentId" IS DISTINCT FROM OLD."paymentId"  OR
     NEW."issuedAt"  IS DISTINCT FROM OLD."issuedAt"   THEN
    RAISE EXCEPTION 'Receipt immutable fields cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER receipt_guard
  BEFORE UPDATE OR DELETE ON "Receipt"
  FOR EACH ROW EXECUTE FUNCTION receipt_guard();
