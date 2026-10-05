import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { Preferences, UpdatePreferencesInput } from '@/shared/api/generated/model';
import {
  preferencesGet,
  preferencesUpdate,
} from '@/shared/api/generated/preferences-v2/preferences-v2';

/**
 * Preferencias del usuario.
 *
 * Hoy solo hay una, y es la que decide la forma de media aplicación: si esta
 * persona lleva cuentas. Apagada —lo normal— la navegación no muestra Cuentas,
 * la captura rápida no la pide, y los saldos simplemente no aparecen.
 */
export type Preferencias = Preferences;

/**
 * Lo que se asume mientras el servidor responde.
 *
 * Tiene que coincidir con `PREFERENCIAS_POR_DEFECTO` de la API. Y el valor
 * importa: si aquí se asumiera `true`, durante el primer parpadeo se vería un
 * menú de Cuentas que después desaparece.
 */
const POR_DEFECTO: Preferencias = { accountsEnabled: false };

const preferenciasKey = ['preferences'] as const;

export function usePreferencias(): UseQueryResult<Preferencias> {
  return useQuery({
    queryKey: preferenciasKey,
    queryFn: async () => (await preferencesGet()).data,
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
  return usePreferencias().data?.accountsEnabled ?? POR_DEFECTO.accountsEnabled;
}

export function useActualizarPreferencias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (cambios: UpdatePreferencesInput) => (await preferencesUpdate(cambios)).data,
    onSuccess: (preferencias) => {
      // Se escribe la respuesta directamente en la caché en vez de invalidar:
      // apagar el interruptor tiene que reordenar la navegación al instante,
      // sin un viaje de red de por medio.
      queryClient.setQueryData(preferenciasKey, preferencias);
    },
  });
}
