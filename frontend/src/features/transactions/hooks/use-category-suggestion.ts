import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { categorizationSuggest } from '@/shared/api/generated/categorization-v2/categorization-v2';
import type { Suggestion } from '@/shared/api/generated/model';

/**
 * Wait before querying, in milliseconds.
 *
 * Without it, typing "Exito Poblado" would fire thirteen requests. With 400 ms it
 * queries when the person stops typing, which is when the description already
 * means something.
 */
const WAIT_MS = 400;

/** Below this, the description is not enough to suggest anything. */
const MIN_CHARACTERS = 3;

/**
 * Category suggestion for what is being typed.
 *
 * The server makes the decision: only it has the person's full
 * history, which is the strongest signal —better than any keyword
 * list, because it reflects how THEY organize their finances—.
 *
 * Returns `null` when there is nothing certain to say, and the interface
 * simply shows nothing. Suggesting wrong is worse than not suggesting.
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
    // The history does not change between keystrokes: remembering the response avoids
    // repeating the same query when deleting and typing again.
    staleTime: 60_000,
    queryFn: async () => {
      const response = await categorizationSuggest({ description: stabilized });
      return response.data;
    },
  });

  return query.data ?? null;
}
