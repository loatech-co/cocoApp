import { type ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { DentroDeUnCampo } from '@/shared/ui/foundations/field';

/**
 * Un campo de formulario: su nombre DENTRO del control, y el control.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────────
 * La etiqueta empieza donde estaría el marcador. Al enfocar el campo se
 * encoge y se sube a la parte de arriba del propio campo, dejando su sitio al
 * marcador —que es el ejemplo, no el nombre—. Al escribir, el marcador
 * desaparece y queda lo escrito. Al soltar el campo, la etiqueta se queda
 * arriba si hay algo y baja si no.
 *
 * La máquina de estados está en `index.css`, bajo `.campo`, y no aquí: son
 * cuatro disparadores distintos que significan lo mismo y ninguno lo sabe este
 * componente. El porqué está escrito allí.
 *
 * ── Por qué el nombre va dentro y no encima ─────────────────────────────────
 * Antes iba encima, con este argumento: un marcador desaparece al escribir, así
 * que al revisar un formulario ya lleno nadie sabe qué era cada caja. El
 * argumento sigue en pie y por eso la etiqueta NO es un marcador: cuando hay
 * algo escrito no se va, se queda pequeña sobre el borde. Lo que se gana es el
 * renglón que ocupaba encima de cada campo —seis campos son seis renglones— y
 * que el nombre y el valor se lean como una sola cosa en vez de dos.
 *
 * ── Por qué el `id` es obligatorio ──────────────────────────────────────────
 * Es lo único que ata la etiqueta al control para quien navega con lector de
 * pantalla. Una etiqueta flotante que no está asociada es decoración: se ve el
 * nombre y no se oye.
 */
export function Field({
  label,
  id,
  description,
  className,
  children,
}: {
  label: string;
  /** El mismo `id` que lleva el control: es lo que los ata. */
  id: string;
  /** Una línea debajo, para lo que el nombre no alcanza a decir. */
  description?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/*
        El control va PRIMERO y la etiqueta después, aunque se vea al
        contrario: la etiqueta está colocada en absoluto encima de él, y
        ponerla antes en el marcado obligaría a que el control fuera el
        hermano siguiente, que es justo lo que los selectores de `.campo` no
        necesitan saber.
      */}
      <div className="campo">
        <DentroDeUnCampo.Provider value={true}>{children}</DentroDeUnCampo.Provider>
        <label htmlFor={id}>{label}</label>
      </div>

      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
