import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api-client';
import type { SugerenciaDeCategoria } from '@coco/types';

/**
 * Espera antes de consultar, en milisegundos.
 *
 * Sin ella, escribir "Exito Poblado" dispararía trece peticiones. Con 400 ms se
 * consulta cuando la persona deja de escribir, que es cuando la descripción ya
 * significa algo.
 */
const ESPERA_MS = 400;

/** Por debajo de esto, la descripción no da para sugerir nada. */
const MINIMO_DE_CARACTERES = 3;

/**
 * Sugerencia de categoría para lo que se está escribiendo.
 *
 * La decisión la toma el servidor: solo él tiene el historial completo de la
 * persona, que es la señal más fuerte —mejor que cualquier lista de palabras
 * clave, porque refleja cómo organiza SUS finanzas—.
 *
 * Devuelve `null` cuando no hay nada seguro que decir, y la interfaz
 * sencillamente no muestra nada. Sugerir mal es peor que no sugerir.
 */
export function useSugerenciaDeCategoria(descripcion: string): SugerenciaDeCategoria | null {
  const [estabilizada, setEstabilizada] = useState('');

  useEffect(() => {
    const temporizador = setTimeout(() => setEstabilizada(descripcion.trim()), ESPERA_MS);
    return () => clearTimeout(temporizador);
  }, [descripcion]);

  const consulta = useQuery({
    queryKey: ['categorization', 'suggest', estabilizada],
    enabled: estabilizada.length >= MINIMO_DE_CARACTERES,
    // El historial no cambia entre pulsaciones: recordar la respuesta evita
    // repetir la misma consulta al borrar y volver a escribir.
    staleTime: 60_000,
    queryFn: async () => {
      const respuesta = await apiFetch<SugerenciaDeCategoria | null>(
        `/categorization/suggest?description=${encodeURIComponent(estabilizada)}`,
      );
      return respuesta.data;
    },
  });

  return consulta.data ?? null;
}
