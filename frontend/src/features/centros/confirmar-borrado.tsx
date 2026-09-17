import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Campo } from '@/components/ui/campo';
import { Confirmacion } from '@/components/ui/confirmacion';
import { Select } from '@/components/ui/select';
import { useEliminarCategoria, useUsosDeCategoria } from '@/lib/queries';
import { ApiClientError } from '@/lib/api-client';
import type { Category } from '@coco/types';

/**
 * Confirmar el borrado de un centro de costos, un grupo o un concepto.
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
  arbol,
  abierta,
  onCerrar,
  onEliminada,
}: {
  categoria: Category;
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
  useEffect(() => {
    if (abierta) {
      setDestino('');
      setError(null);
    }
  }, [abierta]);

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
        {/*
          Los dos primeros golpes del patrón, y no el tercero.

          «¿Estás seguro de que quieres continuar?» sobra aquí: cuando hay
          movimientos dentro, entre la pregunta y el botón aparece un selector
          que hay que rellenar, y una pregunta que todavía no se puede
          contestar es ruido. Lo que pregunta en esta ficha es el selector.
        */}
        <p>{loQueSeBorra(categoria.name, usos.data?.subcategorias ?? 0)}</p>

        {usos.isPending && <p>Contando qué hay dentro…</p>}

        {hayQueReasignar && (
          <>
            <Alert variant="warning">
              <AlertDescription>
                {movimientos === 1
                  ? 'Hay 1 movimiento aquí dentro. No se borra: pasa a la categoría que elijas.'
                  : `Hay ${movimientos} movimientos aquí dentro. No se borran: pasan a la categoría que elijas.`}
              </AlertDescription>
            </Alert>

            <Campo etiqueta="Categoría de destino" id="destino-del-borrado">
              <Select
                id="destino-del-borrado"
                etiqueta="Categoría de destino"
                vacio="Elige una categoría"
                valor={destino}
                opciones={destinosPosibles(arbol, Number(categoria.id))}
                onCambiar={setDestino}
              />
            </Campo>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Confirmacion>
  );
}

/** La primera frase: qué estructura se va con esto. */
function loQueSeBorra(nombre: string, cuantas: number): string {
  const cierre = ' Esta acción no se puede deshacer.';
  const que =
    cuantas === 0
      ? ''
      : cuantas === 1
        ? ' y la que tiene dentro'
        : ` y las ${cuantas} que tiene dentro`;

  return `Estás a punto de borrar la categoría “${nombre}”${que}.${cierre}`;
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
 * son la mayoría de la lista. Pero al borrar un grupo entero puede no haber un
 * concepto equivalente todavía, y dejarlos colgando del grupo de destino es
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

    for (const grupo of centro.children ?? []) {
      if (Number(grupo.id) === excluidoId) continue;
      salida.push({ valor: String(grupo.id), etiqueta: `${centro.name} › ${grupo.name}` });

      for (const concepto of grupo.children ?? []) {
        if (Number(concepto.id) === excluidoId) continue;
        salida.push({
          valor: String(concepto.id),
          etiqueta: `${centro.name} › ${grupo.name} › ${concepto.name}`,
        });
      }
    }
  }

  return salida;
}
