import type { Problem, ProblemFieldError } from './generated/model';

/** Lo que la web necesita de un error de la API. */
export interface ErrorLeido {
  code: string;
  message: string;
  details: ProblemFieldError[];
}

/**
 * Lee un error de la v2: `application/problem+json` (RFC 9457).
 *
 * `code` es el estable, uno por regla de negocio; `detail` es la frase para la
 * persona; `errors`, los campos que fallaron. Si el cuerpo no es un problema
 * —una caída del proxy, una página HTML—, queda el mensaje por defecto.
 */
export function leerProblema(cuerpo: unknown, porDefecto: string): ErrorLeido {
  const problema = (typeof cuerpo === 'object' ? cuerpo : null) as Partial<Problem> | null;
  return {
    code: problema?.code ?? 'unknown_error',
    message: problema?.detail ?? porDefecto,
    details: problema?.errors ?? [],
  };
}
