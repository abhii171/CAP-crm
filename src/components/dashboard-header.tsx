'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, ShieldCheck, MapPin, Building2, User } from 'lucide-react'

interface DashboardUser {
  loginId: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'COACH'
  branchId: string | null
}

interface DashboardHeaderProps {
  user?: DashboardUser
}

export function DashboardHeader({ user: propUser }: DashboardHeaderProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [user, setUser] = React.useState<DashboardUser | null>(propUser || null)

  React.useEffect(() => {
    if (!user) {
      fetch('/api/auth/me')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.user) {
            setUser(data.user)
          }
        })
        .catch(() => {})
    }
  }, [user])

  const currentUser: DashboardUser = user || {
    loginId: 'DEMO',
    name: 'CPA Staff',
    role: 'MANAGER',
    branchId: 'branch-kkp',
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  const roleBadgeStyle =
    currentUser.role === 'ADMIN'
      ? 'bg-[var(--accent-50)] text-[var(--warning)] border-[var(--warning)]/30'
      : currentUser.role === 'MANAGER'
      ? 'bg-[var(--primary-50)] text-[var(--primary-600)] border-[var(--primary-600)]/30'
      : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)]'

  const branchDisplay =
    currentUser.role === 'ADMIN'
      ? 'All Branches'
      : currentUser.branchId === 'branch-hbn'
      ? 'Hitech City (Franchise)'
      : 'Kukatpally (Owned)'

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--surface)] border-b border-[var(--border)] px-4 sm:px-6 py-3 flex items-center justify-between">
      {/* Brand & Branch */}
      <div className="flex items-center gap-3">
        <a href={currentUser.role === 'ADMIN' ? '/admin' : currentUser.role === 'COACH' ? '/coach' : '/manager'} className="w-8 h-8 rounded-lg bg-[var(--primary-600)] flex items-center justify-center text-white font-bold text-sm shadow-xs">
          CPA
        </a>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[var(--text)] tracking-tight">
              CPA Cricket Academy
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleBadgeStyle}`}>
              {currentUser.role}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-medium mt-0.5">
            {currentUser.role === 'ADMIN' ? (
              <>
                <Building2 className="w-3.5 h-3.5 text-[var(--accent-500)]" />
                <span>{branchDisplay}</span>
              </>
            ) : (
              <>
                <MapPin className="w-3.5 h-3.5 text-[var(--primary-600)]" />
                <span>{branchDisplay}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
        {currentUser.role === 'ADMIN' && (
          <>
            <a href="/admin/branches" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Branches</a>
            <a href="/admin/users" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Staff</a>
            <a href="/admin/batches" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Batches</a>
            <a href="/admin/students" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Students</a>
            <a href="/admin/fee-plans" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Fee Plans</a>
            <a href="/admin/messages" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">WhatsApp</a>
            <a href="/admin/audit" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Audit</a>
          </>
        )}
        {currentUser.role === 'MANAGER' && (
          <>
            <a href="/manager/batches" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Batches</a>
            <a href="/manager/coaches" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Coaches</a>
            <a href="/manager/students" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Students</a>
            <a href="/manager/attendance" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Attendance</a>
            <a href="/manager/payments" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Fee Collections</a>
            <a href="/manager/messages" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">WhatsApp</a>
          </>
        )}
        {currentUser.role === 'COACH' && (
          <>
            <a href="/coach/attendance" className="px-2.5 py-1.5 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">Mark Attendance</a>
          </>
        )}
      </nav>

      {/* User Info & Actions */}
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="hidden sm:flex flex-col text-right">
          <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1 justify-end">
            <User className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            {currentUser.name}
          </span>
          <span className="text-[11px] text-[var(--text-muted)] font-mono">
            ID: {currentUser.loginId}
          </span>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="h-8 px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text)] text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Sign out of system"
        >
          <LogOut className="w-3.5 h-3.5 text-[var(--danger)]" />
          <span className="hidden xs:inline">Sign out</span>
        </button>
      </div>
    </header>
  )
}

