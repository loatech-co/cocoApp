import { ChevronLeft, Minus, Plus, Search } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as PointerEventoDeReact,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mostrarAviso } from '@/components/ui/aviso';
import { FILA_DE_PANEL } from '@/components/panel-inferior';
import { MAXIMO_DE_ATAJOS, anadirAtajo, moverAtajo, quitarAtajo, useAtajos } from '@/lib/atajos';
import { cn } from '@/lib/utils';
import { REALCE } from '@/components/ui/superficie';

/**
 * Los atajos.
 *
 * ── Qué es esto y qué no ────────────────────────────────────────────────────
 * Es el único sitio de la barra que no está ya en otra parte: el resto de sus
 * huecos son secciones que también viven en el menú. Esto responde a "qué hago
 * ahora" en vez de a "a dónde puedo ir".
 *
 * La superficie NO TIENE NOMBRE en los textos. Lo que uno tiene son ATAJOS,
 * enseñados como BALDOSAS. "Panel", "hoja" o "deslizable" describen la
 * mecánica y se quedan en los comentarios.
 *
 * ── La biblioteca son las hojas de la navegación ────────────────────────────
 * Las mismas, leídas al dibujar. Una segunda lista de las páginas del producto
 * se separaría de la navegación la primera vez que se añada una pantalla, y la
 * separación no se vería.
 *
 * ── Personalizar es QUÉ páginas y EN QUÉ ORDEN ──────────────────────────────
 * Un solo modo de edición, dos puertas de entrada y una sola salida:
 *
 *   entrar    la pastilla «Editar», o mantener pulsada una baldosa — "quiero
 *             cambiar esto" es una sola intención por muchas formas que tenga
 *             de decirse
 *   dentro    las baldosas tiemblan, se arrastran unas sobre otras, cada una
 *             saca un menos, y aparece un hueco de «Añadir atajo»
 *   salir     la pastilla «Listo», desde cualquiera de las dos pantallas
 *
 * Elegir página es un paso DENTRO del arreglo: el galón vuelve a él y «Listo»
 * sale de la edición entera.
 */
export interface PaginaDeAtajo {
  ruta: string;
  etiqueta: string;
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

type Estado = 'galeria' | 'arreglando' | 'eligiendo';

interface Arrastre {
  indice: number;
  /** Desde dónde se mide el desplazamiento actual. Se reancla en cada salto. */
  x: number;
  y: number;
  dx: number;
  dy: number;
}

/** Lo que hay que mantener pulsado para entrar a editar. */
const MANTENER = 500;

export function useSuperficieDeAtajos({
  abierto,
  biblioteca,
  porDefecto,
  onIr,
}: {
  abierto: boolean;
  /** Las hojas de la navegación, tal cual, en su orden. */
  biblioteca: readonly PaginaDeAtajo[];
  /** Lo que hay antes de que nadie toque nada. */
  porDefecto: readonly string[];
  /** Se ha elegido una baldosa: el anfitrión cierra el panel. */
  onIr: () => void;
}): { cabeza: ReactNode; cuerpo: ReactNode } {
  const rutas = useAtajos(porDefecto);
  const [estado, setEstado] = useState<Estado>('galeria');
  const [busqueda, setBusqueda] = useState('');
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const rejilla = useRef<HTMLDivElement>(null);

  // Los tres estados son efímeros, como el almacén: una pantalla que se reabre
  // en mitad de una edición es una pantalla que se reabre mal.
  useEffect(() => {
    if (!abierto) {
      setEstado('galeria');
      setBusqueda('');
      setArrastre(null);
    }
  }, [abierto]);

  // Una ruta guardada cuya página ya no existe se cae aquí, al dibujar: quien
  // sabe qué páginas hay es quien pinta, no el almacén.
  const baldosas = rutas
    .map((ruta) => biblioteca.find((p) => p.ruta === ruta))
    .filter((p): p is PaginaDeAtajo => p !== undefined);

  const normal = (t: string): string =>
    t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Solo lo que NO es ya una baldosa: una fila para una página que ya se tiene
  // solo podría significar "quitar", y quitar es para lo que está el menos.
  const disponibles = biblioteca
    .filter((p) => !rutas.includes(p.ruta))
    .filter((p) => busqueda.trim() === '' || normal(p.etiqueta).includes(normal(busqueda.trim())));

  function anadir(ruta: string): void {
    if (!anadirAtajo(ruta)) {
      // La respuesta llega cuando se hace la pregunta: ni un contador
      // permanente ni un control apagado, que no contesta nada al pulsarlo.
      mostrarAviso('No caben más atajos', {
        detalle: `El máximo son ${MAXIMO_DE_ATAJOS}. Quita uno para agregar otro.`,
        tono: 'warning',
      });
    }
  }

  /** Sobre qué baldosa está el dedo, midiendo la rejilla de verdad. */
  function indiceBajo(x: number, y: number): number | null {
    const celdas = rejilla.current?.querySelectorAll('[data-baldosa]');
    if (!celdas) return null;

    for (let i = 0; i < celdas.length; i += 1) {
      const r = celdas[i]!.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }

  function alBajar(e: PointerEventoDeReact<HTMLElement>, indice: number): void {
    if (estado !== 'arreglando') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setArrastre({ indice, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  }

  function alMover(e: PointerEventoDeReact<HTMLElement>): void {
    if (!arrastre) return;

    const destino = indiceBajo(e.clientX, e.clientY);
    if (destino !== null && destino !== arrastre.indice) {
      // Se escribe en el almacén y el render vuelve a dibujar desde él. El DOM
      // nunca es el registro.
      moverAtajo(arrastre.indice, destino);
      // Reanclado en el dedo: la baldosa acaba de saltar de hueco, así que su
      // desplazamiento vuelve a cero y se queda justo debajo.
      setArrastre({ indice: destino, x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
      return;
    }

    setArrastre({ ...arrastre, dx: e.clientX - arrastre.x, dy: e.clientY - arrastre.y });
  }

  const cabeza = (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[42px] items-center gap-2">
        {estado === 'eligiendo' && (
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
            onClick={() => setEstado('arreglando')}
            aria-label="Volver a los atajos"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
        )}

        <h2 className="min-w-0 flex-1 truncate font-display text-lg font-semibold">
          {estado === 'eligiendo' ? 'Agregar atajo' : 'Atajos'}
        </h2>

        {estado === 'galeria' ? (
          <Button type="button" variant="herramienta" size="sm" onClick={() => setEstado('arreglando')}>
            Editar
          </Button>
        ) : (
          <Button type="button" variant="acento" size="sm" onClick={() => setEstado('galeria')}>
            Listo
          </Button>
        )}
      </div>

      {/* La cabeza se pasa del suelo de 78 solo porque su CONTENIDO es más
          alto, que es la única razón por la que debería pasarse. */}
      {estado === 'eligiendo' && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar una página"
            aria-label="Buscar una página"
            className="pl-9"
            autoFocus
          />
        </div>
      )}
    </div>
  );

  const cuerpo =
    estado === 'eligiendo' ? (
      <ul className="flex flex-col">
        {disponibles.map(({ ruta, etiqueta, Icono }) => (
          <li key={ruta}>
            {/* La fila ENTERA es el control: 48 de alto y todo el ancho del
                panel. Por eso el más de la derecha puede ser pequeño. Es la
                misma que usan la hoja de la cuenta y la de buscar, así que la
                clase vive en un solo sitio. */}
            <button
              type="button"
              onClick={() => anadir(ruta)}
              className={FILA_DE_PANEL}
            >
              <Icono className="size-4 shrink-0 opacity-70" aria-hidden={true} />
              <span className="min-w-0 flex-1 truncate">{etiqueta}</span>
              <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}

        {disponibles.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {busqueda.trim() === ''
              ? 'No queda ninguna página por agregar.'
              : 'No hay ninguna página con ese nombre.'}
          </p>
        )}
      </ul>
    ) : (
      <div
        ref={rejilla}
        // Mientras se arregla, la rejilla se queda con el puntero: sin esto, un
        // arrastre hacia abajo para mover una baldosa cerraría el panel.
        data-sin-deslizar={estado === 'arreglando' ? '' : undefined}
        className="grid grid-cols-3 gap-3"
      >
        {baldosas.map((pagina, indice) => (
          <Baldosa
            key={pagina.ruta}
            pagina={pagina}
            indice={indice}
            arreglando={estado === 'arreglando'}
            arrastrada={arrastre?.indice === indice}
            desplazamiento={arrastre?.indice === indice ? arrastre : null}
            onMantener={() => setEstado('arreglando')}
            onQuitar={() => quitarAtajo(pagina.ruta)}
            onIr={onIr}
            onBajar={alBajar}
            onMover={alMover}
            onSoltar={() => setArrastre(null)}
          />
        ))}

        {(estado === 'arreglando' || baldosas.length === 0) && (
          <button
            type="button"
            onClick={() => setEstado('eligiendo')}
            className="col-span-3 flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar atajo
          </button>
        )}
      </div>
    );

  return { cabeza, cuerpo };
}

function Baldosa({
  pagina,
  indice,
  arreglando,
  arrastrada,
  desplazamiento,
  onMantener,
  onQuitar,
  onIr,
  onBajar,
  onMover,
  onSoltar,
}: {
  pagina: PaginaDeAtajo;
  indice: number;
  arreglando: boolean;
  arrastrada: boolean;
  desplazamiento: { dx: number; dy: number } | null;
  onMantener: () => void;
  onQuitar: () => void;
  onIr: () => void;
  onBajar: (e: PointerEventoDeReact<HTMLElement>, indice: number) => void;
  onMover: (e: PointerEventoDeReact<HTMLElement>) => void;
  onSoltar: () => void;
}) {
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mantuvo = useRef(false);
  const { Icono, etiqueta, ruta } = pagina;

  function empezarAContar(e: PointerEventoDeReact<HTMLElement>): void {
    if (arreglando) {
      onBajar(e, indice);
      return;
    }
    mantuvo.current = false;
    reloj.current = setTimeout(() => {
      mantuvo.current = true;
      onMantener();
    }, MANTENER);
  }

  function dejarDeContar(): void {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
  }

  useEffect(() => dejarDeContar, []);

  const estilo = desplazamiento
    ? { transform: `translate(${desplazamiento.dx}px, ${desplazamiento.dy}px)` }
    : undefined;

  const caja = cn(
    'relative flex aspect-square flex-col items-center justify-center gap-2 rounded-lg bg-muted p-2 text-center text-foreground transition-colors',
    REALCE,
    // La baldosa que va en el dedo no tiembla: la animación pisaría el
    // desplazamiento en línea y se quedaría quieta bajo el dedo.
    arreglando && !arrastrada && 'animate-[baldosa-tiembla_.4s_ease-in-out_infinite]',
    arrastrada && 'z-10 scale-105 shadow-[var(--sombra-flotante)]',
  );

  const contenido = (
    <>
      <Icono className="size-6 shrink-0" aria-hidden={true} />
      <span className="line-clamp-2 text-2xs font-medium leading-tight">{etiqueta}</span>
    </>
  );

  return (
    <div className="relative" data-baldosa>
      {arreglando ? (
        <button
          type="button"
          className={cn(caja, 'w-full touch-none')}
          style={estilo}
          onPointerDown={empezarAContar}
          onPointerMove={onMover}
          onPointerUp={onSoltar}
          onPointerCancel={onSoltar}
          aria-label={`Mover ${etiqueta}`}
        >
          {contenido}
        </button>
      ) : (
        <Link
          to={ruta}
          className={caja}
          onPointerDown={empezarAContar}
          onPointerUp={dejarDeContar}
          onPointerCancel={dejarDeContar}
          onPointerMove={dejarDeContar}
          onClick={(e) => {
            // Se mantuvo pulsada: la intención era editar, no ir.
            if (mantuvo.current) {
              e.preventDefault();
              return;
            }
            onIr();
          }}
        >
          {contenido}
        </Link>
      )}

      {arreglando && (
        /**
         * El menos.
         *
         * 24, por debajo del suelo táctil de 42, y es una excepción CONCEDIDA,
         * no descubierta: se llega a él dentro de un modo al que se entra
         * manteniendo pulsada una baldosa, y uno más grande se pulsaría sin
         * querer justo al arrastrar, que es lo otro que se hace aquí.
         */
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar ${etiqueta}`}
          className="absolute -left-1 -top-1 grid size-6 place-items-center rounded-full bg-foreground text-background shadow-[var(--sombra-pegada)]"
        >
          <Minus className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
