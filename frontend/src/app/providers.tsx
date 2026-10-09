import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { AuthProvider } from '@/shared/api/auth-context';
import { FlagsProvider } from '@/shared/api/flags';
import { clearCacheOnUserChange, createQueryClient } from '@/shared/api/query-client';

/**
 * TanStack Query handles SERVER STATE. Since in Coco everything derives from
 * the transactions, invalidating the `transactions` query refreshes the
 * dashboard, budget and balances at once: there are no copies to sync by hand.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  // The cache belongs to ONE person: it empties when they leave.
  useEffect(() => clearCacheOnUserChange(queryClient), [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FlagsProvider>{children}</FlagsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
