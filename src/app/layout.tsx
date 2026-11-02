import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { QueryProvider } from '@/components/query-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  title: 'CPA Cricket Academy CRM',
  description: 'Cricket Academy Management System',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
