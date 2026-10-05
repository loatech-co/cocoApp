import { ChevronDown, CornerDownLeft, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Menu } from '@/components/menu';
import { Campo, disparadorDeCampo, useDentroDeUnCampo } from '@/components/ui/campo';
import { Opcion } from '@/components/ui/combo';
import { REALCE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';
import {
  buscarEnArbol,
  indexarArbol,
  rutaLegible,
  type EntradaDelIndice,
  type NodoBuscable,
} from '@coco/lectura';

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
export interface CandidatoDelRecibo {
  id: number;
  nombre: string;
  ruta: string;
}

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
}: {
  id: string;
  arbol: readonly NodoBuscable[];
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
  ayuda?: string;
}) {
  const indice = useMemo(() => indexarArbol(arbol), [arbol]);
  const elegida = useMemo(
    () => (valor === undefined ? undefined : indice.find((e) => String(e.id) === String(valor))),
    [indice, valor],
  );

  const [busca, setBusca] = useState('');
  /** Qué se está haciendo dentro del panel: buscar, o elegir dónde va lo nuevo. */
  const [modo, setModo] = useState<'buscar' | 'categoria-para-nuevo'>('buscar');
  /**
   * El nombre del concepto que se va a crear, mientras se elige su categoría.
   * Aparte de `busca`, porque en ese paso la caja pasa a filtrar categorías y
   * si siguiera diciendo «Gimnasio» no encontraría ninguna.
   */
  const [nombreNuevo, setNombreNuevo] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const enCampo = useDentroDeUnCampo();

  const resultados = useMemo(() => buscarEnArbol(indice, busca, { limite: 12 }), [indice, busca]);

  const entradasRecientes = useMemo(
    () =>
      // Sin repetidos aunque lleguen: quien los calcula ya los quita, pero una
      // lista con el mismo concepto dos veces se vería como un error del
      // buscador y no de quien lo llamó.
      [...new Set(recientes.map(String))]
        .map((r) => indice.find((e) => e.nivel === 'concepto' && String(e.id) === r))
        .filter((e): e is EntradaDelIndice => e !== undefined)
        .slice(0, 5),
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

  const limpiar = (): void => {
    setBusca('');
    setNombreNuevo('');
    setModo('buscar');
  };

  /*
    Lo que se ve en el campo, abierto o cerrado, se pueda tocar o no.

    Uno y no dos, como en `Combo`: bloqueado quiere decir «esto no se cambia
    desde aquí», nunca «esto está vacío». Un movimiento de un centro estático
    tiene que leerse clasificado aunque no se pueda reclasificar.
  */
  const dentro = (abierto: boolean) => (
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
        <span className="truncate">{elegida?.nombre ?? 'Buscar concepto o categoría'}</span>
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

  return (
    <Campo etiqueta="Concepto" id={id} ayuda={ayuda}>
      {deshabilitado ? (
        <span
          id={id}
          aria-disabled="true"
          className={cn(disparadorDeCampo(), 'cursor-not-allowed opacity-50')}
        >
          {dentro(false)}
        </span>
      ) : (
        <Menu
          etiqueta="Concepto"
          tipo="lista"
          alineado="izquierda"
          flotante
          sinRelleno
          claseCaja="w-full min-w-0"
          claseDisparador={disparadorDeCampo()}
          idDisparador={id}
          disparador={({ abierto }) => dentro(abierto)}
        >
          {(cerrar) => (
            <Panel
              campo={campo}
              busca={busca}
              setBusca={setBusca}
              modo={modo}
              resultados={resultados}
              recientes={entradasRecientes}
              candidatos={candidatos}
              categorias={categoriasFiltradas}
              elegida={elegida}
              puedeCrear={puedeCrear}
              creando={creando}
              onElegir={(e) => {
                onElegir(e === undefined ? undefined : Number(e.id));
                limpiar();
                cerrar();
              }}
              onElegirCandidato={(c) => {
                onElegir(c.id);
                limpiar();
                cerrar();
              }}
              nombreNuevo={nombreNuevo}
              onPedirCategoria={() => {
                setNombreNuevo(busca.trim());
                setBusca('');
                setModo('categoria-para-nuevo');
              }}
              onVolver={() => {
                setBusca(nombreNuevo);
                setNombreNuevo('');
                setModo('buscar');
              }}
              onCrearEn={(categoria) => {
                onCrearConcepto(nombreNuevo, Number(categoria.id));
                limpiar();
                cerrar();
              }}
            />
          )}
        </Menu>
      )}
    </Campo>
  );
}

function Panel({
  campo,
  busca,
  setBusca,
  modo,
  resultados,
  recientes,
  candidatos,
  categorias,
  elegida,
  puedeCrear,
  creando,
  nombreNuevo,
  onElegir,
  onElegirCandidato,
  onPedirCategoria,
  onVolver,
  onCrearEn,
}: {
  campo: React.RefObject<HTMLInputElement | null>;
  busca: string;
  setBusca: (v: string) => void;
  modo: 'buscar' | 'categoria-para-nuevo';
  resultados: EntradaDelIndice[];
  recientes: EntradaDelIndice[];
  candidatos: readonly CandidatoDelRecibo[];
  categorias: EntradaDelIndice[];
  elegida: EntradaDelIndice | undefined;
  puedeCrear: boolean;
  creando: boolean;
  nombreNuevo: string;
  onElegir: (e: EntradaDelIndice | undefined) => void;
  onElegirCandidato: (c: CandidatoDelRecibo) => void;
  onPedirCategoria: () => void;
  onVolver: () => void;
  onCrearEn: (categoria: EntradaDelIndice) => void;
}) {
  // El foco al abrir: es un buscador que aparece porque se pidió buscar, la
  // excepción que la regla del foco contempla. Si hubiera que pulsar el campo
  // antes de escribir, el gesto serían dos clics.
  useEffect(() => {
    const t = setTimeout(() => campo.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [campo, modo]);

  const buscando = busca.trim() !== '';
  const eligiendoCategoria = modo === 'categoria-para-nuevo';

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          ref={campo}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (eligiendoCategoria) {
              if (categorias.length === 1) onCrearEn(categorias[0]);
              return;
            }
            // Enter elige lo único que queda, que es lo que uno espera después
            // de escribir tres letras y ver una sola fila. Sin filas, pasa a crear.
            if (resultados.length === 1) onElegir(resultados[0]);
            else if (resultados.length === 0 && puedeCrear) onPedirCategoria();
          }}
          placeholder={
            eligiendoCategoria ? 'Filtrar categorías…' : 'Buscar por nombre o palabra clave…'
          }
          aria-label={eligiendoCategoria ? 'Filtrar categorías' : 'Buscar concepto o categoría'}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {eligiendoCategoria ? (
        <>
          <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate">¿En qué categoría va «{nombreNuevo}»?</span>
            <button
              type="button"
              onClick={onVolver}
              className={cn('shrink-0 rounded-md px-1.5 py-0.5', REALCE)}
            >
              Volver
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Categorías">
            {categorias.map((c) => (
              <li key={String(c.id)}>
                <Opcion elegida={false} onClick={() => onCrearEn(c)}>
                  <Fila entrada={c} />
                </Opcion>
              </li>
            ))}
            {categorias.length === 0 && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">
                Ninguna categoría coincide.
              </li>
            )}
          </ul>
        </>
      ) : (
        <>
          <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Resultados">
            {elegida && (
              <li>
                <Opcion elegida={false} onClick={() => onElegir(undefined)}>
                  <span className="text-muted-foreground">Quitar</span>
                </Opcion>
              </li>
            )}

            {!buscando && candidatos.length > 0 && (
              <>
                <Titulo>Del recibo</Titulo>
                {candidatos.map((c) => (
                  <li key={c.id}>
                    <Opcion
                      elegida={elegida !== undefined && String(elegida.id) === String(c.id)}
                      onClick={() => onElegirCandidato(c)}
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate">{c.nombre}</span>
                        <span className="truncate text-xs text-muted-foreground">{c.ruta}</span>
                      </span>
                    </Opcion>
                  </li>
                ))}
              </>
            )}

            {!buscando && candidatos.length === 0 && recientes.length > 0 && (
              <>
                <Titulo>Recientes</Titulo>
                {recientes.map((r) => (
                  <li key={String(r.id)}>
                    <Opcion elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
                      <Fila entrada={r} />
                    </Opcion>
                  </li>
                ))}
              </>
            )}

            {!buscando && candidatos.length === 0 && recientes.length === 0 && !elegida && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">Escribe para buscar.</li>
            )}

            {buscando &&
              resultados.map((r) => (
                <li key={String(r.id)}>
                  <Opcion elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
                    <Fila entrada={r} />
                  </Opcion>
                </li>
              ))}

            {buscando && resultados.length === 0 && !puedeCrear && (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">Nada coincide.</li>
            )}
          </ul>

          {buscando && puedeCrear && (
            <button
              type="button"
              onClick={onPedirCategoria}
              disabled={creando}
              className={cn(
                'flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm',
                'font-medium transition-colors',
                REALCE,
                'disabled:opacity-60',
              )}
            >
              <Plus className="size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">Crear concepto «{busca.trim()}»</span>
              {resultados.length === 0 && (
                <CornerDownLeft
                  className="ml-auto size-3.5 shrink-0 opacity-50"
                  aria-hidden="true"
                />
              )}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Nombre y camino. Una categoría se marca para que no se confunda con un concepto. */
function Fila({ entrada }: { entrada: EntradaDelIndice }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{entrada.nombre}</span>
      {entrada.ruta.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{rutaLegible(entrada)}</span>
      )}
      {entrada.nivel === 'categoria' && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">categoría</span>
      )}
    </span>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <li className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">{children}</li>;
}

function normal(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
