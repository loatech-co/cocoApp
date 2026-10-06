import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { AuthProvider } from '@/shared/api/auth-context';
import { FlagsProvider } from '@/shared/api/flags';
import { clearCacheOnUserChange, createQueryClient } from '@/shared/api/query-client';

/**
 * TanStack Query gestiona el ESTADO SERVIDOR. Como en Coco todo se deriva de
 * los movimientos, invalidar la query de `transactions` refresca dashboard,
 * presupuesto y saldos de una: no hay copias que sincronizar a mano.
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
