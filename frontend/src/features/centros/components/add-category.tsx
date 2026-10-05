import { Plus } from 'lucide-react';
import { useState } from 'react';

import { CategoriaModal } from '@/features/centros/components/categoria-modal';
import { cn } from '@/shared/lib/utils';
import { REALCE_DE_SUPERFICIE } from '@/shared/ui/foundations/superficie';

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
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg p-4',
          /*
          Sin ninguna categoría, el hueco no es una baldosa más: es lo ÚNICO que
          hay, y una baldosa de 17rem sola en la esquina de un centro vacío
          se lee como un botón que alguien dejó ahí. A ancho completo y alto
          —`min-h-64`, 256px— se lee como lo que es: el sitio donde va a
          empezar la estructura de este centro.

          256 y no 250 exactos porque es el escalón de la escala que los
          cumple; una medida a mano por seis píxeles es una medida que
          mañana nadie sabe de dónde salió.

          Con categorías encima es una BARRA: el icono y el texto en una fila y
          el alto que le dé su relleno. Apilado y con alto mínimo, a todo el
          ancho de la pantalla, sería un rectángulo punteado más grande que
          cualquiera de las tarjetas que lo acompañan, y lo que hay que mirar
          en esta pantalla son las tarjetas.
        */
          solo ? 'min-h-64 flex-col' : 'mt-3',
          'border-2 border-dashed border-border text-center transition-colors',
          'text-sm font-medium text-muted-foreground',
          /*
          Un realce a la MEDIDA de lo que ocupa.

          Llevaba `hover:bg-accent`, que es lo que usan las demás zonas donde
          se suelta algo. En un cuadrito de 104px eso es un apunte; aquí, con
          el centro vacío, es una superficie de mil por doscientos cincuenta,
          y llenarla entera de acento al pasar el ratón por encima es un
          fogonazo.

          Así que responde igual pero más bajo: el trazo se tiñe, la letra
          sube a plena tinta y el relleno se queda en un tercio del acento
          —lo justo para que se note que la superficie está viva—.
        */
          // El mismo realce que la zona de soltar un soporte y la de la
          // importación: son la misma clase de superficie —grande, punteada y
          // pulsable— y el porqué del volumen está en `superficie.ts`.
          REALCE_DE_SUPERFICIE,
        )}
      >
        {/*
        El mismo texto haya categorías o no.

        Cuando no había ninguno, la baldosa añadía debajo un «El nivel de en
        medio: …» que la otra no llevaba. Es el mismo botón y hace lo mismo
        en los dos casos: cambiarle el texto según cuántas tarjetas tenga al
        lado obliga a leerlo dos veces para comprobar que sigue siendo el
        mismo. Lo que cambia es su tamaño, que ya dice bastante.
      */}
        <Plus className="size-5 shrink-0" aria-hidden="true" />
        Agregar categoría
      </button>

      <CategoriaModal
        nivel="categoria"
        padreId={padreId}
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
      />
    </>
  );
}
