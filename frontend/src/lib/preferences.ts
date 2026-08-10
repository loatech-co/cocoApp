import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { apiFetch } from './api-client';

/**
 * Preferencias del usuario.
 *
 * Hoy solo hay una, y es la que decide la forma de media aplicación: si esta
 * persona lleva cuentas. Apagada —lo normal— la navegación no muestra Cuentas,
 * la captura rápida no la pide, y los saldos simplemente no aparecen.
 */
export interface Preferencias {
  /**
   * Llevar tarjetas, ahorros y efectivo. APAGADA por defecto: registrar un
   * gasto no puede exigir haberse inventado antes una cuenta.
   */
  cuentas_habilitadas: boolean;
}

/**
 * Lo que se asume mientras el servidor responde.
 *
 * Tiene que coincidir con `PREFERENCIAS_POR_DEFECTO` de la API. Y el valor
 * importa: si aquí se asumiera `true`, durante el primer parpadeo se vería un
 * menú de Cuentas que después desaparece.
 */
const POR_DEFECTO: Preferencias = { cuentas_habilitadas: false };

export const preferenciasKey = ['preferences'] as const;

export function usePreferencias(): UseQueryResult<Preferencias> {
  return useQuery({
    queryKey: preferenciasKey,
    queryFn: async () => (await apiFetch<Preferencias>('/preferences')).data,
    // Cambian poquísimo y las consulta media aplicación: no tiene sentido
    // volver a pedirlas en cada montaje.
    staleTime: 5 * 60_000,
  });
}

/**
 * Atajo para la pregunta que se hace en varios sitios.
 *
 * Devuelve el valor por defecto mientras carga, en vez de `undefined`: así
 * ningún componente tiene que manejar un tercer estado solo para esto.
 */
export function useLlevaCuentas(): boolean {
  return usePreferencias().data?.cuentas_habilitadas ?? POR_DEFECTO.cuentas_habilitadas;
}

export function useActualizarPreferencias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cambios: Partial<Preferencias>) =>
      (await apiFetch<Preferencias>('/preferences', { method: 'PATCH', body: cambios })).data,
    onSuccess: (preferencias) => {
      // Se escribe la respuesta directamente en la caché en vez de invalidar:
      // apagar el interruptor tiene que reordenar la navegación al instante,
      // sin un viaje de red de por medio.
      queryClient.setQueryData(preferenciasKey, preferencias);
    },
  });
}
