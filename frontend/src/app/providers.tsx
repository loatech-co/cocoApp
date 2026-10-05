import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AuthProvider } from '@/shared/api/auth-context';
import { FlagsProvider } from '@/shared/api/flags';

/**
 * TanStack Query gestiona el ESTADO SERVIDOR. Como en Coco todo se deriva de
 * los movimientos, invalidar la query de `transactions` refresca dashboard,
 * presupuesto y saldos de una: no hay copias que sincronizar a mano.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FlagsProvider>{children}</FlagsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
