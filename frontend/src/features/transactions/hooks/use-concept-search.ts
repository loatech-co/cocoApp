import { useMemo, useState } from 'react';

import { comoNodosBuscables, type NodoDelArbol } from '@/shared/lib/arbol-buscable';
import { buscarEnArbol, indexarArbol, type EntradaDelIndice } from '@coco/lectura';

/** Qué se está haciendo dentro del panel: buscar, o elegir dónde va lo nuevo. */
export type ModoDelBuscador = 'buscar' | 'categoria-para-nuevo';

function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lo que sale del árbol para lo escrito: lo elegido, los resultados y las listas. */
function useConceptLists({
  arbol,
  valor,
  recientes,
  busca,
}: {
  arbol: readonly NodoDelArbol[];
  valor: number | undefined;
  recientes: readonly number[];
  busca: string;
}) {
  const indice = useMemo(() => indexarArbol(comoNodosBuscables(arbol)), [arbol]);
  const elegida = useMemo(
    () => (valor === undefined ? undefined : indice.find((e) => String(e.id) === String(valor))),
    [indice, valor],
  );
  const resultados = useMemo(() => buscarEnArbol(indice, busca, { limite: 12 }), [indice, busca]);
  const entradasRecientes = useMemo(
    () => recientesDelIndice(indice, recientes),
    [indice, recientes],
  );
  const categorias = useMemo(() => indice.filter((e) => e.nivel === 'categoria'), [indice]);
  const categoriasFiltradas = useMemo(
    () =>
      busca.trim() === ''
        ? categorias
        : buscarEnArbol(indice, busca, { niveles: ['categoria'], limite: 30 }),
    [indice, categorias, busca],
  );

  // Crear solo cuando lo escrito no existe ya: con un nombre que coincide,
  // «crear» produciría dos conceptos idénticos sumando por separado.
  const puedeCrear =
    busca.trim() !== '' &&
    !resultados.some((r) => r.nivel === 'concepto' && r.nombreNormalizado === normal(busca));

  return { elegida, resultados, entradasRecientes, categoriasFiltradas, puedeCrear };
}

/**
 * Lo que el buscador de conceptos de la ficha recuerda y calcula: lo escrito,
 * el modo, el índice del árbol y las listas que salen de él.
 */
export function useConceptSearch({
  arbol,
  valor,
  recientes,
}: {
  arbol: readonly NodoDelArbol[];
  valor: number | undefined;
  recientes: readonly number[];
}) {
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<ModoDelBuscador>('buscar');
  /**
   * El nombre del concepto que se va a crear, mientras se elige su categoría.
   * Aparte de `busca`, porque en ese paso la caja pasa a filtrar categorías y
   * si siguiera diciendo «Gimnasio» no encontraría ninguna.
   */
  const [nombreNuevo, setNombreNuevo] = useState('');
  const listas = useConceptLists({ arbol, valor, recientes, busca });

  const limpiar = (): void => {
    setBusca('');
    setNombreNuevo('');
    setModo('buscar');
  };

  const pedirCategoria = (): void => {
    setNombreNuevo(busca.trim());
    setBusca('');
    setModo('categoria-para-nuevo');
  };

  const volver = (): void => {
    setBusca(nombreNuevo);
    setNombreNuevo('');
    setModo('buscar');
  };

  return { ...listas, busca, setBusca, modo, nombreNuevo, limpiar, pedirCategoria, volver };
}

function recientesDelIndice(
  indice: readonly EntradaDelIndice[],
  recientes: readonly number[],
): EntradaDelIndice[] {
  // Sin repetidos aunque lleguen: quien los calcula ya los quita, pero una
  // lista con el mismo concepto dos veces se vería como un error del
  // buscador y no de quien lo llamó.
  return [...new Set(recientes.map(String))]
    .map((r) => indice.find((e) => e.nivel === 'concepto' && String(e.id) === r))
    .filter((e): e is EntradaDelIndice => e !== undefined)
    .slice(0, 5);
}
