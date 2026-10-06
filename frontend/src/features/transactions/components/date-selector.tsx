import { CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { PRESETS, type Filtros } from '@/features/transactions/model/filtros';
import { longDay, longRange } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { findDate } from '@/shared/lib/read-date';
import { cn } from '@/shared/lib/utils';
import { fieldTrigger, useInsideField } from '@/shared/ui/foundations/field';
import { Calendar } from '@/shared/ui/molecules/calendar';
import { Menu } from '@/shared/ui/molecules/menu';

import { RangePanel } from './range-panel';

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

interface CommonProps {
  id?: string;
}

interface DayProps extends CommonProps {
  isRange?: false;
  /** Se pinta igual pero no abre nada: es un dato que se lee, no se elige. */
  disabled?: boolean;
  /** `YYYY-MM-DD`. */
  value: string;
  onSelect: (iso: string) => void;
  required?: boolean;
}

interface RangeProps extends CommonProps {
  isRange: true;
  filters: Filtros;
  apply: (changes: Partial<Filtros>) => void;
  /** La columna de periodos hechos: «Este mes», «Últimos 90 días»… */
  hasShortcuts?: boolean;
  /**
   * Cómo se reparte el ancho quien lo coloca.
   *
   * Es el ÚNICO control de la barra de filtros cuya etiqueta es un dato —el
   * rango elegido, entero— así que es el que tiene que quedarse con el hueco
   * que sobra cuando los demás ya midieron lo suyo.
   */
  boxClassName?: string;
}

export function DateSelector(props: DayProps | RangeProps) {
  return props.isRange ? <RangePicker {...props} /> : <DayPicker {...props} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   UN DÍA — un campo de formulario
   ═══════════════════════════════════════════════════════════════════════════ */

function DayPicker({ id, value, onSelect, required: isRequired, disabled: isDisabled }: DayProps) {
  const isInField = useInsideField();

  const { typed, setTyped, confirm } = useTypedDate(value, onSelect);

  /*
    El valor viaja además en un campo oculto para que el formulario lo envíe en
    ISO y no como se escribió: un botón no es un campo, y lo que se ve aquí es
    «19 de septiembre de 2026».
  */
  const hidden = <input type="hidden" name={id} value={value} />;

  if (isDisabled) {
    // Apagado no es un campo que se escriba ni un botón que abra nada: se
    // pinta igual pero sin nada detrás, para que el foco no caiga en una
    // trampa.
    return (
      <>
        {hidden}
        <DisabledDay value={value} isInField={isInField} />
      </>
    );
  }

  return (
    <>
      {hidden}
      {/* El foco se pinta en la CAJA y no en el campo de dentro: lo que se ve
          como un control es la caja, y un anillo alrededor del texto dejaría
          el icono fuera de lo enfocado. */}
      <div
        className={cn(
          fieldTrigger(),
          'focus-within:border-ring/60 focus-within:ring-1 focus-within:ring-ring/20',
        )}
      >
        <input
          id={id}
          type="text"
          value={typed}
          required={isRequired === true}
          // El marcador es un EJEMPLO de lo que se puede escribir, no una
          // instrucción: enseña el formato sin gastar un renglón de ayuda. Y
          // hace falta para que la etiqueta flotante sepa cuándo subir.
          placeholder={t('transactions.range.datePlaceholder')}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={confirm}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            // Sin esto, Enter envía el formulario con lo que todavía no se ha
            // interpretado.
            e.preventDefault();
            confirm();
          }}
          className={cn(
            'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground',
            isInField && 'pt-4',
          )}
        />

        <DayCalendar value={value} onSelect={onSelect} />
      </div>
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
function RangePicker({ filters, apply, hasShortcuts = false, boxClassName }: RangeProps) {
  const activeIndex = PRESETS.find((p) => p.valor === filters.preset);
  const label =
    filters.preset === 'todo'
      ? t('transactions.range.allTime')
      : filters.preset === 'personalizado'
        ? longRange(filters.from, filters.to)
        : (activeIndex?.etiqueta ?? t('transactions.range.range'));

  return (
    <Menu
      kind="panel"
      // Anclado a la DERECHA: el control vive al final de una barra alineada a
      // la derecha, y abriendo hacia la izquierda un panel ancho se sale de la
      // pantalla.
      align="right"
      isFloating
      hasOwnWidth
      isUnpadded
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
      width="calendar"
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
      label={label}
      Icon={CalendarDays}
      variant="tool"
      // La etiqueta es el rango entero y tiene que poder encogerse: es el
      // único ancho a medida de toda la barra.
      boxClassName={cn('max-w-full', boxClassName)}
    >
      {(close) => (
        <RangePanel filters={filters} apply={apply} hasShortcuts={hasShortcuts} close={close} />
      )}
    </Menu>
  );
}

/*
  El calendario ya no es el campo entero: es lo único que lo abre. Va donde va
  lo que abre algo —a la derecha, como la flecha de un desplegable— y no gira,
  porque un calendario boca abajo no dice nada.
*/
function DayCalendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  return (
    <Menu
      label={t('transactions.range.openCalendar')}
      Icon={CalendarDays}
      isIconOnly
      variant="ghost"
      kind="panel"
      align="right"
      isFloating
      hasOwnWidth
      // El calendario trae su propio relleno: con el del menú encima queda
      // el doble por los cuatro lados.
      isUnpadded
      width="content"
      boxClassName="shrink-0"
    >
      {(close) => (
        <Calendar
          className="p-3"
          from={value || undefined}
          to={value || undefined}
          onSelectDay={(iso) => {
            onSelect(iso);
            // Un solo día no necesita confirmarse: con el segundo clic ya
            // no queda nada por decidir.
            close();
          }}
        />
      )}
    </Menu>
  );
}

function DisabledDay({ value, isInField }: { value: string; isInField: boolean }) {
  return (
    <span aria-disabled="true" className={cn(fieldTrigger(), 'opacity-50')}>
      <span className={cn('min-w-0 flex-1 truncate', isInField && 'pt-4')}>
        {value ? longDay(value) : t('transactions.range.chooseDate')}
      </span>
      <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden="true" />
    </span>
  );
}

/** Lo que se teclea en el campo, y cómo se convierte en una fecha. */
function useTypedDate(value: string, onSelect: (iso: string) => void) {
  /*
    ── El campo se ESCRIBE, y el calendario es la otra puerta ────────────────
    Era un botón: la única forma de poner una fecha era abrir el mes y buscar
    el día. Para «hoy» o «ayer» está bien; para el 3 de marzo del año pasado
    son cuatro clics de flecha antes de empezar a mirar. Quien tiene el recibo
    delante ya sabe la fecha y lo más rápido es teclearla.

    Así que aquí se escribe, y lo escrito se entiende: `19 de septiembre 2026`,
    `sep 10 2026`, `10/09/2026`, `2026-09-10`. Lo hace `lib/leer-fecha`, que es
    el mismo que lee las fechas de un extracto importado —un segundo
    analizador acabaría entendiendo cosas distintas según dónde se escriba—.

    Y al salir del campo se NORMALIZA a la forma en que esta app escribe una
    fecha, para que dos movimientos registrados el mismo día no se lean
    distinto según cómo los tecleó cada quien.
  */
  const [typed, setTyped] = useState(() => (value ? longDay(value) : ''));

  // El campo sigue al valor cuando lo cambia otro: el calendario, o abrir la
  // ficha de otro movimiento sin desmontar esto.
  useOnChange([value], () => {
    setTyped(value ? longDay(value) : '');
  });

  /*
    Lo escrito se confirma al salir del campo o con Enter, no en cada tecla:
    «1» es una fecha válida mientras alguien escribe «19 de septiembre», y
    reescribir el campo debajo de los dedos es lo que hace impredecible a un
    campo de fecha.

    Si no se entiende, vuelve a lo último válido en vez de quedarse a medias.
    El valor que se guarda siempre es una fecha de verdad, y lo que no se pudo
    leer no puede parecer que sí.
  */
  function confirm(): void {
    const text = typed.trim();

    if (text === '') {
      setTyped(value ? longDay(value) : '');
      return;
    }

    const parsed = findDate(text, new Date().getFullYear());
    if (!parsed) {
      setTyped(value ? longDay(value) : '');
      return;
    }

    // Si no cambia, el efecto no se dispara y hay que normalizar aquí: quien
    // escribe «10/09/2026» sobre esa misma fecha tiene que ver cómo se queda.
    if (parsed.iso === value) setTyped(longDay(parsed.iso));
    else onSelect(parsed.iso);
  }

  return { typed, setTyped, confirm };
}
