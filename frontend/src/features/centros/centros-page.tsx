import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  EllipsisVertical,
  Lock,
  LockOpen,
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
import { Skeleton } from '@/components/ui/skeleton';
import { useActualizarCategoria, useCategories } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';
import { CabeceraDePagina } from '@/components/cabecera-de-pagina';
import { Bloque } from '@/components/ui/bloque';
import { IconoDeCategoria } from '@/components/ui/iconos';
import { REALCE_DE_SUPERFICIE } from '@/components/ui/superficie';

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
        ayuda="La estructura con la que se ordena tu dinero."
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
            <p className="text-sm text-muted-foreground">Todavía no hay centros de costos.</p>
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
              Tres niveles. Cada movimiento se guarda en el último, y los de arriba suman solos.
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
            explicacion="El bloque grande de tu dinero."
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
          Así, <strong className="text-foreground">¿cuánto se gastó en servicios públicos?</strong>{' '}
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

  /* El hueco para el siguiente grupo. Se declara aquí porque va en dos sitios
     —dentro de las columnas cuando hay grupos, suelto cuando no— y son el
     mismo botón con los mismos textos: escrito dos veces, cambiar uno y
     olvidar el otro es cuestión de tiempo. */
  const hueco = <Agregar padreId={centro.id} solo={grupos.length === 0} />;

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
              ── Mampostería, no rejilla ─────────────────────────────────────
              Los grupos eran filas apiladas, y una fila de ancho completo con
              cuatro chips dentro deja tres cuartas partes de su renglón en
              blanco: en un centro con seis grupos había que recorrer media
              pantalla de vacío para leerlos. En columnas se ven todos de un
              vistazo, que es lo que se viene a hacer a esta pantalla.

              Pero una REJILLA alinea por FILAS, y de ahí no se sale bien: o
              estira todas las tarjetas al alto de la más alta —y un grupo con
              doce conceptos infla a los otros cuatro de su fila—, o cada una
              mide lo suyo y cada fila termina en un escalón distinto. Lo que
              había era la tercera salida: alto fijo y desplazar los conceptos
              que no cupieran. Esa esconde detrás de un gesto justamente lo
              que se viene a leer.

              La mampostería no tiene filas. Cada tarjeta se coloca debajo de
              la anterior de SU columna, así que mide exactamente lo que tiene
              dentro: ninguna infla a nadie, no hay nada que desplazar y no
              queda hueco entre una y la siguiente.

              ── Columnas CSS, y no la mampostería de la rejilla ─────────────
              `grid-template-rows: masonry` sigue detrás de una bandera en un
              solo navegador. Las columnas múltiples hacen esto mismo, sin una
              línea de JavaScript, en todos.

              Lo que cambia con ellas es el ORDEN: se lee hacia abajo por
              columnas, no de izquierda a derecha. Para un listado de grupos
              —donde se busca un nombre, no el sitio n-ésimo— es el recorrido
              de una lista, repetido al lado.

              ── El tope de columnas ─────────────────────────────────────────
              1 en un teléfono, 2 desde una tableta, 3 en un portátil pequeño,
              4 en uno grande y 5 a partir de un monitor.

              Un ancho mínimo —`minmax(17rem, 1fr)`, que es lo que hubo— no
              tiene techo: en un monitor de 27 pulgadas salían OCHO tarjetas de
              288px en una fila, una pared de fichas estrechas donde no se
              distingue una de otra. Lo que hace falta no es «no más pequeñas
              de esto» sino «no más de estas por fila»: lo que se rompe al
              crecer la pantalla no es el tamaño de la tarjeta, es cuántas
              caben antes de que la fila deje de leerse.

              Y el ancho de una tarjeta es el de su columna, así que no depende
              de cuántas haya: dos grupos se ven del mismo tamaño que doce.
            */}
            {grupos.length > 0 && (
              /* Sin margen negativo que compense el `mb-3` de la última
                 tarjeta de cada columna.

                 Es lo que se hace siempre en una mampostería de columnas, y
                 aquí no vale: el margen del final de una columna se descarta
                 cuando la columna termina en un CORTE, pero se conserva cuando
                 termina el contenido. Cuál de las dos cosas pasa en la columna
                 más alta —que es la que fija el alto del bloque— depende de
                 cuántas tarjetas haya y de qué mida cada una, así que un
                 `-mb-3` acierta con unos datos y se come doce píxeles del
                 relleno de la tarjeta con otros.

                 Con el hueco de «Agregar grupo» cerrando el bloque, abajo del
                 todo no hay ningún margen que compensar: el relleno de la
                 tarjeta es el que dice que sea, siempre. */
              <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
                {grupos.map((grupo) => (
                  <Grupo key={grupo.id} grupo={grupo} arbol={arbol} />
                ))}
              </div>
            )}

            {/*
              El hueco del siguiente grupo va FUERA de las columnas, a todo el
              ancho y debajo de todo.

              Dentro era una pieza más de la mampostería, y ahí no funciona: la
              mampostería termina en un borde irregular —cada columna acaba
              donde acaba su última tarjeta— así que el hueco caía al pie de
              una columna cualquiera, a una altura que cambia cada vez que se
              agrega un concepto. Un sitio que se mueve es un sitio que hay que
              buscar.

              A todo el ancho y al final está siempre donde termina de leerse
              el centro, y remata el borde irregular con una línea recta.
            */}
            {hueco}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Lo que hace de una tarjeta una pieza de la mampostería.
 *
 * ── Por qué `break-inside-avoid` no es opcional ─────────────────────────────
 * Sin él, una tarjeta que no cabe entera al pie de su columna se PARTE: el
 * título y dos conceptos abajo del todo, el resto arriba de la siguiente, y
 * ningún borde que cierre ni que abra. Es la declaración que convierte un
 * texto en columnas en un montón de fichas.
 *
 * ── Y por qué el hueco de abajo es un margen y no el `gap` ──────────────────
 * Porque en un contenedor de columnas `gap` es solo el hueco ENTRE COLUMNAS.
 * Lo que separa una tarjeta de la de debajo no lo pone nadie, y sin margen
 * quedan pegadas. Doce píxeles, los mismos del `gap-3` de al lado, para que la
 * separación se lea igual en los dos sentidos.
 */
const BALDOSA = 'mb-3 break-inside-avoid';

function Grupo({ grupo, arbol }: { grupo: Category; arbol: Category[] }) {
  const [editando, setEditando] = useState<Category | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const conceptos = grupo.children ?? [];

  return (
    /* `pt` más corto que el resto del relleno: arriba de la tarjeta manda el
       kebab, que es un botón de 36 con un icono de 16 dentro, y esos diez
       píxeles de aire suyo se suman a los del borde. Con el relleno parejo,
       el título quedaba hundido. */
    <Bloque className={cn('pt-2 sm:p-4 sm:pt-2.5', BALDOSA)}>
      <div className="flex items-center justify-between gap-2">
        {/*
          El icono a la IZQUIERDA del nombre, no encima ni dentro de un pastel.

          Es lo que hace que una rejilla de doce grupos se recorra mirando en
          vez de leyendo: la forma se reconoce antes que la palabra. A la
          izquierda porque es por donde empieza a leerse la fila, y del mismo
          tamaño que el texto —no un adorno grande— porque acompaña al nombre,
          no lo sustituye.

          Un grupo sin icono no deja hueco reservado: `IconoDeCategoria`
          devuelve nada y el nombre arranca donde arrancaba antes. Un hueco
          vacío alineado con los que sí tienen icono se ve como un icono que
          no cargó.
        */}
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <IconoDeCategoria nombre={grupo.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{grupo.name}</span>
        </h3>
        {/* El mismo menú que en el centro: un icono suelto no tiene dónde
            pulsarse —en un teléfono hay que acertarle a 16px— y no se ve como
            algo pulsable hasta que uno lo prueba. */}
        {/*
          El kebab se acerca al canto con margen NEGATIVO, no encogiéndolo.

          Su blanco son 36px de puntero y 42 de dedo, y el icono son 16: los
          diez de aire que quedan alrededor se sumaban a los del borde de la
          tarjeta y el icono acababa a veintiséis píxeles de la esquina,
          flotando. Recortando el botón se arreglaría la vista y se rompería
          el blanco, que es lo que hay que acertar con el pulgar.

          Con el margen en negativo el botón sigue midiendo lo mismo —se puede
          pulsar igual— y lo que se mueve es dónde queda dibujado dentro de
          él. El área táctil se come el relleno de la tarjeta, que es espacio
          muerto de todos modos.
        */}
        <Menu
          etiqueta={`Acciones de ${grupo.name}`}
          Icono={EllipsisVertical}
          soloIcono
          variante="ghost"
          claseCaja="-my-1 -mr-1.5 sm:-mr-2"
        >
          {(cerrar) => (
            <>
              {/* Lo PRIMERO del menú: es lo que más se hace con un grupo.
                  Eliminar va al final y en rojo, porque es lo que menos. */}
              <MenuOpcion
                Icono={Plus}
                onClick={() => {
                  cerrar();
                  setCreando(true);
                }}
              >
                Agregar concepto
              </MenuOpcion>

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

      {/*
        Ni caja que los desplace ni alto que rellenar: la tarjeta mide lo que
        tienen ellos.

        Estuvieron dentro de un `overflow-y-auto` con `flex-1`, que era lo que
        sostenía el alto fijo de la rejilla: doce conceptos se desplazaban
        dentro de su tarjeta en vez de costarle un centímetro a las vecinas.
        En mampostería no hace falta pagar ese precio —una tarjeta alta no
        infla a nadie— y desplazar escondía detrás de un gesto justamente lo
        que se viene a leer a esta pantalla.
      */}
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
/**
 * El hueco del siguiente grupo.
 *
 * ── Por qué un cuadro punteado y no un enlace ───────────────────────────────
 * Porque el borde punteado es lo que en todas partes significa «aquí cabe algo
 * que todavía no está» —el mismo lenguaje que el hueco de un soporte y el de
 * un atajo—, y eso se lee como el sitio del próximo grupo, no como una acción
 * suelta en otra parte de la tarjeta.
 *
 * ── Por qué abre la ficha y ya no un campo suelto ───────────────────────────
 * Tenía su propio formulario en línea: un campo para el nombre y dos botones.
 * Así, crear un grupo y editarlo eran dos formularios distintos para la misma
 * cosa, y el de crear no pedía el icono —que es la mitad de lo que hace a un
 * grupo reconocible en la rejilla—. El resultado es que todo grupo nacía sin
 * icono y había que abrir la ficha justo después para ponérselo.
 *
 * Con la misma ficha en los dos casos, lo que se pide al crear es exactamente
 * lo que se puede cambiar al editar. Y de paso desaparece el único campo de la
 * pantalla que nacía enfocado.
 */
function Agregar({
  padreId,
  solo = false,
}: {
  /** De qué centro cuelga el grupo que se va a crear. */
  padreId: number;
  /** Sin ningún grupo todavía: el hueco es lo único que hay en el centro. */
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
          Sin ningún grupo, el hueco no es una baldosa más: es lo ÚNICO que
          hay, y una baldosa de 17rem sola en la esquina de un centro vacío
          se lee como un botón que alguien dejó ahí. A ancho completo y alto
          —`min-h-64`, 256px— se lee como lo que es: el sitio donde va a
          empezar la estructura de este centro.

          256 y no 250 exactos porque es el escalón de la escala que los
          cumple; una medida a mano por seis píxeles es una medida que
          mañana nadie sabe de dónde salió.

          Con grupos encima es una BARRA: el icono y el texto en una fila y
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
        El mismo texto haya grupos o no.

        Cuando no había ninguno, la baldosa añadía debajo un «El nivel de en
        medio: …» que la otra no llevaba. Es el mismo botón y hace lo mismo
        en los dos casos: cambiarle el texto según cuántas tarjetas tenga al
        lado obliga a leerlo dos veces para comprobar que sigue siendo el
        mismo. Lo que cambia es su tamaño, que ya dice bastante.
      */}
        <Plus className="size-5 shrink-0" aria-hidden="true" />
        Agregar grupo
      </button>

      <CategoriaModal
        nivel="grupo"
        padreId={padreId}
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
      />
    </>
  );
}
