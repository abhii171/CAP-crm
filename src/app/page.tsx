import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  if (user.role === 'COACH') redirect('/coach')
  if (user.role === 'MANAGER') redirect('/manager')
  redirect('/admin')
}
