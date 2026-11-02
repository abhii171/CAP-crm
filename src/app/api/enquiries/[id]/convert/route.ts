import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { convertEnquiryToStudent } from '@/modules/phase2'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const result = await convertEnquiryToStudent(user, {
      enquiryId: params.id,
      batchId: body.batchId,
      dob: body.dob,
      gender: body.gender,
      childName: body.childName,
      guardianName: body.guardianName,
      guardianRelation: body.guardianRelation,
      whatsappOptIn: body.whatsappOptIn,
      emergencyName: body.emergencyName,
      emergencyPhone: body.emergencyPhone,
      feePlanId: body.feePlanId,
      notes: body.notes,
      managerOverrideReason: body.managerOverrideReason,
    })

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'RecordNotFoundError' ? 404 : 400)
    return NextResponse.json({ error: err.message }, { status })
  }
}

