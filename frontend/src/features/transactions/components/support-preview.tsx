import { Loader2, Maximize2, Minus, Plus } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef } from 'react';

import type { FalloDeSoporte } from '@/features/transactions/model/supports';
import { usePanZoom } from '@/shared/lib/pan-zoom';
import { cn } from '@/shared/lib/utils';
import { LienzoPdf } from '@/shared/ui/atoms/pdf-canvas';
import { BotonOscuro } from '@/shared/ui/molecules/overlay-control';

import { SoporteQueNoSeVe } from './support-unavailable';

/** Los saltos del zoom, como múltiplos de la escala que llena la caja. */
const PASOS_DE_LA_PREVIA = [1, 1.5, 2, 3];

interface PreviewProps {
  /**
   * El documento. Mientras no esté, se enseña el marco vacío con su girador.
   *
   * ── Por qué el marco va PRIMERO ───────────────────────────────────────────
   * El soporte de un movimiento guardado se descarga: hay un momento —corto en
   * una imagen, largo en un PDF de varias hojas— en el que no hay nada que
   * pintar. Sin marco, la columna se queda vacía y aparece de golpe un bloque
   * que empuja lo de abajo; con él, el sitio ya está hecho y lo único que
   * cambia es lo que hay dentro.
   *
   * Es la misma razón por la que una tabla enseña sus filas en gris antes de
   * tener datos: lo que no puede cambiar de tamaño es la página.
   */
  url?: string | undefined;
  /**
   * El documento no se está viendo, y por qué.
   *
   * Sin esto se dibujaba el mismo girador que mientras se espera, y un soporte
   * que no iba a llegar giraba para siempre: quien mira no puede distinguir
   * «está tardando» de «no está», que piden cosas distintas.
   */
  fallo?: FalloDeSoporte | undefined;
  /** Solo hace algo con `sin-cargar`: lo ausente no vuelve por reintentarlo. */
  onReintentar?: (() => void) | undefined;
  esImagen: boolean;
  /**
   * Abre el pase a pantalla completa, si lo hay.
   *
   * Solo lo tiene un soporte ya guardado: el que todavía está esperando a que
   * se guarde el movimiento no existe en ninguna parte que se pueda abrir. Sin
   * esto, el botón aparecería en los dos sitios y en uno no haría nada.
   */
  onAbrir?: (() => void) | undefined;
  /**
   * Lo que se puede hacer con ESTE documento: borrarlo, añadir otro, pasar al
   * siguiente.
   *
   * Van aquí desde que no hay miniaturas. La fila de miniaturas era la que
   * decía cuántos documentos hay, cuál se está viendo y por dónde se añade o
   * se quita uno; sin ella, todo eso tiene que caber sobre el papel o
   * desaparece.
   */
  acciones?: ReactNode;
}

/**
 * El soporte en grande, recorrible.
 *
 * ── Por qué llena la caja y no entra entera ─────────────────────────────────
 * Porque esta columna existe exactamente para leer el total. Ver `usePanZoom`,
 * que es quien encuadra y recorta el arrastre.
 *
 * ── Por qué arrastrar y no barras de desplazamiento ─────────────────────────
 * Porque es un documento, no una página: el gesto con el que todo el mundo
 * mueve un plano o un mapa es agarrarlo.
 */
export function PreviaDeArchivo({
  url,
  fallo,
  onReintentar,
  esImagen,
  onAbrir,
  acciones,
}: PreviewProps) {
  /*
    El zoom multiplica la escala que ya LLENA la caja, así que el 100 % es el
    documento cubriendo el marco y no su tamaño natural.

    No baja del 100 % a propósito: por debajo aparecerían franjas vacías a los
    lados, y una previsualización con huecos se lee como un error de montaje.
    Para ver la hoja entera está el pase a pantalla completa del movimiento ya
    guardado.
  */
  const marco = useRef<HTMLDivElement>(null);
  const vista = usePanZoom(marco, PASOS_DE_LA_PREVIA);

  return (
    <div
      ref={marco}
      // `touch-action: none` para que el dedo mueva el documento y no desplace
      // la ficha entera por detrás.
      className={cn(
        /*
          ── El alto lo pone la COLUMNA, no este marco ──────────────────────
          Tuvo 480 y luego 350 fijos, y un alto fijo se equivoca por los dos
          lados: dejaba un palmo de vacío entre el papel y el pie de su
          columna, y en una ventana baja se comía el sitio de todo lo demás.

          Con `flex-1` mide lo que le sobre a su columna, que es exactamente
          lo que mide la columna de campos: las dos son celdas de la misma
          fila de la rejilla. El documento se reencuadra solo —el marco se
          mide con un `ResizeObserver` y la escala sale de ahí— así que crecer
          no le cuesta nada.

          El suelo de 220 es para el caso en que no haya alto que repartir:
          una previsualización de cuarenta píxeles no enseña nada y el
          `ResizeObserver` se quedaría midiendo una franja.
        */
        'relative min-h-[220px] flex-1 touch-none select-none overflow-hidden rounded-lg bg-card ring-1 ring-border',
        vista.sePuedeMover && (vista.arrastrando ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      {...vista.handlers}
    >
      {/* El pase a pantalla completa, arriba y en la esquina contraria a los
          mandos del zoom: son dos cosas distintas —una amplía dentro del
          marco, la otra saca el documento del marco— y juntas se pulsarían la
          una por la otra. */}
      <PreviewActions onAbrir={onAbrir} acciones={acciones} />

      <PreviewZoom
        visible={Boolean(url)}
        zoom={vista.zoom}
        paso={vista.paso}
        onZoom={vista.setZoom}
      />

      <PreviewDocument
        url={url}
        fallo={fallo}
        onReintentar={onReintentar}
        esImagen={esImagen}
        encuadre={vista.encuadre}
        onTamano={(ancho, alto) => vista.setNatural({ ancho, alto })}
      />
    </div>
  );
}

/**
 * Los mandos del zoom, sobre una pastilla oscura: encima de un recibo —que es
 * blanco— cualquier control claro desaparece.
 *
 * Solo con el documento cargado: ampliar un marco vacío no hace nada, y un
 * control que no responde se lee como un fallo.
 */
function PreviewZoom({
  visible,
  zoom,
  paso,
  onZoom,
}: {
  visible: boolean;
  zoom: number;
  paso: number;
  onZoom: (cambiar: (zoom: number) => number) => void;
}) {
  return (
    <div
      data-mandos=""
      hidden={!visible}
      className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
    >
      <BotonOscuro
        etiqueta="Alejar"
        deshabilitado={zoom === 0}
        onClick={() => onZoom((z) => Math.max(0, z - 1))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </BotonOscuro>
      <button
        type="button"
        onClick={() => onZoom(() => 0)}
        title="Volver al tamaño normal"
        className="tabular min-w-[3rem] text-center text-2xs font-medium text-sala-tinta"
      >
        {Math.round(paso * 100)} %
      </button>
      <BotonOscuro
        etiqueta="Acercar"
        deshabilitado={zoom === PASOS_DE_LA_PREVIA.length - 1}
        onClick={() => onZoom((z) => Math.min(PASOS_DE_LA_PREVIA.length - 1, z + 1))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </BotonOscuro>
    </div>
  );
}

/** Lo que hay dentro del marco: el fallo, el girador, la imagen o el PDF. */
function PreviewDocument({
  url,
  fallo,
  onReintentar,
  esImagen,
  encuadre,
  onTamano,
}: {
  url: string | undefined;
  fallo: FalloDeSoporte | undefined;
  onReintentar: (() => void) | undefined;
  esImagen: boolean;
  encuadre: CSSProperties;
  onTamano: (ancho: number, alto: number) => void;
}) {
  if (fallo) return <SoporteQueNoSeVe fallo={fallo} onReintentar={onReintentar} />;

  if (!url) {
    return (
      // El girador en el centro del marco, con el mismo gris que el resto de
      // lo que está esperando en esta app.
      <span
        className="grid size-full place-items-center"
        role="status"
        aria-label="Cargando el soporte"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </span>
    );
  }

  if (!esImagen) {
    // A 1400 y no a 240: esto se mira para leer una cifra, y el tamaño de una
    // miniatura la deja borrosa.
    return <LienzoPdf url={url} ancho={1400} onTamano={onTamano} estilo={encuadre} />;
  }

  return (
    <img
      src={url}
      alt=""
      draggable={false}
      /*
        `max-w-none`, y no es cosmético: es lo que deformaba la imagen.

        El preflight de Tailwind declara `img, video { max-width: 100%;
        height: auto }` para que ninguna imagen suelta se salga de su columna.
        Aquí eso es justo lo contrario de lo que hace falta: el encuadre calcula
        un ancho y un alto que YA guardan la proporción —la escala es la misma
        para los dos ejes— y los pinta en el `style`. El `max-width` del
        preflight le gana al ancho en línea —un máximo siempre gana— pero no
        toca el alto, así que la imagen se quedaba con el ancho del marco y el
        alto entero: estirada.

        No le pasaba al PDF porque lo pinta un `<canvas>`, y esa regla del
        preflight es solo para `img` y `video`. De ahí que pareciera que
        fallaba con «algunas imágenes».
      */
      className="max-w-none"
      onLoad={(e) => onTamano(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      style={encuadre}
    />
  );
}

/** Lo que se hace con el documento, arriba a la derecha, y el pase si lo hay. */
function PreviewActions({ onAbrir, acciones }: Pick<PreviewProps, 'onAbrir' | 'acciones'>) {
  if (onAbrir === undefined && !acciones) return null;

  return (
    <div
      data-mandos=""
      className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
    >
      {acciones}
      {onAbrir && (
        <BotonOscuro etiqueta="Ver en grande" onClick={onAbrir}>
          <Maximize2 className="size-4" aria-hidden="true" />
        </BotonOscuro>
      )}
    </div>
  );
}
