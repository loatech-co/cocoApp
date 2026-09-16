import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

/**
 * Un campo de formulario: su nombre encima y el control debajo.
 *
 * ── Por qué es un componente y no tres líneas repetidas ─────────────────────
 * Porque eran seis copias del mismo `<div>` con el mismo hueco, y seis copias
 * de una medida son seis sitios donde ese hueco puede separarse. El día que un
 * formulario necesite el nombre a la izquierda —o un texto de ayuda debajo, o
 * un asterisco— se cambia aquí y no se busca dónde estaban las seis.
 *
 * ── Por qué el nombre va FUERA del control ──────────────────────────────────
 * Y no dentro como marcador de posición: un marcador desaparece al escribir,
 * así que al revisar un formulario ya lleno nadie sabe qué era cada caja. Es
 * además lo que ata la etiqueta al campo para quien navega con lector.
 */
export function Campo({
  etiqueta,
  id,
  ayuda,
  children,
}: {
  etiqueta: string;
  /** El mismo `id` que lleva el control: es lo que los ata. */
  id: string;
  /** Una línea debajo, para lo que el nombre no alcanza a decir. */
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
