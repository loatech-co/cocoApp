import { KeyRound } from 'lucide-react';

/**
 * Pantalla que se muestra cuando falta la configuración de Firebase.
 *
 * Un proyecto a medio configurar debería explicar qué le falta, no dejar una
 * pantalla en blanco y un error en la consola.
 */
export function SetupNotice() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8">
        <div className="mb-4 flex items-center gap-3">
          <KeyRound className="size-5 text-warning" aria-hidden="true" />
          <h1 className="font-serif text-2xl font-semibold">Falta configurar Firebase</h1>
        </div>

        <p className="mb-6 text-sm text-muted-foreground">
          El login necesita las credenciales del proyecto de Firebase. Son públicas por
          diseño: lo que protege los datos es la verificación del token en el backend.
        </p>

        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              1
            </span>
            <span>
              Crea un proyecto en <strong>console.firebase.google.com</strong> y habilita
              Authentication con Google y correo/contraseña.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              2
            </span>
            <span>
              Registra una app web y copia su configuración a{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">frontend/.env</code> (la
              plantilla está en <code className="rounded bg-muted px-1.5 py-0.5 text-xs">.env.example</code>).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium">
              3
            </span>
            <span>
              Genera una clave de cuenta de servicio y pon sus tres valores en{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">api/.env</code>. Ese archivo
              sí es secreto y nunca se sube al repositorio.
            </span>
          </li>
        </ol>
      </div>
    </main>
  );
}
