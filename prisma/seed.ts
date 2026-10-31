import { PrismaClient, Role, BranchType, StudentStatus, ConsentStatus, FeeFrequency, DueStatus, EntryType, PaymentMethod, TemplateStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Hash helper
  const hash = (pw: string) => bcrypt.hashSync(pw, 12)

  // ── Branches ──────────────────────────────────────────────
  const ownedBranch = await prisma.branch.upsert({
    where: { code: 'KKP' },
    update: {},
    create: {
      code: 'KKP',
      name: 'CPA Kukatpally',
      type: BranchType.OWNED,
      city: 'Hyderabad',
      address: 'Plot 12, Kukatpally, Hyderabad',
      isActive: true,
    },
  })

  const franchiseBranch = await prisma.branch.upsert({
    where: { code: 'HBN' },
    update: {},
    create: {
      code: 'HBN',
      name: 'CPA Hitech City (Franchise)',
      type: BranchType.FRANCHISE,
      city: 'Hyderabad',
      address: 'Hitech City, Hyderabad',
      isActive: true,
    },
  })

  // ── ReceiptCounters ────────────────────────────────────────
  await prisma.receiptCounter.upsert({
    where: { branchId: ownedBranch.id },
    update: {},
    create: { branchId: ownedBranch.id, lastNumber: 0 },
  })
  await prisma.receiptCounter.upsert({
    where: { branchId: franchiseBranch.id },
    update: {},
    create: { branchId: franchiseBranch.id, lastNumber: 0 },
  })

  // ── Admin ─────────────────────────────────────────────────
  const admin = await prisma.user.upsert({
    where: { loginId: 'ADM-001' },
    update: {},
    create: {
      loginId: 'ADM-001',
      email: 'admin@cpacricket.in',
      name: 'Super Admin',
      role: Role.ADMIN,
      branchId: null,
      passwordHash: hash('Admin@12345'),
      mustChangePassword: false,
      twoFactorEnabled: false,
      isActive: true,
    },
  })

  // ── Owned branch manager ───────────────────────────────────
  const manager1 = await prisma.user.upsert({
    where: { loginId: 'MGR-KKP-001' },
    update: {},
    create: {
      loginId: 'MGR-KKP-001',
      name: 'Ramesh Kumar',
      role: Role.MANAGER,
      branchId: ownedBranch.id,
      passwordHash: hash('Manager@123'),
      mustChangePassword: false,
      isActive: true,
      createdById: admin.id,
    },
  })

  // ── Franchise branch manager ───────────────────────────────
  const manager2 = await prisma.user.upsert({
    where: { loginId: 'MGR-HBN-001' },
    update: {},
    create: {
      loginId: 'MGR-HBN-001',
      name: 'Suresh Reddy',
      role: Role.MANAGER,
      branchId: franchiseBranch.id,
      passwordHash: hash('Manager@123'),
      mustChangePassword: false,
      isActive: true,
      createdById: admin.id,
    },
  })

  // ── Coaches ───────────────────────────────────────────────
  const coach1 = await prisma.user.upsert({
    where: { loginId: 'CCH-KKP-001' },
    update: {},
    create: {
      loginId: 'CCH-KKP-001',
      name: 'Arjun Sharma',
      role: Role.COACH,
      branchId: ownedBranch.id,
      passwordHash: hash('Coach@1234'),
      mustChangePassword: false,
      isActive: true,
      createdById: manager1.id,
    },
  })

  const coach2 = await prisma.user.upsert({
    where: { loginId: 'CCH-KKP-002' },
    update: {},
    create: {
      loginId: 'CCH-KKP-002',
      name: 'Vikram Patel',
      role: Role.COACH,
      branchId: ownedBranch.id,
      passwordHash: hash('Coach@1234'),
      mustChangePassword: false,
      isActive: true,
      createdById: manager1.id,
    },
  })

  // ── Batches ───────────────────────────────────────────────
  const batch1 = await prisma.batch.upsert({
    where: { branchId_name: { branchId: ownedBranch.id, name: 'Under-14 Morning' } },
    update: {},
    create: {
      branchId: ownedBranch.id,
      name: 'Under-14 Morning',
      ageGroup: 'U14',
      capacity: 20,
      daysOfWeek: [1, 3, 5],
      startTime: '06:00',
      endTime: '08:00',
      isActive: true,
    },
  })

  const batch2 = await prisma.batch.upsert({
    where: { branchId_name: { branchId: ownedBranch.id, name: 'Under-17 Evening' } },
    update: {},
    create: {
      branchId: ownedBranch.id,
      name: 'Under-17 Evening',
      ageGroup: 'U17',
      capacity: 15,
      daysOfWeek: [2, 4, 6],
      startTime: '16:00',
      endTime: '18:00',
      isActive: true,
    },
  })

  const batch3 = await prisma.batch.upsert({
    where: { branchId_name: { branchId: ownedBranch.id, name: 'Open Batch' } },
    update: {},
    create: {
      branchId: ownedBranch.id,
      name: 'Open Batch',
      ageGroup: null,
      capacity: 25,
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '07:00',
      endTime: '09:00',
      isActive: true,
    },
  })

  // ── Assign coaches to batches ──────────────────────────────
  for (const [batchId, coachId] of [
    [batch1.id, coach1.id],
    [batch2.id, coach2.id],
    [batch3.id, coach1.id],
  ] as [string, string][]) {
    const existing = await prisma.batchCoach.findFirst({
      where: { batchId, coachId, assignedTo: null },
    })
    if (!existing) {
      await prisma.batchCoach.create({
        data: { batchId, coachId, isPrimary: true, assignedFrom: new Date() },
      })
    }
  }

  // ── Fee Plans ─────────────────────────────────────────────
  const monthlyPlan = await prisma.feePlan.upsert({
    where: { id: 'feeplan-monthly' },
    update: {},
    create: {
      id: 'feeplan-monthly',
      name: 'Monthly Tuition',
      amountPaise: 250000, // ₹2,500
      frequency: FeeFrequency.MONTHLY,
      isActive: true,
    },
  })

  const admissionPlan = await prisma.feePlan.upsert({
    where: { id: 'feeplan-admission' },
    update: {},
    create: {
      id: 'feeplan-admission',
      name: 'Admission Fee',
      amountPaise: 100000, // ₹1,000
      frequency: FeeFrequency.ONE_TIME,
      isActive: true,
    },
  })

  // ── Message Templates ──────────────────────────────────────
  await prisma.messageTemplate.upsert({
    where: { name: 'absence_alert_v1' },
    update: {},
    create: {
      name: 'absence_alert_v1',
      language: 'en',
      category: 'UTILITY',
      bodyPreview: 'Dear {{1}}, your ward {{2}} was marked absent in the {{3}} session today at CPA Cricket Academy.',
      metaStatus: TemplateStatus.APPROVED,
      isActive: true,
    },
  })

  await prisma.messageTemplate.upsert({
    where: { name: 'fee_reminder_v1' },
    update: {},
    create: {
      name: 'fee_reminder_v1',
      language: 'en',
      category: 'UTILITY',
      bodyPreview: 'Dear {{1}}, a fee of ₹{{2}} is due on {{3}} for {{4}}. Please pay at the earliest.',
      metaStatus: TemplateStatus.APPROVED,
      isActive: true,
    },
  })

  await prisma.messageTemplate.upsert({
    where: { name: 'welcome_v1' },
    update: {},
    create: {
      name: 'welcome_v1',
      language: 'en',
      category: 'UTILITY',
      bodyPreview: 'Welcome to CPA Cricket Academy! {{1}} (ID: {{2}}) has been enrolled in {{3}}. Batch timing: {{4}}. Coach: {{5}}.',
      metaStatus: TemplateStatus.APPROVED,
      isActive: true,
    },
  })

  await prisma.messageTemplate.upsert({
    where: { name: 'payment_receipt_v1' },
    update: {},
    create: {
      name: 'payment_receipt_v1',
      language: 'en',
      category: 'UTILITY',
      bodyPreview: 'Receipt {{1}}: ₹{{2}} received for {{3}} on {{4}}. Thank you! - CPA Cricket Academy',
      metaStatus: TemplateStatus.DRAFT,
      isActive: false,
    },
  })

  // ── Students and Guardians (20 students) ──────────────────
  const studentData = [
    { name: 'Aditya Sharma', dob: '2012-03-15', guardian: 'Rakesh Sharma', phone: '+919876543210', batch: batch1 },
    { name: 'Rahul Verma', dob: '2012-07-22', guardian: 'Sunil Verma', phone: '+919876543211', batch: batch1 },
    { name: 'Kiran Reddy', dob: '2011-11-05', guardian: 'Venkat Reddy', phone: '+919876543212', batch: batch1 },
    { name: 'Aryan Mehta', dob: '2013-01-18', guardian: 'Ankit Mehta', phone: '+919876543213', batch: batch1 },
    { name: 'Dev Patel', dob: '2012-09-30', guardian: 'Priya Patel', phone: '+919876543214', batch: batch1 },
    { name: 'Rohan Singh', dob: '2012-05-12', guardian: 'Gurpreet Singh', phone: '+919876543215', batch: batch1 },
    { name: 'Vijay Kumar', dob: '2013-08-25', guardian: 'Manoj Kumar', phone: '+919876543216', batch: batch1 },
    { name: 'Suresh Nair', dob: '2011-04-08', guardian: 'Arun Nair', phone: '+919876543217', batch: batch1 },
    // Siblings sharing same guardian (phone +919876543218)
    { name: 'Pranav Iyer', dob: '2010-12-20', guardian: 'Krishnan Iyer', phone: '+919876543218', batch: batch2 },
    { name: 'Nikhil Iyer', dob: '2009-06-14', guardian: 'Krishnan Iyer', phone: '+919876543218', batch: batch2 },
    { name: 'Arjun Raju', dob: '2010-02-28', guardian: 'Balasubramanian Raju', phone: '+919876543219', batch: batch2 },
    { name: 'Harish Pillai', dob: '2009-10-15', guardian: 'Ramesh Pillai', phone: '+919876543220', batch: batch2 },
    { name: 'Sanjay Rao', dob: '2010-08-03', guardian: 'Madhav Rao', phone: '+919876543221', batch: batch2 },
    { name: 'Tarun Mishra', dob: '2009-03-22', guardian: 'Deepak Mishra', phone: '+919876543222', batch: batch2 },
    { name: 'Amit Joshi', dob: '2008-07-17', guardian: 'Rajesh Joshi', phone: '+919876543223', batch: batch3 },
    { name: 'Vivek Choudhary', dob: '2007-11-09', guardian: 'Hemant Choudhary', phone: '+919876543224', batch: batch3 },
    { name: 'Ravi Kapoor', dob: '2008-05-30', guardian: 'Suresh Kapoor', phone: '+919876543225', batch: batch3 },
    // No opt-in
    { name: 'Mohit Gupta', dob: '2009-01-12', guardian: 'Rajiv Gupta', phone: '+919876543226', batch: batch3, noOptIn: true },
    { name: 'Deepak Yadav', dob: '2010-09-05', guardian: 'Ramesh Yadav', phone: '+919876543227', batch: batch3, noOptIn: true },
    { name: 'Ankit Tiwari', dob: '2011-04-18', guardian: 'Vinod Tiwari', phone: '+919876543228', batch: batch1 },
  ]

  const guardianMap = new Map<string, string>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = 0; i < studentData.length; i++) {
    const s = studentData[i] as any
    const noOptIn = s.noOptIn === true

    // Upsert guardian (siblings share one)
    let guardianId = guardianMap.get(s.phone)
    if (!guardianId) {
      const guardian = await prisma.guardian.upsert({
        where: { branchId_whatsappNumber: { branchId: ownedBranch.id, whatsappNumber: s.phone } },
        update: {},
        create: {
          branchId: ownedBranch.id,
          name: s.guardian,
          whatsappNumber: s.phone,
          relationship: 'Father',
          whatsappOptIn: !noOptIn,
        },
      })
      guardianId = guardian.id
      guardianMap.set(s.phone, guardianId)

      // Consent record
      await prisma.consentRecord.create({
        data: {
          guardianId,
          channel: 'WHATSAPP',
          status: noOptIn ? ConsentStatus.REVOKED : ConsentStatus.GRANTED,
          source: 'admission_form',
          recordedById: manager1.id,
        },
      })
    }

    // Increment studentSeq and create student
    const branch = await prisma.branch.update({
      where: { id: ownedBranch.id },
      data: { studentSeq: { increment: 1 } },
    })
    const studentCode = `KKP-${String(branch.studentSeq).padStart(6, '0')}`

    const existingStudent = await prisma.student.findFirst({ where: { studentCode } })
    if (existingStudent) continue

    const student = await prisma.student.create({
      data: {
        studentCode,
        branchId: ownedBranch.id,
        guardianId,
        name: s.name,
        dob: new Date(s.dob),
        gender: i % 2 === 0 ? 'Male' : 'Male',
        status: StudentStatus.ACTIVE,
        joinedOn: new Date(today.getFullYear(), today.getMonth() - 2, 1),
        emergencyName: s.guardian,
        emergencyPhone: s.phone,
      },
    })

    // Enrollment
    await prisma.enrollment.create({
      data: {
        studentId: student.id,
        batchId: s.batch.id,
        startDate: new Date(today.getFullYear(), today.getMonth() - 2, 1),
      },
    })

    // Fee plans
    const sfp = await prisma.studentFeePlan.create({
      data: {
        studentId: student.id,
        feePlanId: monthlyPlan.id,
        startDate: new Date(today.getFullYear(), today.getMonth() - 2, 1),
      },
    })

    // Create 3 monthly dues: 2 months ago, 1 month ago, current month
    for (let m = -2; m <= 0; m++) {
      const periodStart = new Date(today.getFullYear(), today.getMonth() + m, 1)
      const periodEnd   = new Date(today.getFullYear(), today.getMonth() + m + 1, 0)
      const dueDate     = new Date(today.getFullYear(), today.getMonth() + m, 10)
      const label       = `${periodStart.toLocaleString('default', { month: 'long' })} ${periodStart.getFullYear()} Monthly Fee`

      let status: DueStatus
      let paidPaise = 0
      if (m === -2) {
        status = DueStatus.PAID
        paidPaise = 250000
      } else if (m === -1) {
        status = i % 3 === 0 ? DueStatus.PARTIAL : DueStatus.PAID
        paidPaise = i % 3 === 0 ? 125000 : 250000
      } else {
        status = DueStatus.UNPAID
        paidPaise = 0
      }

      await prisma.feeDue.create({
        data: {
          branchId: ownedBranch.id,
          studentId: student.id,
          feePlanId: monthlyPlan.id,
          studentFeePlanId: sfp.id,
          label,
          periodStart,
          periodEnd,
          dueDate,
          amountPaise: 250000,
          paidPaise,
          status,
        },
      })
    }

    // Admission fee due (waived for one student)
    await prisma.studentFeePlan.create({
      data: {
        studentId: student.id,
        feePlanId: admissionPlan.id,
        startDate: new Date(today.getFullYear(), today.getMonth() - 2, 1),
      },
    })
  }

  console.log('✅ Seed complete.')
  console.log('')
  console.log('Demo credentials:')
  console.log('  Admin:   ADM-001     / Admin@12345')
  console.log('  Manager: MGR-KKP-001 / Manager@123')
  console.log('  Coach:   CCH-KKP-001 / Coach@1234')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
