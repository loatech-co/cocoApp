import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, type RefObject } from 'react';

import { useConceptSearch } from '@/features/transactions/hooks/use-concept-search';
import type { CandidatoDelRecibo } from '@/features/transactions/model/movement-form';
import type { NodoDelArbol } from '@/shared/lib/arbol-buscable';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Campo } from '@/shared/ui/atoms/campo';
import { SearchBox } from '@/shared/ui/atoms/search-box';
import { disparadorDeCampo, useDentroDeUnCampo } from '@/shared/ui/foundations/field';
import { Menu } from '@/shared/ui/molecules/menu';
import { rutaLegible, type EntradaDelIndice } from '@coco/lectura';

import {
  CategoriaParaNuevo,
  ResultadosDelBuscador,
  type PropsDeResultados,
} from './concept-search-lists';

interface PropsDelBuscador {
  id: string;
  arbol: readonly NodoDelArbol[];
  /** El id elegido: un concepto o una categoría. */
  valor: number | undefined;
  onElegir: (id: number | undefined) => void;
  /** Crear un concepto con ese nombre dentro de esa categoría, y elegirlo. */
  onCrearConcepto: (nombre: string, categoriaId: number) => void;
  creando?: boolean;
  /** En un centro estático: se enseña lo elegido, pero no se cambia desde aquí. */
  deshabilitado?: boolean;
  /** Ids de los conceptos usados últimamente, del más reciente al más viejo. */
  recientes?: readonly number[];
  /** Lo que la lectura de un recibo dejó entre lo que dudar. */
  candidatos?: readonly CandidatoDelRecibo[];
  /** Debajo del campo: «sugerido por tu historial», un error… */
  ayuda?: string | undefined;
}

/**
 * Un solo buscador para clasificar un movimiento.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Clasificar pedía tres desplegables en cascada —centro, categoría, concepto—
 * y siete interacciones para dejar un gasto bien puesto. Aquí se escribe «d1»
 * y aparece «Mercado · Alimentación › Costos variables»: un clic, y los tres
 * niveles quedan puestos, porque elegir un concepto ya dice de qué categoría y
 * de qué centro es.
 *
 * ── Qué se busca ────────────────────────────────────────────────────────────
 * Conceptos y categorías, por nombre y por palabra clave, sin tildes ni
 * mayúsculas. Cada resultado enseña su camino, que es lo que distingue dos
 * «Mercado». Elegir una categoría también vale: hay cuentas con categorías y
 * sin conceptos, y ahí la categoría es lo más fino que se puede decir.
 *
 * ── Con el buscador en blanco ───────────────────────────────────────────────
 * Lo que la persona usó últimamente, hasta cinco. Casi todos los gastos de
 * alguien van a los mismos cinco conceptos, y tenerlos delante es cero
 * teclas. Si la lectura de un recibo dejó candidatos entre los que dudar,
 * esos van primero: son la pregunta que la pantalla está haciendo.
 *
 * ── Cuando no hay nada ──────────────────────────────────────────────────────
 * Se ofrece crear el concepto con lo escrito. Como un concepto cuelga de una
 * categoría, se pregunta solo eso: en qué categoría va. Un centro de costos
 * nunca se crea desde aquí —es la estructura de arriba, y se define tres
 * veces en la vida de una cuenta—.
 *
 * ── Sobre `Menu`, como todo desplegable de esta aplicación ──────────────────
 * Es el que sabe abrir, cerrar al tocar fuera, cerrar con Escape y colocarse.
 * La fila elegible es la misma `Opcion` de `Combo`, para que elegir se vea
 * igual en los dos sitios.
 */
export function BuscadorDeConcepto({
  id,
  arbol,
  valor,
  onElegir,
  onCrearConcepto,
  creando = false,
  deshabilitado = false,
  recientes = [],
  candidatos = [],
  ayuda,
}: PropsDelBuscador) {
  const b = useConceptSearch({ arbol, valor, recientes });
  const campo = useRef<HTMLInputElement>(null);

  if (deshabilitado) {
    return (
      <Campo etiqueta={t('transactions.fields.concept')} id={id} ayuda={ayuda}>
        <ConceptoBloqueado id={id} elegida={b.elegida} />
      </Campo>
    );
  }

  return (
    <Campo etiqueta={t('transactions.fields.concept')} id={id} ayuda={ayuda}>
      <Menu
        etiqueta={t('transactions.fields.concept')}
        tipo="buscador"
        alineado="izquierda"
        flotante
        sinRelleno
        claseCaja="w-full min-w-0"
        claseDisparador={disparadorDeCampo()}
        idDisparador={id}
        disparador={({ abierto }) => <ValorDelBuscador elegida={b.elegida} abierto={abierto} />}
      >
        {(cerrar) => (
          <PanelDelMenu
            buscador={b}
            campo={campo}
            candidatos={candidatos}
            creando={creando}
            cerrar={cerrar}
            onElegir={onElegir}
            onCrearConcepto={onCrearConcepto}
          />
        )}
      </Menu>
    </Campo>
  );
}

interface PropsDelPanelDelMenu {
  buscador: ReturnType<typeof useConceptSearch>;
  campo: RefObject<HTMLInputElement | null>;
  candidatos: readonly CandidatoDelRecibo[];
  creando: boolean;
  cerrar: () => void;
  onElegir: (id: number | undefined) => void;
  onCrearConcepto: (nombre: string, categoriaId: number) => void;
}

/** El panel abierto, con lo que hay que hacer al elegir: limpiar y cerrar. */
function PanelDelMenu({
  buscador: b,
  campo,
  candidatos,
  creando,
  cerrar,
  onElegir,
  onCrearConcepto,
}: PropsDelPanelDelMenu) {
  const terminar = (): void => {
    b.limpiar();
    cerrar();
  };

  return (
    <Panel
      campo={campo}
      busca={b.busca}
      setBusca={b.setBusca}
      modo={b.modo}
      resultados={b.resultados}
      recientes={b.entradasRecientes}
      candidatos={candidatos}
      categorias={b.categoriasFiltradas}
      elegida={b.elegida}
      puedeCrear={b.puedeCrear}
      creando={creando}
      onElegir={(e) => {
        onElegir(e === undefined ? undefined : Number(e.id));
        terminar();
      }}
      onElegirCandidato={(c) => {
        onElegir(c.id);
        terminar();
      }}
      nombreNuevo={b.nombreNuevo}
      onPedirCategoria={b.pedirCategoria}
      onVolver={b.volver}
      onCrearEn={(categoria) => {
        onCrearConcepto(b.nombreNuevo, Number(categoria.id));
        terminar();
      }}
    />
  );
}

/** En un centro estático: lo elegido se enseña, pero no abre nada. */
function ConceptoBloqueado({ id, elegida }: { id: string; elegida: EntradaDelIndice | undefined }) {
  return (
    <span
      id={id}
      aria-disabled="true"
      className={cn(disparadorDeCampo(), 'cursor-not-allowed opacity-50')}
    >
      <ValorDelBuscador elegida={elegida} abierto={false} />
    </span>
  );
}

/*
  Lo que se ve en el campo, abierto o cerrado, se pueda tocar o no.

  Uno y no dos, como en `Combo`: bloqueado quiere decir «esto no se cambia
  desde aquí», nunca «esto está vacío». Un movimiento de un centro estático
  tiene que leerse clasificado aunque no se pueda reclasificar.
*/
function ValorDelBuscador({
  elegida,
  abierto,
}: {
  elegida: EntradaDelIndice | undefined;
  abierto: boolean;
}) {
  const enCampo = useDentroDeUnCampo();
  return (
    <>
      <span
        data-lleno={elegida ? 'si' : 'no'}
        data-vacio={elegida ? undefined : ''}
        className={cn(
          'flex min-w-0 flex-1 items-baseline gap-2 text-left',
          !elegida && 'text-muted-foreground',
          enCampo && 'pt-4',
        )}
      >
        <span className="truncate">
          {elegida?.nombre ?? t('transactions.conceptSearch.placeholder')}
        </span>
        {elegida && elegida.ruta.length > 0 && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {rutaLegible(elegida)}
          </span>
        )}
      </span>
      <ChevronDown
        className={cn('size-4 shrink-0 opacity-60 transition-transform', abierto && 'rotate-180')}
        aria-hidden="true"
      />
    </>
  );
}

interface PropsDelPanel extends PropsDeResultados {
  campo: RefObject<HTMLInputElement | null>;
  setBusca: (v: string) => void;
  modo: 'buscar' | 'categoria-para-nuevo';
  categorias: EntradaDelIndice[];
  nombreNuevo: string;
  onVolver: () => void;
  onCrearEn: (categoria: EntradaDelIndice) => void;
}

function Panel(props: PropsDelPanel) {
  const { campo, modo } = props;

  // El foco al abrir: es un buscador que aparece porque se pidió buscar, la
  // excepción que la regla del foco contempla. Si hubiera que pulsar el campo
  // antes de escribir, el gesto serían dos clics.
  useEffect(() => {
    const t = setTimeout(() => campo.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [campo, modo]);

  return (
    <div className="flex flex-col">
      <CajaDeBusqueda {...props} />

      {modo === 'categoria-para-nuevo' ? (
        <CategoriaParaNuevo
          nombreNuevo={props.nombreNuevo}
          categorias={props.categorias}
          onVolver={props.onVolver}
          onCrearEn={props.onCrearEn}
        />
      ) : (
        <ResultadosDelBuscador {...props} />
      )}
    </div>
  );
}

function CajaDeBusqueda(props: PropsDelPanel) {
  const { campo, busca, setBusca, categorias, resultados, puedeCrear } = props;
  const eligiendoCategoria = props.modo === 'categoria-para-nuevo';

  return (
    <SearchBox
      forma="cabecera"
      ref={campo}
      value={busca}
      onChange={(e) => setBusca(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (eligiendoCategoria) {
          const [unica] = categorias;
          if (categorias.length === 1 && unica !== undefined) props.onCrearEn(unica);
          return;
        }
        // Enter elige lo único que queda, que es lo que uno espera después
        // de escribir tres letras y ver una sola fila. Sin filas, pasa a crear.
        if (resultados.length === 1) props.onElegir(resultados[0]);
        else if (resultados.length === 0 && puedeCrear) props.onPedirCategoria();
      }}
      placeholder={
        eligiendoCategoria
          ? t('transactions.conceptSearch.filterCategoriesPlaceholder')
          : t('transactions.conceptSearch.searchPlaceholder')
      }
      aria-label={
        eligiendoCategoria
          ? t('transactions.conceptSearch.filterCategories')
          : t('transactions.conceptSearch.placeholder')
      }
    />
  );
}
