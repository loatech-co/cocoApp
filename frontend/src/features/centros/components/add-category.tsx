import { useState } from 'react';

import { CategoriaModal } from '@/features/centros/components/categoria-modal';
import { AddSurface } from '@/shared/ui/atoms/add-surface';

/**
 * El hueco de la siguiente categoría: una baldosa más de la rejilla.
 *
 * ── Por qué un cuadro punteado y no un enlace ───────────────────────────────
 * Porque ocupa una celda en la misma rejilla que las categorías y con su misma
 * forma: se lee como el sitio del próximo, no como una acción en otra parte de
 * la tarjeta. Y el borde punteado es lo que en todas partes significa «aquí
 * cabe algo que todavía no está» —es el mismo lenguaje que el hueco de un
 * soporte y el de un atajo—.
 *
 * ── Por qué el campo aparece al pedirlo ─────────────────────────────────────
 * Tener veinte campos abiertos a la vez satura: en una pantalla con seis
 * centros serían seis cajas de texto vacías compitiendo con la estructura que
 * se viene a leer.
 */
/**
 * El hueco de la siguiente categoría.
 *
 * ── Por qué un cuadro punteado y no un enlace ───────────────────────────────
 * Porque el borde punteado es lo que en todas partes significa «aquí cabe algo
 * que todavía no está» —el mismo lenguaje que el hueco de un soporte y el de
 * un atajo—, y eso se lee como el sitio de la próxima categoría, no como una acción
 * suelta en otra parte de la tarjeta.
 *
 * ── Por qué abre la ficha y ya no un campo suelto ───────────────────────────
 * Tenía su propio formulario en línea: un campo para el nombre y dos botones.
 * Así, crear una categoría y editarlo eran dos formularios distintos para la misma
 * cosa, y el de crear no pedía el icono —que es la mitad de lo que hace a un
 * categoría reconocible en la rejilla—. El resultado es que todo categoría nacía sin
 * icono y había que abrir la ficha justo después para ponérselo.
 *
 * Con la misma ficha en los dos casos, lo que se pide al crear es exactamente
 * lo que se puede cambiar al editar. Y de paso desaparece el único campo de la
 * pantalla que nacía enfocado.
 */
export function Agregar({
  padreId,
  solo = false,
}: {
  /** De qué centro cuelga la categoría que se va a crear. */
  padreId: number;
  /** Sin ningún categoría todavía: el hueco es lo único que hay en el centro. */
  solo?: boolean;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <div className={solo ? undefined : 'mt-3'}>
        <AddSurface forma={solo ? 'hueco' : 'barra'} onClick={() => setAbierta(true)}>
          Agregar categoría
        </AddSurface>
      </div>

      <CategoriaModal
        nivel="categoria"
        padreId={padreId}
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
      />
    </>
  );
}
