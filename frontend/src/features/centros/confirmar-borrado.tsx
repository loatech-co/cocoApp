import { useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Campo } from '@/components/ui/campo';
import { Confirmacion } from '@/components/ui/confirmacion';
import { Select } from '@/components/ui/select';
import { useEliminarCategoria, useUsosDeCategoria } from '@/lib/queries';
import { ApiClientError } from '@/lib/api-client';
import { useAlCambiar } from '@/lib/al-cambiar';
import type { Category, NivelDeCategoria } from '@coco/types';

/**
 * Confirmar el borrado de un centro de costos, una categoría o un concepto.
 *
 * ── Por qué es un componente y no tres diálogos ─────────────────────────────
 * Porque los tres niveles borran lo mismo —una categoría con lo que cuelgue de
 * ella— y la pregunta que hay que hacer es la misma. Estaban escritos tres
 * veces con el mismo texto copiado, y ese texto era además una descripción de
 * una regla del sistema en vez de una ayuda: «Si tiene movimientos, el sistema
 * se niega: no se elimina nada que deje filas sin clasificar».
 *
 * ── Y por qué el sistema ya no se niega ─────────────────────────────────────
 * Negarse dejaba la estructura sin forma de corregirse: un concepto mal creado
 * con un movimiento dentro no se podía quitar nunca. Lo que faltaba no era una
 * prohibición, era una PREGUNTA: a dónde pasan sus movimientos. Eso es un
 * dato, y se pide aquí.
 *
 * No se elige solo. El sistema no sabe si el alquiler mal clasificado
 * pertenece a «Vivienda» o a «Oficina», y adivinar significa mover plata a un
 * sitio que nadie pidió.
 *
 * ── Qué NO se borra ─────────────────────────────────────────────────────────
 * Los movimientos. Cambian de categoría y siguen ahí, con su fecha y su monto.
 * Hay que decirlo, porque «eliminar» junto a un número de movimientos se lee
 * como que se van los movimientos.
 */
export function ConfirmarBorrado({
  categoria,
  nivel,
  arbol,
  abierta,
  onCerrar,
  onEliminada,
}: {
  categoria: Category;
  /**
   * En cuál de los tres niveles está lo que se va a borrar.
   *
   * Se pasa y no se deduce porque una `Category` no dice a qué profundidad
   * vive: para saberlo habría que recorrer el árbol entero buscándola, y quien
   * abre este diálogo ya lo sabe —lo abrió desde la fila de un centro, de una
   * categoría o de un concepto—.
   *
   * De aquí sale TODO el texto: cómo se llama lo que se borra y cómo se llama
   * lo que cuelga de ello. Con una sola frase para los tres, borrar un centro
   * de costos decía «estás a punto de borrar la categoría “Vivienda”», que es
   * nombrar mal justo en la pantalla donde más caro sale equivocarse.
   */
  nivel: NivelDeCategoria;
  /** El árbol entero: de ahí salen los destinos posibles. */
  arbol: Category[];
  abierta: boolean;
  onCerrar: () => void;
  /** Se llama después de borrar. Por ejemplo, para cerrar la ficha de encima. */
  onEliminada?: () => void;
}) {
  const eliminar = useEliminarCategoria();
  // Solo se pregunta cuando el diálogo está abierto: es una consulta por
  // categoría, y el árbol tiene cuarenta.
  const usos = useUsosDeCategoria(abierta ? Number(categoria.id) : undefined);

  const [destino, setDestino] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cada apertura empieza limpia: un destino elegido y cancelado la vez
  // anterior no tiene por qué reaparecer apuntando a otra categoría.
  useAlCambiar([abierta], () => {
    if (abierta) {
      setDestino('');
      setError(null);
    }
  });

  const movimientos = usos.data?.movimientos ?? 0;
  const hayQueReasignar = movimientos > 0;

  return (
    <Confirmacion
      abierta={abierta}
      titulo={`Eliminar “${categoria.name}”`}
      peligrosa
      etiquetaConfirmar="Eliminar"
      ocupada={eliminar.isPending || usos.isPending}
      // Con movimientos dentro no se puede confirmar hasta decir a dónde van.
      // Apagado y no «falla al pulsar»: enterarse después de pulsar «Eliminar»
      // en un diálogo que avisa de que no se puede deshacer es lo peor.
      confirmarDeshabilitado={hayQueReasignar && destino === ''}
      onCancelar={onCerrar}
      onConfirmar={() => {
        setError(null);
        eliminar.mutate(
          {
            id: Number(categoria.id),
            reasignarA: destino === '' ? undefined : Number(destino),
          },
          {
            onSuccess: () => {
              onCerrar();
              onEliminada?.();
            },
            onError: (e) =>
              setError(e instanceof ApiClientError ? e.message : 'No se pudo eliminar.'),
          },
        );
      }}
    >
      <div className="flex flex-col gap-3">
        {/* Qué se va, y la pregunta. Los tres golpes del patrón: qué pasa, que
            no hay vuelta atrás, y si de verdad. */}
        <p>{loQueSeBorra(nivel, categoria.name, usos.data?.subcategorias ?? 0)}</p>

        {usos.isPending && <p>Contando qué hay dentro…</p>}

        {hayQueReasignar && (
          <>
            <Alert variant="warning">
              <AlertDescription>
                {/* «A donde elijas» y no «a la categoría que elijas»: el
                    destino puede ser un centro de costos, una categoría o un
                    concepto —los tres niveles están en la lista—, así que
                    nombrar solo uno prometería menos de lo que se ofrece. */}
                {movimientos === 1
                  ? 'Hay 1 movimiento aquí dentro. No se borra: pasa a donde elijas.'
                  : `Hay ${movimientos} movimientos aquí dentro. No se borran: pasan a donde elijas.`}
              </AlertDescription>
            </Alert>

            <Campo etiqueta="Destino de los movimientos" id="destino-del-borrado">
              <Select
                id="destino-del-borrado"
                etiqueta="Destino de los movimientos"
                vacio="Elige un destino"
                valor={destino}
                opciones={destinosPosibles(arbol, Number(categoria.id))}
                onCambiar={setDestino}
              />
            </Campo>
          </>
        )}

        {/*
          La pregunta va DESPUÉS del selector, no antes.

          Es el último golpe del patrón —qué pasa, que no hay vuelta atrás, y
          si de verdad—, y cuando hay movimientos dentro, entre la advertencia
          y el botón se mete un campo que hay que rellenar. Con la pregunta
          arriba quedaba contestada antes de poder contestarla; aquí abajo cae
          justo encima de los botones, que es donde se responde.
        */}
        <p>¿Estás seguro de querer continuar?</p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Confirmacion>
  );
}

/**
 * La primera frase: qué estructura se va con esto.
 *
 * ── Cada nivel se llama por su nombre ───────────────────────────────────────
 * Y lo que cuelga de él, también. Decía «la categoría “Vivienda” y la que
 * tiene dentro» para los tres, y era dos cosas mal a la vez: «Vivienda» es un
 * centro de costos, no una categoría, y «la que tiene dentro» obliga a
 * adivinar qué es «la que» —¿otra categoría?, ¿un concepto?, ¿un movimiento?—
 * justo en la frase que avisa de que esto no se deshace.
 *
 * Un concepto no tiene nada dentro: es la última hoja del árbol, así que su
 * frase no habla de hijos aunque le llegue un número.
 */
function loQueSeBorra(nivel: NivelDeCategoria, nombre: string, cuantas: number): string {
  /*
    Las frases enteras, no piezas que se peguen.

    El español concuerda en género y en número, y un centro de costos tiene
    CATEGORÍAS mientras que una categoría tiene CONCEPTOS: pegando un artículo
    a una palabra salían «la 3 conceptos» y «el categoría». Escritas enteras no
    hay forma de que una concuerde mal.
  */
  const { esto, uno, varios } = {
    'centro de costos': {
      esto: 'el centro de costos',
      uno: 'la categoría asociada a este centro de costos',
      varios: (n: number) => `las ${n} categorías asociadas a este centro de costos`,
    },
    categoría: {
      esto: 'la categoría',
      uno: 'el concepto asociado a esta categoría',
      varios: (n: number) => `los ${n} conceptos asociados a esta categoría`,
    },
    // Un concepto es la última hoja del árbol: no tiene nada dentro, así que
    // su frase no habla de hijos aunque le llegue un número.
    concepto: { esto: 'el concepto', uno: null, varios: null },
  }[nivel];

  const dentro =
    cuantas === 0 || uno === null || varios === null
      ? ''
      : cuantas === 1
        ? ` y ${uno}`
        : ` y ${varios(cuantas)}`;

  return `Estás a punto de borrar ${esto} “${nombre}”${dentro}. Esta acción no se puede deshacer.`;
}

/**
 * A dónde se puede reasignar: todo el árbol MENOS lo que se va a borrar.
 *
 * ── Por qué el camino entero en la etiqueta ─────────────────────────────────
 * Porque «Aseo» a secas no distingue el de Casa del de Oficina, y la lista es
 * plana: un desplegable con «Aseo» dos veces obliga a adivinar cuál es cuál
 * justo cuando se está moviendo plata de sitio.
 *
 * ── Por qué se ofrecen los tres niveles ─────────────────────────────────────
 * Lo normal es pasar los movimientos a otro concepto, y por eso los conceptos
 * son la mayoría de la lista. Pero al borrar una categoría entero puede no haber un
 * concepto equivalente todavía, y dejarlos colgando dla categoría de destino es
 * mejor que no poder borrar: siguen clasificados, y el concepto se les asigna
 * después desde la tabla.
 */
export function destinosPosibles(
  arbol: Category[],
  excluidoId: number,
): { valor: string; etiqueta: string }[] {
  const salida: { valor: string; etiqueta: string }[] = [];

  for (const centro of arbol) {
    if (Number(centro.id) === excluidoId) continue;
    salida.push({ valor: String(centro.id), etiqueta: centro.name });

    for (const categoria of centro.children ?? []) {
      if (Number(categoria.id) === excluidoId) continue;
      salida.push({ valor: String(categoria.id), etiqueta: `${centro.name} › ${categoria.name}` });

      for (const concepto of categoria.children ?? []) {
        if (Number(concepto.id) === excluidoId) continue;
        salida.push({
          valor: String(concepto.id),
          etiqueta: `${centro.name} › ${categoria.name} › ${concepto.name}`,
        });
      }
    }
  }

  return salida;
}
