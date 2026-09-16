import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  EllipsisVertical,
  Lock,
  LockOpen,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Menu, MenuOpcion } from '@/components/menu';
import { CategoriaModal } from '@/features/centros/categoria-modal';
import { ConfirmarBorrado } from '@/features/centros/confirmar-borrado';
import { ConceptoModal } from '@/features/centros/concepto-modal';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import {
  useActualizarCategoria,
  useCategories,
  useCrearCategoria,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';
import { CabeceraDePagina } from '@/components/cabecera-de-pagina';
import { Bloque } from '@/components/ui/bloque';

/**
 * Centros de costos.
 *
 * Es la pantalla donde se define la FORMA de los reportes, así que explica el
 * modelo en vez de dar por sentado que se entiende. Alguien que abre esto por
 * primera vez tiene que salir sabiendo qué es un grupo y por qué existe.
 */
export function CentrosPage() {
  const categorias = useCategories();

  const [creando, setCreando] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);

  const arbol = categorias.data ?? [];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* El botón al extremo opuesto del título, como en el resto de la app:
          es la única acción de la pantalla y se busca siempre en la misma
          esquina. */}
      <CabeceraDePagina
        titulo="Centros de costos"
        ayuda="La estructura con la que se ordena tu plata."
        /* La explicación se enseña una vez y estorba el resto de las veces.
           Detrás del signo de interrogación sigue estando para quien la
           necesite, sin ocupar media pantalla para quien ya la leyó. */
        junto={
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            aria-pressed={verAyuda}
            aria-label={verAyuda ? 'Ocultar cómo funciona' : 'Cómo funciona'}
            title={verAyuda ? 'Ocultar cómo funciona' : 'Cómo funciona'}
            onClick={() => setVerAyuda((v) => !v)}
          >
            <CircleHelp className="size-5" aria-hidden="true" />
          </Button>
        }
        acciones={
          // `size="sm"` como la acción principal del resumen, y el icono sin
          // medida propia: el tamaño de los iconos lo pone el botón.
          <Button type="button" size="sm" onClick={() => setCreando(true)} className="shrink-0">
            <Plus aria-hidden="true" />
            Nuevo centro de costos
          </Button>
        }
      />

      {verAyuda && <Explicacion onCerrar={() => setVerAyuda(false)} />}

      {categorias.isPending && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      )}

      {arbol.length === 0 && !categorias.isPending && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay centros de costos.
            </p>
            {/* El botón aquí además de arriba: en una pantalla vacía, lo
                único que se puede hacer tiene que estar donde se está
                mirando. */}
            <Button type="button" onClick={() => setCreando(true)} className="mt-4">
              <Plus className="size-4" aria-hidden="true" />
              Crear un centro de costos
            </Button>
          </CardContent>
        </Card>
      )}

      {arbol.map((centro) => (
        <Centro key={centro.id} centro={centro} arbol={arbol} />
      ))}

      <CategoriaModal nivel="centro" abierta={creando} onCerrar={() => setCreando(false)} />
    </div>
  );
}

/** El modelo explicado con el ejemplo más común, no en abstracto. */
function Explicacion({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Cómo funciona</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tres niveles. Cada movimiento se guarda en el último, y los de
              arriba suman solos.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={onCerrar}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          <Nivel
            numero={1}
            nombre="Centro de costos"
            explicacion="El bloque grande de tu plata."
            ejemplo="Costos fijos"
          />
          <Nivel
            numero={2}
            nombre="Grupo"
            explicacion="Un tipo de gasto dentro de ese bloque."
            ejemplo="Servicios públicos"
          />
          <Nivel
            numero={3}
            nombre="Concepto"
            explicacion="A quién le pagas. Aquí van los movimientos."
            ejemplo="Celsia (Energía)"
          />
        </ol>

        <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Así, <strong className="text-foreground">¿cuánto se fue en servicios públicos?</strong>{' '}
          es la suma de sus conceptos, y no hay que registrarlo por separado en ningún lado.
        </p>
      </CardContent>
    </Card>
  );
}

function Nivel({
  numero,
  nombre,
  explicacion,
  ejemplo,
}: {
  numero: number;
  nombre: string;
  explicacion: string;
  ejemplo: string;
}) {
  return (
    <li className="flex gap-3" style={{ paddingLeft: `${(numero - 1) * 1.25}rem` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{nombre}</span>
        <span className="block text-sm text-muted-foreground">
          {explicacion} Ej: <em className="text-foreground">{ejemplo}</em>
        </span>
      </span>
    </li>
  );
}

function Centro({ centro, arbol }: { centro: Category; arbol: Category[] }) {
  const [abierto, setAbierto] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(false);
  const actualizar = useActualizarCategoria();
  const grupos = centro.children ?? [];
  const conceptos = grupos.reduce((n, g) => n + (g.children?.length ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-0">
        {/*
          El resaltado va en la FILA, no en el botón.

          Puesto en el botón, se detenía justo antes del kebab —que está fuera
          de él para que pulsarlo no despliegue el centro— y dejaba un trozo sin
          iluminar. Y como el botón es rectangular, sus esquinas cuadradas
          asomaban por encima de las redondeadas de la tarjeta.
        */}
        <div
          className={cn(
            'flex items-center gap-2 pr-3 transition-colors hover:bg-muted sm:pr-4',
            'rounded-t-lg',
            // Cerrado, la fila ES la tarjeta: se redondea también por abajo.
            !abierto && 'rounded-b-lg',
          )}
        >
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            /* `p-3 sm:p-4` y no `p-4 sm:p-6`. Veinticuatro píxeles por encima
               de un título de 18 son más aire que letra, y la fila de un centro
               es una CABECERA —lo que se viene a leer está debajo—, no el
               contenido de la tarjeta. */
            className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left sm:p-4"
          >
            {abierto ? (
              <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                {/* `text-lg` y no `text-xl`: el nombre de un centro es el
                    título de una tarjeta, y a 20px competía con el título de
                    la pantalla, que mide 24. */}
                <span className="truncate text-lg font-semibold">{centro.name}</span>
                {/* El candado y no la palabra "estático": es un estado del
                    centro, y en una lista se reconoce antes por su forma que
                    leyendo una etiqueta en cada fila. */}
                {centro.estatico && (
                  <Lock
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="Centro estático"
                  />
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {grupos.length} grupo(s) · {conceptos} concepto(s)
              </span>
            </span>
          </button>

          {/* Fuera del botón que despliega: dentro, pulsarlo abriría el centro
              además de abrir el menú, porque el clic llega a los dos. */}
          <Menu
            etiqueta={`Acciones de ${centro.name}`}
            Icono={EllipsisVertical}
            soloIcono
            variante="ghost"
          >
            {(cerrar) => (
              <>
                {/* Renombrar. No existía por ningún camino: un centro con el
                    nombre mal escrito había que borrarlo entero —con sus
                    grupos y sus conceptos— y volver a armarlo. */}
                <MenuOpcion
                  Icono={Pencil}
                  onClick={() => {
                    cerrar();
                    setEditando(true);
                  }}
                >
                  Editar
                </MenuOpcion>

                {/* Poder cambiarlo después, no solo al crearlo: los centros que
                    ya existían nacieron antes de que esto existiera. Se queda
                    aquí además de en la ficha porque es de un solo golpe. */}
                <MenuOpcion
                  Icono={centro.estatico ? LockOpen : Lock}
                  onClick={() => {
                    cerrar();
                    actualizar.mutate({
                      id: Number(centro.id),
                      cambios: { estatico: !centro.estatico },
                    });
                  }}
                >
                  {centro.estatico ? 'Marcar como dinámico' : 'Marcar como estático'}
                </MenuOpcion>
                <MenuOpcion
                  Icono={Trash2}
                  peligro
                  onClick={() => {
                    cerrar();
                    setConfirmando(true);
                  }}
                >
                  Eliminar
                </MenuOpcion>
              </>
            )}
          </Menu>
        </div>

        <ConfirmarBorrado
          categoria={centro}
          arbol={arbol}
          abierta={confirmando}
          onCerrar={() => setConfirmando(false)}
        />

        <CategoriaModal
          nivel="centro"
          categoria={editando ? centro : null}
          abierta={editando}
          onCerrar={() => setEditando(false)}
        />

        {abierto && (
          <div className="border-t border-border p-3 sm:p-4">
            {/*
              ── Una rejilla, no una columna ─────────────────────────────────
              Los grupos eran filas apiladas, y una fila de ancho completo con
              cuatro chips dentro deja tres cuartas partes de su renglón en
              blanco: en un centro con seis grupos había que recorrer media
              pantalla de vacío para leerlos. En rejilla se ven todos de un
              vistazo, que es lo que se viene a hacer a esta pantalla.

              ── Por qué un TOPE de columnas y no un ancho mínimo ────────────
              Estuvo con `auto-fill` y `minmax(17rem, 1fr)`, que fija el ancho
              mínimo de una tarjeta y deja que el navegador ponga las que
              quepan. Eso no tiene techo: en un monitor de 27 pulgadas salían
              OCHO tarjetas de 288px en una fila, una pared de fichas estrechas
              donde no se distingue una de otra.

              Un ancho mínimo dice «no más pequeñas de esto». Lo que hace falta
              aquí es lo otro: «no más de estas por fila», porque lo que se
              rompe al crecer la pantalla no es el tamaño de la tarjeta sino
              cuántas caben antes de que la fila deje de leerse. Cinco es el
              tope; por encima, la vista ya no las recorre, las barre.

              1 en un teléfono, 2 desde una tableta, 3 en un portátil pequeño,
              4 en uno grande y 5 a partir de un monitor. Y con `1fr`, dentro
              de cada tramo la tarjeta se estira a lo que haya: no hay ningún
              ancho fijo que pueda quedarse corto o pasarse.

              ── `items-start`: cada tarjeta mide lo suyo ────────────────────
              Por defecto una rejilla ESTIRA sus celdas al alto de la más alta
              de su fila. Eso se puso a propósito, para que el «Agregar
              concepto» de todas quedara a la misma altura, y fue un mal
              cambio: un grupo con dos conceptos acababa midiendo lo que uno
              con doce, así que una fila con un grupo grande inflaba a los
              otros tres y la pantalla se llenaba de vacío.

              Alinear los botones no vale eso. Una tarjeta mide lo que tiene
              dentro, y si sus pies quedan a distinta altura es porque sus
              contenidos son distintos, que es la verdad.
            */}
            <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {grupos.map((grupo) => (
                <Grupo key={grupo.id} grupo={grupo} arbol={arbol} />
              ))}

              {/* El hueco para el siguiente, como una baldosa más de la
                  rejilla: es el mismo lenguaje que la galería de soportes y el
                  hueco de un atajo. Sin ningún grupo es lo único que hay, y un
                  cuadro punteado y vacío se lee como "aquí falta algo" mejor
                  que cualquier frase. */}
              <Agregar
                padreId={centro.id}
                etiqueta="Agregar grupo"
                marcador="Servicios públicos, Educación…"
                solo={grupos.length === 0}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Grupo({ grupo, arbol }: { grupo: Category; arbol: Category[] }) {
  const [editando, setEditando] = useState<Category | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const conceptos = grupo.children ?? [];

  return (
    <Bloque className="sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{grupo.name}</h3>
        {/* El mismo menú que en el centro: un icono suelto no tiene dónde
            pulsarse —en un teléfono hay que acertarle a 16px— y no se ve como
            algo pulsable hasta que uno lo prueba. */}
        <Menu
          etiqueta={`Acciones de ${grupo.name}`}
          Icono={EllipsisVertical}
          soloIcono
          variante="ghost"
        >
          {(cerrar) => (
            <>
              {/* Renombrar un grupo no existía por ningún camino, igual que en
                  el centro: la única salida era borrarlo con sus conceptos
                  dentro y volver a escribirlos. */}
              <MenuOpcion
                Icono={Pencil}
                onClick={() => {
                  cerrar();
                  setRenombrando(true);
                }}
              >
                Editar
              </MenuOpcion>
              <MenuOpcion
                Icono={Trash2}
                peligro
                onClick={() => {
                  cerrar();
                  setConfirmando(true);
                }}
              >
                Eliminar
              </MenuOpcion>
            </>
          )}
        </Menu>
      </div>

      {conceptos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {conceptos.map((concepto) => (
            <li key={concepto.id}>
              {/* Se abren para editar: renombrar y decir si se pagan solos.
                  Antes eran texto muerto, y el único modo de corregir un
                  nombre mal escrito era borrar el concepto y crearlo de nuevo
                  —con lo que los movimientos se quedaban sin clasificar—. */}
              {/* El `Chip` compartido, que trae su borde. A mano era
                   `bg-card` dentro de una caja `muted` dentro de una tarjeta
                   `card`: el chip acababa del mismo color que la tarjeta y
                   desaparecía. Con borde se ve en los dos temas sin depender
                   de qué superficie tenga debajo. */}
              {/* `max-w-full` y el nombre recortado: en una tarjeta de 17rem,
                  un concepto con nombre largo hacía un chip más ancho que su
                  tarjeta y se salía por el lado. */}
              <Chip
                onClick={() => setEditando(concepto)}
                title={`Editar ${concepto.name}`}
                className="max-w-full"
              >
                {concepto.recurrente && (
                  <Repeat
                    className="size-3 shrink-0 opacity-70"
                    aria-label="Se paga cada cierto tiempo"
                  />
                )}
                <span className="min-w-0 truncate">{concepto.name}</span>
              </Chip>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreando(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Agregar concepto
        </Button>
      </div>

      <ConfirmarBorrado
        categoria={grupo}
        arbol={arbol}
        abierta={confirmando}
        onCerrar={() => setConfirmando(false)}
      />

      <CategoriaModal
        nivel="grupo"
        categoria={renombrando ? grupo : null}
        abierta={renombrando}
        onCerrar={() => setRenombrando(false)}
      />

      <ConceptoModal
        abierta={editando !== null}
        concepto={editando}
        onCerrar={() => setEditando(null)}
      />
      <ConceptoModal abierta={creando} grupoId={grupo.id} onCerrar={() => setCreando(false)} />
    </Bloque>
  );
}

/**
 * El hueco del siguiente grupo: una baldosa más de la rejilla.
 *
 * ── Por qué un cuadro punteado y no un enlace ───────────────────────────────
 * Porque ocupa una celda en la misma rejilla que los grupos y con su misma
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
function Agregar({
  padreId,
  etiqueta,
  marcador,
  solo = false,
}: {
  padreId: number;
  etiqueta: string;
  marcador: string;
  /** Sin ningún grupo todavía: la baldosa explica además qué es un grupo. */
  solo?: boolean;
}) {
  const crear = useCrearCategoria();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    const name = nombre.trim();
    if (!name) return;
    setError(null);
    try {
      await crear.mutateAsync({ name, kind: 'expense', parent_id: padreId });
      setNombre('');
      setAbierto(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          'flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-lg p-4',
          'border-2 border-dashed border-border text-center transition-colors',
          'text-sm font-medium text-muted-foreground',
          'hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <Plus className="size-5 shrink-0" aria-hidden="true" />
        {etiqueta}
        {/* Sin ningún grupo, la baldosa es lo único que hay: ahí sí hace falta
            decir qué es un grupo. Con grupos al lado, el ejemplo sobra —ya se
            ve lo que es— y solo añade ruido a cada centro. */}
        {solo && (
          <span className="text-xs font-normal text-muted-foreground">
            El nivel de en medio: {marcador}
          </span>
        )}
      </button>
    );
  }

  return (
    /* Abierto ocupa la fila entera: encajado en una celda de 17rem, el campo
       del nombre y sus dos botones no caben y se parten en tres renglones. */
    <div className="col-span-full flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void guardar();
            if (e.key === 'Escape') setAbierto(false);
          }}
          placeholder={marcador}
          aria-label={etiqueta}
          maxLength={255}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void guardar()}
            disabled={crear.isPending || !nombre.trim()}
            className="w-full sm:w-auto"
          >
            {crear.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Guardar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAbierto(false)}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
