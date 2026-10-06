import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { categorizationSuggest } from '@/shared/api/generated/categorization-v2/categorization-v2';
import type { Suggestion } from '@/shared/api/generated/model';

/**
 * Espera antes de consultar, en milisegundos.
 *
 * Sin ella, escribir "Exito Poblado" dispararía trece peticiones. Con 400 ms se
 * consulta cuando la persona deja de escribir, que es cuando la descripción ya
 * significa algo.
 */
const WAIT_MS = 400;

/** Por debajo de esto, la descripción no da para sugerir nada. */
const MIN_CHARACTERS = 3;

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
export function useCategorySuggestion(description: string): Suggestion | null {
  const [stabilized, setStabilized] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setStabilized(description.trim()), WAIT_MS);
    return () => clearTimeout(timer);
  }, [description]);

  const query = useQuery({
    queryKey: ['categorization', 'suggest', stabilized],
    enabled: stabilized.length >= MIN_CHARACTERS,
    // El historial no cambia entre pulsaciones: recordar la respuesta evita
    // repetir la misma consulta al borrar y volver a escribir.
    staleTime: 60_000,
    queryFn: async () => {
      const response = await categorizationSuggest({ description: stabilized });
      return response.data;
    },
  });

  return query.data ?? null;
}
