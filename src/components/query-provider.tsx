'use client'

import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // Cache data in memory for 60 seconds (instant page switching)
            gcTime: 5 * 60 * 1000, // Keep in memory cache for 5 minutes
            refetchOnWindowFocus: false, // Prevent background jitter when focusing windows
            retry: 1,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

