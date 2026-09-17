import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useDeslizarParaCerrar } from '@/lib/deslizar';
import { useEscape, useFocoAtrapado } from '@/lib/foco';
import { SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';
import { cn } from '@/lib/utils';

/**
 * Una fila de un panel: un icono, un nombre y lo que venga detrás.
 *
 * ── Por qué es una clase y no un componente ─────────────────────────────────
 * Porque unas son `<button>` —agregar un atajo, cerrar la sesión— y otras son
 * `<Link>` —ir a una sección, abrir un movimiento—, y lo que comparten es el
 * ASPECTO. Es el mismo recurso que `BLOQUE` y `SUPERFICIE_FLOTANTE`: un solo
 * sitio donde cambia, sin obligar a que todas sean el mismo elemento.
 *
 * 48 de alto, que es la medida de una fila que se toca con el pulgar, y todo
 * el ancho del panel: así el icono de la derecha —un más, un galón— puede ser
 * pequeño, porque el blanco no es él sino la fila entera.
 */
export const FILA_DE_PANEL =
  'flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors hover:bg-muted';

/**
 * Un panel que sube desde el borde de abajo.
 *
 * ── Por qué se monta una vez y se RELLENA ───────────────────────────────────
 * Todo lo demás en esta carpeta se dibuja entero en cada render. Esto no
 * puede: el deslizamiento es una transición de CSS, y un elemento reconstruido
 * en cada render no tiene posición anterior desde la que viajar — aparecería,
 * nunca llegaría.
 *
 * Por eso se monta SIEMPRE, abierto o cerrado, y lo que cambia es su contenido
 * y su estado. En React eso quiere decir que la llamada nunca lleva
 * `{abierto && <PanelInferior />}`: eso es reconstruirlo.
 *
 * ── Por qué está contra el `body` ───────────────────────────────────────────
 * Para que haya UN panel por documento y no uno por pantalla. Es una capa
 * fija: dónde viva en el árbol no cambia en nada dónde se pinta, y contra el
 * `body` queda por delante de cualquier tarjeta con `overflow` que lo habría
 * recortado.
 *
 * ── Las cuatro salidas ──────────────────────────────────────────────────────
 * El tirador, el velo, Escape y deslizar hacia abajo. Un panel que se puede
 * abrir y no cerrar es el fallo de diseño en su forma más pura, así que las
 * cuatro son del componente: ninguna se le encarga a quien lo abre.
 */
export function PanelInferior({
  abierto,
  titulo,
  cabeza,
  capa = 'z-40',
  onCerrar,
  children,
}: {
  abierto: boolean;
  /** Su nombre accesible. Lo que se ve lo decide `cabeza`. */
  titulo: string;
  cabeza?: ReactNode;
  /**
   * En qué capa se dibuja.
   *
   * De fábrica va en `z-40`: por encima del armazón —la barra está en 15 y el
   * techo en 20— y por debajo de una ficha, que vive en 50.
   *
   * Lo sube quien SALE DE algo que ya está arriba: el desplegable de un menú
   * se abre desde dentro de una ficha, así que un panel en 40 se dibujaría
   * detrás de la ficha que lo pidió.
   */
  capa?: string;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const columna = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | null>(null);

  // Cada apertura es una visita nueva. La llave remonta el contenido, y eso
  // hace dos cosas de una: dispara la animación de entrada —que corre por
  // EXISTIR, porque el cuerpo se reemplaza entero— y devuelve a su estado
  // inicial cualquier cosa que estuviera a medias. Una pantalla que se reabre
  // en mitad de una edición es una pantalla que se reabre mal.
  const visitas = useRef(0);
  const estabaAbierto = useRef(abierto);
  if (abierto && !estabaAbierto.current) visitas.current += 1;
  estabaAbierto.current = abierto;

  /**
   * El alto se MIDE.
   *
   * El panel mide lo que mide su contenido —seis baldosas son dos filas; la
   * lista de páginas es el alto entero—, y pasar de uno a otro era un salto
   * mientras entrar y salir eran suaves.
   *
   * Y se mide en vez de dejarlo en `auto` porque una transición necesita dos
   * valores definidos: de `auto` a `auto` el valor declarado no cambia, así
   * que no hay nada que animar por mucho que el contenido mida otra cosa.
   * `interpolate-size` resuelve ir DE una palabra clave A un número, que es
   * otro problema. Con la medida, el alto es siempre un número.
   */
  useLayoutEffect(() => {
    const el = columna.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const observador = new ResizeObserver(() => setAlto(el.offsetHeight));
    observador.observe(el);
    setAlto(el.offsetHeight);
    return () => observador.disconnect();
  }, []);

  useEscape(abierto, onCerrar);
  useFocoAtrapado(panel, abierto);
  useDeslizarParaCerrar({ elemento: panel, hacia: 'abajo', activo: abierto, onCerrar });

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      // El velo. Se desvanece; no se monta y se desmonta: un elemento que
      // acaba de nacer no tiene opacidad anterior desde la que viajar.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      className={cn(
        'fixed inset-0 bg-[var(--velo)] transition-opacity duration-200 ease-[ease]',
        capa,
        abierto ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-superficie="panel"
        data-abierta={abierto ? 'si' : 'no'}
        // Cerrado no es solo invisible: no se tabula. Un panel apagado que
        // conserva sus ocho enlaces en el orden del teclado es una página que
        // tiene el doble de paradas de las que enseña.
        inert={!abierto}
        tabIndex={-1}
        style={{ height: alto ?? undefined }}
        className={cn(
          'fixed inset-x-0 bottom-0 flex max-h-[88dvh] flex-col overflow-hidden outline-none',
          /*
            Solo arriba: las esquinas de abajo caen fuera de la pantalla y
            curvarlas deja dos muescas del fondo.

            ── Y 16px, por encima del radio estándar ─────────────────────────
            Es la segunda excepción de la app, junto al pozo, y por el mismo
            motivo: esta esquina mide el ANCHO ENTERO de la pantalla, y en un
            canto tan largo 10px casi no se ven. Lo que la curva tiene que
            contar —que esto es una hoja que SUBIÓ y que la página sigue
            debajo— depende de que se vea.

            Y no rompe la regla, que habla de contenedores VECINOS: el panel
            no tiene vecinos, está encima de todo. Está registrada con su
            motivo en `components/ui/radio.test.ts`.
          */
          'rounded-t-[16px]',
          SUPERFICIE_FLOTANTE,
          // La misma duración y la misma curva para el viaje y para el alto:
          // crece y encoge con el mismo gesto con el que llegó.
          'transition-[transform,height] duration-[220ms] ease-[cubic-bezier(.4,0,.2,1)]',
          abierto ? 'translate-y-0' : 'translate-y-full',
          // El panel entero es del gesto; el cuerpo se queda con el suyo para
          // poder desplazarse, y no se lo pasa a la página de detrás.
          'touch-none',
        )}
      >
        <div ref={columna} className="flex max-h-[88dvh] flex-col">
          {/* ── La cabeza ──────────────────────────────────────────────────
              Con suelo de 78px. Una cabeza con una sola línea de título es
              tan baja que dos paneles de la misma familia abrían a alturas
              distintas, y lo que el ojo lee como cambiado es la cabeza. Una
              con buscador es más alta porque su CONTENIDO es más alto, que es
              la única razón por la que debería pasarse del suelo.

              Un recuadro, 24 a los lados; 12 hasta el cuerpo. Una cabeza se
              lee por sus BORDES, no por sus partes.

              24 y no 16: con 16, el título y el primer renglón del cuerpo
              quedaban casi a ras del canto de la pantalla —la hoja ocupa el
              ancho entero, así que su relleno es lo ÚNICO que separa lo
              escrito del borde del teléfono— y el texto se leía comido. */}
          <div className="min-h-[78px] shrink-0 px-6 pb-3">
            <Tirador />
            {cabeza ?? <h2 className="font-display text-lg font-semibold">{titulo}</h2>}
          </div>

          {/* El borde seguro va en el RELLENO DEL CUERPO y no en el panel: un
              panel con relleno deja una franja de color muerta debajo del
              desplazamiento en vez de dejar que el contenido pase por debajo.

              24 a los lados, los mismos de la cabeza: dos sangrados distintos
              se ven como un escalón en el canto izquierdo de la hoja.

              Y 30 abajo, más que los lados a propósito: ahí no hay canto de
              pantalla sino el borde de abajo del teléfono, donde vive el gesto
              de volver al inicio. La última fila necesita más aire que las
              otras para no quedar debajo de él. */}
          <div
            key={visitas.current}
            data-cuerpo
            className="min-h-0 flex-1 touch-pan-y overscroll-contain px-6 pb-[calc(30px+env(safe-area-inset-bottom,0px))] [overflow-y:auto]"
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * El tirador.
 *
 * Es un INDICADOR, no un control: dice que esto se puede arrastrar y por
 * dónde. Por eso está exento del suelo táctil de 42 y por eso el gesto se lee
 * en todo el panel y no encima de él — apuntar a una raya de 5px con el pulgar
 * sería un gesto peor que el que sustituye.
 *
 * En el borde de abajo va esto y no una equis: una equis en la cabeza de un
 * panel que sube desde abajo compite con el título, y el borde ya está ahí.
 */
function Tirador() {
  return (
    <div className="flex h-8 w-full items-center justify-center" aria-hidden="true">
      <span className="h-[5px] w-[72px] rounded-full bg-muted-foreground/40" />
    </div>
  );
}
