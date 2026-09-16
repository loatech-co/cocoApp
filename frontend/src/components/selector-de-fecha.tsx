import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { Calendario, mesDeISO, type MesVisible } from '@/components/calendario';
import { Menu } from '@/components/menu';
import { Button } from '@/components/ui/button';
import { disparadorDeCampo, useDentroDeUnCampo } from '@/components/ui/campo';
import { diaLargo, rangoLargo } from '@/lib/fechas';
import { PRESETS, rangoDe, type Filtros, type Preset } from '@/lib/filtros';
import { useHistoria } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { REALCE } from '@/components/ui/superficie';

/**
 * EL selector de fechas. Uno solo, con o sin rango y con o sin atajos.
 *
 * ── Por qué uno y no dos ────────────────────────────────────────────────────
 * Eran dos componentes —uno para un día, otro para un rango— y de las seis
 * decisiones que toma un selector de fechas compartían cinco: qué abre el
 * panel, cómo se cierra, dónde se coloca, qué calendario va dentro y cuánto
 * mide. Lo único suyo era cuántos extremos se eligen.
 *
 * Dos copias empiezan iguales y se separan, y aquí ya había empezado: el de un
 * día colgaba de `Menu` —que sabe colocarse contra la ventana, cerrar al tocar
 * fuera y con Escape— y el de rango llevaba treinta líneas de esa misma
 * mecánica escritas a mano, con su propio `useEffect` y su panel en absoluto.
 * Arreglar el recorte dentro de un modal en uno no arreglaba el otro.
 *
 * ── Por qué no `<input type="date">` ────────────────────────────────────────
 * Porque el que abre es el del SISTEMA OPERATIVO: su tipografía, sus colores,
 * su idioma y su semana empezando en domingo. En medio de un formulario verde
 * aparece un cuadro gris de Windows o de macOS, y el mismo formulario se ve
 * distinto en cada máquina.
 *
 * ── Las tres formas que toma ────────────────────────────────────────────────
 *
 * | Llamada | Qué sale |
 * |---|---|
 * | sin `rango` | Un campo de formulario que abre un mes |
 * | `rango` | Un control de barra que elige dos extremos |
 * | `rango atajos` | Lo anterior con la columna de periodos a la izquierda |
 */

interface Comun {
  id?: string;
}

interface Dia extends Comun {
  rango?: false;
  /** Se pinta igual pero no abre nada: es un dato que se lee, no se elige. */
  deshabilitado?: boolean;
  /** `YYYY-MM-DD`. */
  valor: string;
  onElegir: (iso: string) => void;
  requerido?: boolean;
}

interface Rango extends Comun {
  rango: true;
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  /** La columna de periodos hechos: «Este mes», «Últimos 90 días»… */
  atajos?: boolean;
}

export function SelectorDeFecha(props: Dia | Rango) {
  return props.rango ? <DeRango {...props} /> : <DeUnDia {...props} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN DÍA — un campo de formulario
   ═══════════════════════════════════════════════════════════════════════════ */

function DeUnDia({ id, valor, onElegir, requerido = false, deshabilitado = false }: Dia) {
  const enCampo = useDentroDeUnCampo();

  /*
    El valor y, a la derecha, el calendario.

    ── El calendario va al FINAL, y no hay flecha ──────────────────────────
    Antes llevaba las dos cosas: el calendario delante del valor y una flecha
    detrás. Sobraba una.

    El calendario no es informativo —no hace falta un dibujo para saber que un
    campo que dice "4 de abril de 2022" es una fecha—: es la señal de que ESTO
    ABRE UN CALENDARIO, que es justo el papel que cumple una flecha en un
    desplegable. Dos iconos para decir lo mismo, uno a cada lado.

    Así que se queda el que dice más, y se queda donde va lo que abre algo: a
    la derecha, en el mismo sitio donde el `Select` y el `Combo` ponen su
    flecha. No gira: una flecha invertida dice "esto está abierto", un
    calendario boca abajo no dice nada.
  */
  const dentro = (
    <>
      <span
        data-lleno={valor ? 'si' : 'no'}
        data-vacio={valor ? undefined : ''}
        className={cn('min-w-0 flex-1 truncate font-normal', enCampo && 'pt-4')}
      >
        {valor ? diaLargo(valor) : 'Elige una fecha'}
      </span>

      <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
    </>
  );

  /*
    El valor viaja además en un campo oculto para que el formulario lo envíe y
    `required` siga funcionando: un botón no es un campo, y sin esto el
    navegador no tendría nada que validar.
  */
  const oculto = <input type="hidden" name={id} value={valor} required={requerido} />;

  if (deshabilitado) {
    // Apagado no puede ser un botón que abre nada: se pinta igual pero sin
    // desplegable detrás, para que el foco no caiga en una trampa.
    return (
      <>
        {oculto}
        <span id={id} aria-disabled="true" className={cn(disparadorDeCampo(), 'opacity-50')}>
          {dentro}
        </span>
      </>
    );
  }

  return (
    <>
      {oculto}
      <Menu
        etiqueta="Elegir fecha"
        tipo="panel"
        alineado="izquierda"
        flotante
        anchoPropio
        // El calendario trae su propio relleno: con el del menú encima queda
        // el doble por los cuatro lados.
        sinRelleno
        ancho="w-auto"
        idDisparador={id}
        claseCaja="w-full min-w-0"
        claseDisparador={disparadorDeCampo()}
        disparador={() => dentro}
      >
        {(cerrar) => (
          <Calendario
            className="p-3"
            desde={valor || undefined}
            hasta={valor || undefined}
            onDia={(iso) => {
              onElegir(iso);
              // Un solo día no necesita confirmarse: con el segundo clic ya no
              // queda nada por decidir.
              cerrar();
            }}
          />
        )}
      </Menu>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN RANGO — un control de barra
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * ── Por qué los atajos y el calendario van juntos ───────────────────────────
 * No son dos controles distintos, son dos formas de decir lo mismo: "el mes en
 * curso" y "del 1 al 15 de septiembre" producen el mismo recorte. Separarlos
 * obligaría a buscar en qué sitio está el que uno necesita.
 */
function DeRango({ filtros, aplicar, atajos = false }: Rango) {
  const activo = PRESETS.find((p) => p.valor === filtros.preset);
  const etiqueta =
    filtros.preset === 'todo'
      ? 'Todo el histórico'
      : filtros.preset === 'personalizado'
        ? rangoLargo(filtros.from, filtros.to)
        : (activo?.etiqueta ?? 'Rango');

  return (
    <Menu
      tipo="panel"
      // Anclado a la DERECHA: el control vive al final de una barra alineada a
      // la derecha, y abriendo hacia la izquierda un panel ancho se sale de la
      // pantalla.
      alineado="derecha"
      flotante
      anchoPropio
      sinRelleno
      /*
        ── El ancho lo pone lo que hay dentro ────────────────────────────────
        Eran 34rem fijos, y desde que el calendario tiene tope —siete columnas
        de 42— sobraban: el mes quedaba flotando en medio del panel con un
        palmo de vacío a cada lado.

        En pantalla ancha el panel es una fila —atajos a la izquierda, mes a la
        derecha— y las dos piezas ya saben lo que miden, así que `w-auto` da
        exactamente eso y ni un píxel más.

        En el teléfono no vale: ahí los atajos se vuelven fichas que fluyen, y
        una caja que se ajusta a su contenido las pondría todas en una línea
        sin dejarlas envolver. Por eso debajo del corte manda una medida, que
        es la del calendario más su relleno.
      */
      ancho="w-[min(22rem,calc(100vw-2rem))] sm:w-auto"
      /*
        El disparador NO se escribe aquí: es el que `Menu` pone de serie
        —icono, etiqueta que se trunca y flecha que gira al abrir— con la
        variante de barra de herramientas. Escribirlo a mano era repetir ese
        botón por tercera vez en el proyecto, y además obligaba a poner el
        alto y el radio en la llamada, que es justo lo que la regla 2 no
        permite: esas medidas viven en `size`.

        La etiqueta dice el rango elegido, así que hace de nombre accesible
        del control: quien no ve la pantalla oye qué recorte está puesto, que
        es mejor que oír "elegir rango".
      */
      etiqueta={etiqueta}
      Icono={CalendarDays}
      variante="herramienta"
      // La etiqueta es el rango entero y tiene que poder encogerse: es el
      // único ancho a medida de toda la barra.
      claseCaja="max-w-full"
    >
      {(cerrar) => (
        <PanelDeRango filtros={filtros} aplicar={aplicar} atajos={atajos} cerrar={cerrar} />
      )}
    </Menu>
  );
}

/** Las dos fechas en orden, vengan como vengan: se puede pintar al revés. */
function ordenadas(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

interface Borrador {
  preset: Preset;
  from: string;
  to: string;
}

/** El mes que conviene mostrar al abrir: donde termina el rango. */
function mesDelBorrador(b: Borrador): MesVisible {
  // En "Todo" el rango puede llegar lejos; abrir allá no ayuda a nadie.
  return mesDeISO(b.preset === 'todo' ? new Date().toISOString().slice(0, 10) : b.to);
}

/**
 * Lo que hay dentro del panel: los atajos, el mes y el pie.
 *
 * ── Por qué es su propio componente ─────────────────────────────────────────
 * Porque se MONTA al abrir y se va al cerrar, y de ahí salen dos cosas. El
 * borrador nace fresco en cada apertura —si se canceló la vez anterior, lo que
 * quedó a medias no tiene por qué reaparecer— sin necesidad de rehacerlo a
 * mano. Y la consulta de la historia, que hace falta para saber dónde empieza
 * "Todo", solo se pide cuando alguien abre el panel: viviendo en el componente
 * de fuera se pedía en cada pantalla que tuviera un campo de fecha.
 *
 * ── Por qué hay que confirmar con Aplicar ───────────────────────────────────
 * Elegir un rango a mano son DOS clics, y entre el primero y el segundo el
 * rango está a medias. Si cada clic recargara, la pantalla se refrescaría con
 * un recorte que nadie pidió —el día suelto del primer clic— y el segundo
 * llegaría tarde. El borrador vive aquí dentro hasta que se confirma.
 */
function PanelDeRango({
  filtros,
  aplicar,
  atajos,
  cerrar,
}: {
  filtros: Filtros;
  aplicar: (cambios: Partial<Filtros>) => void;
  atajos: boolean;
  cerrar: () => void;
}) {
  const inicial: Borrador = { preset: filtros.preset, from: filtros.from, to: filtros.to };
  const [borrador, setBorrador] = useState<Borrador>(inicial);
  /** El primer clic, a la espera del segundo. `null` = no hay nada a medias. */
  const [ancla, setAncla] = useState<string | null>(null);
  const [sobrevolado, setSobrevolado] = useState<string | null>(null);
  const [vista, setVista] = useState(() => mesDelBorrador(inicial));
  const historia = useHistoria();

  function elegirPreset(preset: Preset): void {
    const siguiente: Borrador = { preset, ...rangoDe(preset, historia.data) };
    setBorrador(siguiente);
    setVista(mesDelBorrador(siguiente));
    setAncla(null);
    setSobrevolado(null);
  }

  function elegirDia(iso: string): void {
    if (ancla === null) {
      setAncla(iso);
      setSobrevolado(iso);
      return;
    }
    setBorrador({ preset: 'personalizado', ...ordenadas(ancla, iso) });
    setAncla(null);
    setSobrevolado(null);
  }

  function confirmar(): void {
    if (borrador.preset === 'personalizado') {
      aplicar({ preset: 'personalizado', from: borrador.from, to: borrador.to });
    } else {
      aplicar({ preset: borrador.preset });
    }
    cerrar();
  }

  // Mientras hay un clic a medias manda la selección en curso, no el borrador:
  // así se ve crecer el rango con el ratón antes de fijarlo.
  const pintado = ancla !== null ? ordenadas(ancla, sobrevolado ?? ancla) : borrador;
  // En "Todo" el rango va de 1970 a dentro de cinco años: pintarlo dejaría el
  // calendario entero coloreado, que no informa de nada.
  const pinta = borrador.preset !== 'todo' || ancla !== null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row">
        {/* ── Atajos ────────────────────────────────────────────────────────
            En pantalla ancha son una columna; en un teléfono se vuelven fichas
            que fluyen, porque una columna lateral dejaría el calendario en la
            mitad del ancho y sin sitio para los días. */}
        {atajos && (
          <ul
            className={cn(
              'flex flex-wrap gap-1 border-b border-border p-2',
              'sm:w-44 sm:shrink-0 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r',
            )}
          >
            {PRESETS.filter((p) => p.valor !== 'personalizado').map((p) => (
              <li key={p.valor} className="sm:w-full">
                <button
                  type="button"
                  onClick={() => elegirPreset(p.valor)}
                  aria-pressed={borrador.preset === p.valor}
                  title={p.ayuda}
                  className={cn(
                    'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                    borrador.preset === p.valor
                      ? 'bg-primary/15 font-medium text-primary'
                      : cn('text-muted-foreground', REALCE),
                  )}
                >
                  {p.etiqueta}
                </button>
              </li>
            ))}
          </ul>
        )}

        <Calendario
          className="flex-1 p-3"
          desde={pinta ? pintado.from : undefined}
          hasta={pinta ? pintado.to : undefined}
          vista={vista}
          onVista={setVista}
          onDia={elegirDia}
          onSobrevolar={(iso) => ancla && setSobrevolado(iso ?? ancla)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
        <span className="text-xs text-muted-foreground">
          {ancla !== null
            ? 'Elige la fecha final'
            : borrador.preset === 'todo'
              ? historia.data?.first
                ? `Desde ${diaLargo(historia.data.first)}`
                : 'Todo el histórico'
              : rangoLargo(borrador.from, borrador.to)}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={cerrar}>
            Cancelar
          </Button>
          <Button type="button" size="sm" onClick={confirmar} disabled={ancla !== null}>
            Aplicar
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { Preset };
