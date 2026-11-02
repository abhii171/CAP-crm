'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  LogOut,
  MapPin,
  Building2,
  User,
  Menu,
  X,
  Users,
  Calendar,
  IndianRupee,
  MessageCircle,
  FileText,
  ShieldAlert,
  Clock,
  UserCheck,
  Compass,
  CheckCircle2,
} from 'lucide-react'

interface DashboardUser {
  loginId: string
  name: string
  role: 'ADMIN' | 'MANAGER' | 'COACH'
  branchId: string | null
}

interface DashboardHeaderProps {
  user?: DashboardUser
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

export function DashboardHeader({ user: propUser }: DashboardHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [loggingOut, setLoggingOut] = useState(false)
  const [user, setUser] = useState<DashboardUser | null>(propUser || null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
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

  // Close mobile drawer when route changes or resize to desktop
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

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

  const homeHref =
    currentUser.role === 'ADMIN'
      ? '/admin'
      : currentUser.role === 'COACH'
      ? '/coach'
      : '/manager'

  const adminNavItems: NavItem[] = [
    { href: '/admin/enquiries', label: 'Enquiries', icon: Compass },
    { href: '/admin/branches', label: 'Branches', icon: Building2 },
    { href: '/admin/users', label: 'Staff', icon: UserCheck },
    { href: '/admin/batches', label: 'Batches', icon: Calendar },
    { href: '/admin/students', label: 'Students', icon: Users },
    { href: '/admin/fee-plans', label: 'Fee Plans', icon: IndianRupee },
    { href: '/admin/messages', label: 'WhatsApp', icon: MessageCircle },
    { href: '/admin/reports', label: 'Reports', icon: FileText },
    { href: '/admin/audit', label: 'Audit', icon: ShieldAlert },
  ]

  const managerNavItems: NavItem[] = [
    { href: '/manager/enquiries', label: 'Enquiries & Trials', icon: Compass },
    { href: '/manager/batches', label: 'Batches', icon: Calendar },
    { href: '/manager/coaches', label: 'Coaches', icon: UserCheck },
    { href: '/manager/students', label: 'Students', icon: Users },
    { href: '/manager/attendance', label: 'Attendance', icon: Clock },
    { href: '/manager/payments', label: 'Fee Collections', icon: IndianRupee },
    { href: '/manager/messages', label: 'WhatsApp', icon: MessageCircle },
  ]

  const coachNavItems: NavItem[] = [
    { href: '/coach/attendance', label: 'Mark Attendance', icon: Clock },
  ]

  const navItems =
    currentUser.role === 'ADMIN'
      ? adminNavItems
      : currentUser.role === 'MANAGER'
      ? managerNavItems
      : coachNavItems

  const isItemActive = (href: string) => {
    if (!pathname) return false
    if (pathname === href) return true
    if (href !== '/admin' && href !== '/manager' && href !== '/coach' && pathname.startsWith(href)) {
      return true
    }
    return false
  }

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--surface)] border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand & Branch */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
          <Link
            href={homeHref}
            className="w-8 h-8 rounded-lg bg-[var(--primary-600)] flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0 hover:bg-[var(--primary-700)] transition-colors"
            title="CPA Home"
          >
            CPA
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <Link
                href={homeHref}
                className="font-bold text-xs sm:text-sm text-[var(--text)] tracking-tight hover:text-[var(--primary-600)] transition-colors whitespace-nowrap"
              >
                CPA Cricket Academy
              </Link>
              <span
                className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold border shrink-0 ${roleBadgeStyle}`}
              >
                {currentUser.role}
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px] sm:text-xs text-[var(--text-muted)] font-medium mt-0.5 truncate">
              {currentUser.role === 'ADMIN' ? (
                <>
                  <Building2 className="w-3 h-3 text-[var(--accent-500)] shrink-0" />
                  <span className="truncate">{branchDisplay}</span>
                </>
              ) : (
                <>
                  <MapPin className="w-3 h-3 text-[var(--primary-600)] shrink-0" />
                  <span className="truncate">{branchDisplay}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Desktop Navigation Links (>=1024px) */}
        <nav
          className="hidden lg:flex items-center gap-0.5 xl:gap-1 text-xs font-medium min-w-0 overflow-x-auto no-scrollbar"
          aria-label="Main Navigation"
        >
          {navItems.map((item) => {
            const active = isItemActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href as any}
                className={`px-2 xl:px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 text-xs ${
                  active
                    ? 'bg-[var(--surface-2)] text-[var(--primary-600)] font-semibold shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Right: User Profile & Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* User ID Pill (Desktop >= 1024px) */}
          <div className="hidden lg:flex flex-col text-right shrink-0">
            <span className="text-xs font-semibold text-[var(--text)] flex items-center gap-1 justify-end whitespace-nowrap">
              <User className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              <span className="max-w-[140px] truncate">{currentUser.name}</span>
            </span>
            <span className="text-[11px] text-[var(--text-muted)] font-mono">
              ID: {currentUser.loginId}
            </span>
          </div>

          {/* Desktop Sign Out Button */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="hidden sm:inline-flex h-8 px-2.5 sm:px-3 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text)] text-xs font-medium items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Sign out of system"
          >
            <LogOut className="w-3.5 h-3.5 text-[var(--danger)] shrink-0" />
            <span className="whitespace-nowrap">Sign out</span>
          </button>

          {/* Mobile Quick Sign Out Button (< sm) */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="sm:hidden p-2 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--danger)] transition-colors cursor-pointer shrink-0"
            title="Sign out of system"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4 shrink-0" />
          </button>

          {/* Hamburger Menu Toggle (Mobile & Tablet < 1024px) */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-md border border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--text)] transition-colors cursor-pointer shrink-0"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4 shrink-0 text-[var(--primary-600)]" />
            ) : (
              <Menu className="w-4 h-4 shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Collapsible Drawer (< 1024px) */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[var(--border)] bg-[var(--surface)] shadow-lg animate-in fade-in slide-in-from-top-2 duration-150">
          {/* User Info Strip in Drawer */}
          <div className="px-4 py-3 bg-[var(--surface-2)]/60 border-b border-[var(--border)] flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[var(--surface)] border border-[var(--border)] flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-[var(--text-muted)]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--text)] truncate">
                  {currentUser.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] font-mono">
                  {currentUser.loginId} · {branchDisplay}
                </div>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${roleBadgeStyle}`}
            >
              {currentUser.role}
            </span>
          </div>

          {/* Navigation Links List */}
          <nav className="p-3 space-y-1 max-h-[calc(100vh-180px)] overflow-y-auto" aria-label="Mobile Navigation">
            {navItems.map((item) => {
              const active = isItemActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href as any}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--primary-50)] text-[var(--primary-600)] font-semibold border border-[var(--primary-600)]/20 shadow-xs'
                      : 'text-[var(--text)] hover:bg-[var(--surface-2)] text-[var(--text-secondary)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        active ? 'text-[var(--primary-600)]' : 'text-[var(--text-muted)]'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary-600)] shrink-0" />
                  )}
                </Link>
              )
            })}

            {/* Logout Row in Drawer for quick access */}
            <div className="pt-2 mt-2 border-t border-[var(--border)]">
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-bg)]/20 transition-colors cursor-pointer text-left"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}


