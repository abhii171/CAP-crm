# CPA Cricket Academy CRM — Operational User Guides (Step 1.17)

Comprehensive standard operating procedures (SOP) and user manuals for **Admin**, **Branch Manager**, and **Coaching Staff** across Owned and Franchise Academy branches.

---

## 1. Quick Role Access Matrix

| Capability | Super Admin (`ADMIN`) | Owned Manager (`MANAGER`) | Franchise Manager (`MANAGER`) | Coach (`COACH`) |
| :--- | :---: | :---: | :---: | :---: |
| **Multi-Branch Overview** | ✅ All Branches | ❌ Own Branch Only | ❌ Own Branch Only | ❌ Assigned Batches |
| **Create Branches & Rules** | ✅ Full Access | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Manage Staff / Coaches** | ✅ Full Access | 👁️ View Coaches | 👁️ View Coaches | ❌ Forbidden |
| **Assign Coach to Batch** | ✅ Allowed | ✅ Allowed | ❌ Forbidden (Policy § 5) | ❌ Forbidden |
| **Admit Cadets / Students** | ✅ Full Access | ✅ Own Branch | ✅ Own Branch | ❌ Forbidden |
| **Record Cash / Fee Dues** | ✅ Full Access | ✅ Own Branch | ✅ Own Branch | ❌ Masked / Forbidden |
| **Execute Payment Reversal** | ✅ Unlimited | ✅ Up to ₹5,000 | ✅ Up to ₹5,000 | ❌ Forbidden |
| **Daily Cash Close & Lock** | ✅ Full Oversight | ✅ Reconcile & Lock | ✅ Reconcile & Lock | ❌ Forbidden |
| **Mark Ground Attendance** | 👁️ View & Override | 👁️ View & Override | 👁️ View & Override | ✅ Mobile Pitch Marking |
| **WhatsApp Notices & Inbox** | ✅ Broadcast & Triage| ✅ Branch Inbox & Notice| ✅ Branch Inbox & Notice| ❌ Forbidden |
| **System Backup & Restore** | ✅ SHA-256 Backups | ❌ Forbidden | ❌ Forbidden | ❌ Forbidden |
| **Financial / CSV Reports** | ✅ All Branches | 👁️ Own Branch Only | 👁️ Own Branch Only | ❌ Forbidden |

---

## 2. Super Admin Guide (`ADM-001`)

### 2.1 Branch Management
1. Navigate to **Branches** (`/admin/branches`).
2. Click **+ Add Branch**. Enter Branch Name, Address, Facility Type (`Owned Facility` vs `Franchise Partner`), and a unique 2-5 letter uppercase branch code (e.g., `GCH` for Gachibowli).
3. *Note on Franchise vs Owned:* Franchise branches are strictly restricted from assigning coaches to batches—head coaching remains centrally governed by academy directors.

### 2.2 Staff Onboarding & Allocation
1. Navigate to **Staff** (`/admin/users`).
2. Use the Branch dropdown filter to isolate staff per branch.
3. Click **+ Add Staff Member** to register a new Manager or Coach. The system automatically creates a deterministic sequential Login ID (e.g., `CCH-GCH-001`).

### 2.3 Financial Intelligence & Audit Reports
1. Navigate to **Reports** (`/admin/reports`).
2. **Outstanding Fees:** Inspect the 4 aging buckets: Current (`< due date`), `1-7 Days Overdue`, `8-14 Days Overdue`, and `> 14 Days Overdue` (automatically flagged for manager follow-up).
3. **Collections (Cash vs Online):** Review gross collections, payment modes, receipt counts, and net revenue after reversals.
4. **Unclosed Days:** Inspect branches with open business dates or cash discrepancies between expected physical cash and counted cash.
5. **1-Click CSV Export:** Click **Export CSV** on any tab to download standard RFC 4180 CSV files for accounting.

### 2.4 Disaster Recovery & System Backups
1. Trigger automatic snapshots via `GET /api/backup?download=true` to export a cryptographically verified JSON archive containing all datasets.
2. The system calculates a cryptographic SHA-256 hash to guarantee zero tampering.

---

## 3. Branch Manager Guide (`MGR-KKP-001`, `MGR-HBN-001`)

### 3.1 Morning Routine
1. Log in to your branch dashboard (`/manager`).
2. Check the **Daily Close Status** pill. Ensure yesterday's register is closed and locked.
3. Review **Unread Inquiries** in the WhatsApp communications tile.

### 3.2 Cadet Admission & Batch Allocation
1. Navigate to **Students** (`/manager/students`).
2. Click **+ Add Cadet**. Enter Full Name, Date of Birth, Gender, Parent/Guardian Name, and WhatsApp Number.
3. The system executes duplicate detection against phone numbers to prevent accidental double admissions while allowing siblings under the same parent.
4. In the **Batches** tab, managers can add individual students or click **+ Add Multiple Students** to bulk-enroll up to 10 cadets into a batch in a single operation.

### 3.3 Fee Collection & Sequential Receipts
1. Navigate to **Fee Collections** (`/manager/payments`).
2. Select cadet by name or code. The outstanding balance is automatically populated.
3. Enter amount collected in cash. The system immediately:
   - Generates a **gapless sequential receipt number** (e.g., `#101`).
   - Allocates the payment to the oldest unpaid due.
   - Dispatches a WhatsApp receipt notification to the parent's phone.

### 3.4 Day-End Cash Reconciliation & Closing Lock
1. At closing time, open **Daily Cash Close** (`/manager/payments#close`).
2. The system computes **Expected Physical Cash** from all cash receipts issued on that date.
3. Count the physical cash in the academy drawer and enter **Counted Cash Amount**.
4. If there is variance (e.g. ₹50 discrepancy), enter an explanation in **Discrepancy Note**.
5. Click **Reconcile & Lock Day**.
6. *Important:* Once locked, backdated cash transactions on that date are strictly prohibited by the immutable financial ledger.

---

## 4. Coaching Staff Guide (`CCH-KKP-001`)

### 4.1 Mobile Pitch Attendance Marking
1. Log in to your coach dashboard (`/coach`) from your mobile device or tablet.
2. Select your batch and today's session.
3. Tap large touch-friendly status badges for each cadet:
   - 🟢 **Present** (P)
   - 🔴 **Absent** (A)
   - 🟡 **Late** (L)
   - ⚪ **Excused** (E)
4. Click **Submit Attendance**.

### 4.2 Automated Absence Alerts
- Submitting an **Absent** status automatically queues and dispatches a polite WhatsApp notification to the parent within seconds: *"Aditya was marked absent for today's Under-14 Morning training session at CPA Kukatpally."*

### 4.3 Weather & Emergency Cancellations
- In the event of heavy rain or unplayable pitch conditions, click **Cancel Session (Rain / Weather)**.
- The system marks the session as `CANCELLED` and **automatically suppresses absence alerts**, ensuring parents are not falsely notified that their child was absent.

### 4.4 Data Privacy Protection
- Coaches see student names, batch allocations, and training notes.
- In strict adherence to DPDP Act privacy rules, **guardian phone numbers and fee payment records are automatically masked/stripped** from coach views.

---

## 5. Phase 1 Pilot Exit Checklist

| Milestone | Criterion | Status |
| :--- | :--- | :---: |
| **Admissions** | Gapless sequential student codes (`KKP-000001`) & duplicate phone detection | ✅ Verified |
| **Attendance** | Mobile touch-marking, absence alerts over WhatsApp, weather cancellation | ✅ Verified |
| **Cash Fees** | Gapless sequential receipt numbering under concurrent requests | ✅ Verified |
| **Reversals** | Manager limit <= ₹5,000, admin approval for > ₹5,000, append-only negative ledger | ✅ Verified |
| **Daily Close** | Reconciliation with expected cash, discrepancy notes, date locking | ✅ Verified |
| **Webhooks** | Razorpay payment link integration with HMAC verification & idempotency | ✅ Verified |
| **Reports** | 4-tier aging schedule, collections breakdown, unclosed days, RFC 4180 CSV export | ✅ Verified |
| **Backups** | Full snapshot export with SHA-256 cryptographic integrity verification | ✅ Verified |
| **Health** | `/api/health` system diagnostics endpoint monitoring database, disk, & memory | ✅ Verified |

