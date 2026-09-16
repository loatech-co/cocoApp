import {
  ArrowUpRight,
  Camera,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from 'react';

import { LienzoPdf, Soltar, Soportes } from '@/components/soportes';
import { nombreDelMovimiento, rutaSeleccionada } from '@/lib/movimientos';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipIcono, type ColorDeChip } from '@/components/ui/chip-icono';
import { BLOQUE, Bloque } from '@/components/ui/bloque';
import { Campo } from '@/components/ui/campo';
import { Combo } from '@/components/ui/combo';
import { Confirmacion } from '@/components/ui/confirmacion';
import { SelectorDeFecha } from '@/components/selector-de-fecha';
import { Input } from '@/components/ui/input';
import { CabeceraDeModal, PANEL_DE_MODAL, PieDeModal } from '@/components/ui/modal-partes';
import { Progreso } from '@/components/ui/progreso';
import { REALCE, SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';
import { Textarea } from '@/components/ui/textarea';
import { ApiClientError, apiSubir } from '@/lib/api-client';
import { diaLargo, mesLargo } from '@/lib/fechas';
import {
  useActualizarMovimiento,
  useCategories,
  useCrearCategoria,
  useCrearMovimiento,
  useEliminarMovimiento,
} from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import { Camara } from './camara';
import { leerSoporte, type ProgresoDeLectura } from './leer-soporte';
import { normalizar, type Lectura } from '@coco/lectura';
import type { Category, Transaction, TransactionType } from '@coco/types';

/**
 * Lo que dura como mínimo el paso de lectura de un soporte.
 *
 * ── Por qué se espera a propósito ───────────────────────────────────────────
 * Porque la lectura no siempre tarda lo mismo: un PDF con su texto dentro se
 * resuelve en medio segundo y una foto pasa por el OCR y tarda diez. Con la
 * espera atada al trabajo, la misma acción daba dos resultados distintos —un
 * parpadeo o una espera larga— y el parpadeo es el peor de los dos: la banda
 * no alcanza a cruzar el documento, la barra salta de 0 a nada, y lo que se
 * ve es un temblor entre dos pantallas del que no queda claro si se leyó
 * algo. Con un piso, leer un soporte siempre se ve igual.
 *
 * ── Por qué cuatro segundos ─────────────────────────────────────────────────
 * La banda cruza en 1,8s (`barre`, en `index.css`). Cuatro segundos son dos
 * pasadas completas y un respiro: se ve el barrido entero, se ve que vuelve a
 * empezar —que es lo que dice «sigue trabajando»— y da tiempo a leer de qué
 * documento se trata, que es el dato que hace falta si lo que sale no cuadra.
 *
 * Y es un MÍNIMO, no una pausa que se suma: si la lectura tarda más, no se
 * espera nada.
 */
const LECTURA_MINIMA_MS = 4000;

/**
 * El ÚNICO formulario de movimiento: crea y edita.
 *
 * Tener dos —uno para registrar y otro para corregir— garantiza que se
 * separen: se añade un campo en uno y se olvida en el otro, y la persona
 * descubre que solo puede poner notas cuando edita. Un solo componente, dos
 * modos.
 *
 * ── La cascada de tres niveles ──────────────────────────────────────────────
 * Centro de costos → grupo → concepto. Se guarda el CONCEPTO, que es la hoja:
 * los dos de arriba existen para sumar, no para clasificar. Elegir uno de
 * arriba y dejarlo ahí sería un movimiento que no aparece en ningún desglose
 * por concepto.
 */
export function MovimientoModal({
  abierta,
  movimiento,
  categoriaPorDefecto,
  tipoPorDefecto = 'expense',
  onCerrar,
}: {
  abierta: boolean;
  /** Sin movimiento, el formulario crea. Con movimiento, edita ese. */
  movimiento?: Transaction | null;
  /**
   * Con qué concepto abrir al CREAR. Lo usa la tarjeta de pagos pendientes: el
   * concepto ya se sabe —es el que falta— y pedirlo otra vez sería preguntar
   * algo que uno acaba de señalar.
   */
  categoriaPorDefecto?: number;
  /** Con qué tipo abrir al CREAR. Lo elige el menú de "Nuevo movimiento". */
  tipoPorDefecto?: TransactionType;
  onCerrar: () => void;
}) {
  const categorias = useCategories();
  const crear = useCrearMovimiento();
  const actualizar = useActualizarMovimiento();
  const eliminar = useEliminarMovimiento();
  const crearCategoria = useCrearCategoria();

  const editando = Boolean(movimiento);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(hoyEnBogota());
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  /*
    ── Se abre para LEER, no para editar ────────────────────────────────────
    Abrir un movimiento es casi siempre consultarlo: ver cuánto fue, cuándo se
    pagó, mirar el recibo. Con todo editable desde el primer instante, cada
    una de esas consultas es una ocasión de cambiar algo sin querer —un clic
    en un desplegable, una tecla en el campo del valor— y de esos accidentes
    no queda rastro.

    Crear es lo contrario: no hay nada que leer, así que nace editable.
  */
  const [editable, setEditable] = useState(false);

  /*
    ── Crear un movimiento empieza por decidir CÓMO ────────────────────────
    Con un recibo en la mano, teclear el valor y la fecha es copiar a mano lo
    que está escrito en el papel. Sin recibo, esperar a tener uno para
    registrar un gasto es perder el gasto.

    Son dos caminos de verdad distintos —uno empieza por el documento, el otro
    por los datos— y preguntarlo de entrada cuesta un clic y ahorra el
    formulario entero en el caso más común.
  */
  const [paso, setPaso] = useState<'elegir' | 'camara' | 'leyendo' | 'formulario'>('formulario');
  const [progresoDeLectura, setProgresoDeLectura] = useState<ProgresoDeLectura | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  /*
    Los soportes elegidos antes de que el movimiento exista.

    Un soporte cuelga de un movimiento, y al crear todavía no hay de qué
    colgarlo. Se quedan aquí y se suben justo después de guardar: el orden
    inverso —crear el movimiento para poder adjuntar— obligaría a guardar algo
    a medias solo para tener un identificador.
  */
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  /*
    Sube cada vez que se cancela una edición.

    Está en las dependencias del efecto que llena los campos, así que
    cancelar los devuelve a lo que hay GUARDADO. Sin esto, "Cancelar" solo
    apagaba el modo de edición y dejaba en pantalla lo que se había escrito:
    la ficha decía una cosa y la base otra, y el siguiente que pulsara el
    lápiz guardaba sin querer un cambio que alguien ya había descartado.
  */
  const [descartes, setDescartes] = useState(0);

  // Cada vez que se abre se recarga desde el movimiento: sin esto, abrir para
  // editar el segundo movimiento mostraría los datos del primero.
  useEffect(() => {
    if (!abierta) return;
    setDescription(movimiento?.description ?? '');
    setAmount(movimiento ? String(Number(movimiento.amount)) : '');
    setDate(movimiento?.date ?? hoyEnBogota());
    setType(movimiento?.type ?? tipoPorDefecto);
    setCategoryId(movimiento?.category_id ?? categoriaPorDefecto);
    setNotes(movimiento?.notes ?? '');
    setError(null);
    setConfirmandoBorrado(false);
    setEditable(!movimiento);
    setPaso(movimiento ? 'formulario' : 'elegir');
    setLectura(null);
    setPendientes([]);
    setProgresoDeLectura(null);
    // El foco solo cuando hay algo que escribir: puesto en un campo de solo
    // lectura, el cursor parpadea en un sitio donde no se puede escribir.
  }, [abierta, movimiento, categoriaPorDefecto, tipoPorDefecto, descartes]);

  /*
    ── La recurrencia NO se edita aquí ─────────────────────────────────────
    Es del CONCEPTO, no del movimiento, y su sitio es Centros de costos. En un
    centro estático, además, la clasificación entera vive allá; y en uno
    dinámico un concepto nunca es recurrente —lo que se improvisa no vuelve
    solo cada mes—.

    Editable desde aquí, un formulario que uno abre para corregir una cifra
    podía cambiar de paso cada cuánto vuelve un pago, y eso reaparece semanas
    después en la tarjeta de pagos pendientes sin que nadie recuerde haberlo
    tocado.
  */

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  const arbol = categorias.data ?? [];
  const { centro, grupo, concepto } = rutaSeleccionada(arbol, categoryId);

  /*
    ── Lo que ya está en un centro estático no se mueve ──────────────────────
    Estático es estático: ni desde la tabla ni desde aquí. La estructura de
    los costos fijos se decide una vez, y si de verdad hay que cambiarla, se
    hace dinámico el centro y entonces se mueve —que es un acto deliberado,
    en otra pantalla, y no un desplegable a un clic de distancia—.

    Se mira el centro GUARDADO, no el que esté elegido en el formulario. Con
    el elegido, escoger "Costos fijos" al crear un movimiento bloqueaba los
    dos desplegables de abajo y dejaba el formulario a medias: entrar sí se
    puede, salir es lo que no.
  */
  const centroGuardado = rutaSeleccionada(arbol, movimiento?.category_id ?? undefined).centro;
  const estatico = centroGuardado?.estatico ?? false;

  /** Lo que se puede tocar ahora mismo. */
  const editandoCampos = editable;

  /**
   * Lee el recibo y rellena lo que sepa.
   *
   * Rellena, no decide: lo leído entra en los mismos campos que se escribirían
   * a mano, y la persona confirma con el mismo botón de siempre. Un recibo mal
   * leído que se guarda solo es peor que no leerlo, porque nadie vuelve a
   * mirar lo que ya quedó registrado.
   *
   * ── Por qué se espera aunque ya esté leído ────────────────────────────────
   * Ver `LECTURA_MINIMA_MS`.
   */
  async function escanear(archivo: File): Promise<void> {
    setPaso('leyendo');
    setError(null);
    setPendientes([archivo]);
    const empezo = Date.now();

    try {
      const { lectura: leida } = await leerSoporte(archivo, {
        periodo: date.slice(0, 7),
        onProgreso: setProgresoDeLectura,
      });

      setLectura(leida);
      if (leida.valor !== null) setAmount(String(leida.valor));
      if (leida.fecha) setDate(leida.fecha);
      if (leida.concepto) {
        setDescription(leida.concepto);
        // Y si ese concepto ya existe en el árbol, se deja elegido: eso es lo
        // que hace que el movimiento entre clasificado y no "sin clasificar
        // pero con un nombre que se parece".
        const suyo = conceptoLlamado(categorias.data ?? [], leida.concepto);
        if (suyo) setCategoryId(suyo.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer ese archivo.');
    } finally {
      // El piso de la espera, salga bien o mal. También cuando falla: un
      // mensaje de error que aparece de un fogonazo se lee como un fallo de
      // la ficha y no como el resultado de haber intentado leer el archivo.
      const falta = LECTURA_MINIMA_MS - (Date.now() - empezo);
      if (falta > 0) {
        await new Promise<void>((sigue) => {
          setTimeout(sigue, falta);
        });
      }

      setProgresoDeLectura(null);
      setPaso('formulario');
    }
  }

  /**
   * Crea un grupo o un concepto dentro de lo que ya está elegido, y lo elige.
   *
   * ── Por qué aquí y no en Centros de costos ──────────────────────────────
   * Porque el momento en que uno descubre que algo no existe es exactamente
   * el momento en que lo está buscando. Mandarlo a otra pantalla —y a volver,
   * y a buscar otra vez— es donde se abandona la tarea y el movimiento acaba
   * sin clasificar.
   *
   * ── Por qué no vale para los centros de costos ──────────────────────────
   * Porque un centro es la estructura de arriba y se define tres veces en la
   * vida de una cuenta. Poder inventar uno al vuelo mientras se registra un
   * gasto es como acaban las cuentas con "Casa", "casa" y "Hogar" siendo lo
   * mismo. Su combo no ofrece crear, y esto no se llama desde ahí.
   */
  async function crearDentro(nombre: string, padreId: number | undefined): Promise<void> {
    if (nombre.trim() === '' || padreId === undefined) return;
    setError(null);

    try {
      const nuevo = await crearCategoria.mutateAsync({
        name: nombre.trim(),
        kind: 'expense',
        parent_id: padreId,
      });
      setCategoryId(nuevo.id);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    const cuerpo = {
      date,
      amount: amount.replace(',', '.'),
      type,
      description: description.trim() || null,
      // El comercio sigue a la descripción: es lo que alimenta la
      // categorización automática de futuras importaciones.
      merchant: description.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId ?? null,
    };

    try {
      let id = movimiento?.id;

      if (movimiento) await actualizar.mutateAsync({ id: movimiento.id, cambios: cuerpo });
      else {
        const creado = await crear.mutateAsync(cuerpo as never);
        id = (creado as { id: number }).id;
      }

      // Los soportes, ya con un movimiento del que colgar.
      if (id !== undefined && pendientes.length > 0) {
        setSubiendo(true);
        const datos = new FormData();
        for (const archivo of pendientes) datos.append('archivos', archivo);
        await apiSubir(`/transactions/${id}/soportes`, datos);
      }

      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo guardar.');
    } finally {
      setSubiendo(false);
    }
  }

  const guardando = crear.isPending || actualizar.isPending || subiendo;

  return (
    <div
      // El velo compartido, `--velo`. Aquí hubo un `bg-carbon-950/50` que no
      // pintaba nada —`carbon` no era un color de ninguna paleta de este
      // proyecto—, así que el modal flotaba sobre la página sin velo detrás.
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--velo)] p-0 backdrop-blur-sm',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` sobre el velo, y no `onClick` en cualquier sitio.
      //
      // Con clic, un arrastre que EMPIEZA dentro del panel y termina fuera
      // —soltar el ratón un dedo más allá del borde— dispara el clic en el
      // ancestro común, que es el velo, y la ficha se cerraba con todo lo
      // escrito dentro. Aquí eso no es un caso raro: la previsualización del
      // soporte se recorre arrastrando, así que el gesto que cierra la ficha
      // es el mismo con el que se mira el recibo.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        className={cn(
          PANEL_DE_MODAL,
          SUPERFICIE_FLOTANTE,
          'emerge',
          // Más ancho: con dos columnas de campos, `max-w-lg` obligaba a que
          // cada una midiera menos que el texto que lleva dentro.
          // Más ancho desde que los soportes se ven en miniatura: con
          // `max-w-2xl` cabían dos recibos por fila y ocho quedaban en cuatro
          // renglones, que es más alto que el resto de la ficha junta.
          'rounded-t-lg sm:max-w-5xl sm:rounded-lg',
        )}
      >
        {/* La misma cabecera que las demás fichas, con el pastel de color en
            su hueco. El tipo está en el TÍTULO y en el color, no en un par de
            botones dentro del formulario: lo eligió el menú de "Nuevo
            movimiento" antes de abrir esto, así que aquí ya no es una
            pregunta —es de qué se está hablando, y el pastel lo dice antes de
            leer—. */}
        <CabeceraDeModal
          titulo={
            !editando
              ? `Nuevo ${nombreDelTipo(type)}`
              : editable
                ? `Editar ${nombreDelTipo(type)}`
                : mayuscula(nombreDelTipo(type))
          }
          antes={
            <ChipIcono
              Icono={type === 'income' ? TrendingUp : TrendingDown}
              color={type === 'income' ? 'ingreso' : 'gasto'}
              tamano="sm"
            />
          }
          acciones={
            <>
              {editando && !editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm-icon"
                  onClick={() => setEditable(true)}
                  aria-label="Editar movimiento"
                  title="Editar"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              )}

              {/*
                También en los centros estáticos, y no es una excepción a la
                regla: es que la regla nunca hablaba de esto.

                Lo que un centro estático protege es su ESTRUCTURA —qué
                conceptos existen y en qué grupo viven—, y por eso no se
                reclasifica desde aquí. Un movimiento no es estructura: es el
                registro de que tal mes salió tal plata de un concepto.
                Borrarlo borra el registro y deja el concepto donde estaba,
                igual de vivo, listo para el mes siguiente.

                Estaba condicionado a `!estatico`, así que en un centro
                estático la papelera desaparecía y quedaba un hueco al lado del
                lápiz: no se podía borrar un gasto mal anotado sin ir a hacer
                dinámico su centro, que es exactamente lo contrario de lo que
                hay que hacer.
              */}
              {editando && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm-icon"
                  onClick={() => setConfirmandoBorrado(true)}
                  aria-label="Eliminar movimiento"
                  title="Eliminar"
                  /*
                    El MISMO color y el mismo tamaño que el lápiz y la equis:
                    llevaba `text-muted-foreground` y los otros dos heredan la
                    tinta de la página, así que la papelera salía más apagada y
                    los tres iconos de una misma fila tenían dos pesos.
                    Apagar uno de tres no dice nada: dice que ese está medio
                    deshabilitado.

                    Lo que sí cambia es el HOVER, y es la única excepción:
                    borrar es lo único de esta fila que no se puede deshacer, y
                    el rojo al pasar por encima es la última señal antes de la
                    confirmación.
                  */
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </>
          }
          onCerrar={onCerrar}
        />

        {/* `min-h-0` es lo que permite que esto se encoja dentro de la columna:
            sin él mide lo que mida su contenido y se lleva por delante el alto
            máximo del panel. Y es a su vez una columna porque el panel tiene
            alto mínimo: con eso el formulario puede estirarse y llevarse sus
            botones al fondo en vez de dejarlos a media altura. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pb-6">
          {paso === 'elegir' && (
            <ComoEmpezar
              onArchivo={(a) => void escanear(a)}
              onCamara={() => setPaso('camara')}
              onAMano={() => setPaso('formulario')}
            />
          )}

          {paso === 'camara' && (
            <Camara onTomar={(a) => void escanear(a)} onCerrar={() => setPaso('elegir')} />
          )}

          {paso === 'leyendo' && (
            <Escaneando archivo={pendientes[0]} progreso={progresoDeLectura} />
          )}

          {paso === 'formulario' && (
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
              {editandoCampos ? (
                <>
                  {/*
                ── Dos columnas: el papel a un lado, los campos al otro ──────
                Nadie se sabe de memoria el valor de un recibo con sus
                decimales. Si para comprobar lo que se leyó hay que cerrar la
                ficha, abrir el archivo y volver, lo que pasa de verdad es que
                nadie comprueba nada y se guarda lo que salga.

                Con el soporte al lado, verificar es mirar a la izquierda.
              */}
                  {/* La MITAD para el papel. Con una columna angosta el recibo
                  salía del tamaño de un sello y no se podía leer la cifra, que
                  es lo único que esta columna existe para permitir. */}
                  {/*
                  ── `lg:flex-1` y `lg:auto-rows-fr` ──────────────────────────
                  Es lo que hace que la columna del soporte llegue hasta abajo,
                  y hacen falta las dos.

                  `flex-1` le da a la REJILLA el alto que sobra en el
                  formulario. Sola no sirve de nada: una rejilla reparte su alto
                  entre sus FILAS, y con `grid-auto-rows: auto` la única que hay
                  mide lo que mida su contenido, así que se queda arriba y el
                  espacio que acaba de ganar queda vacío debajo. `auto-rows-fr`
                  es lo que estira esa fila hasta el alto de la rejilla; de ahí
                  para abajo las dos columnas se estiran solas, que es lo que
                  hace una celda por defecto.

                  No puede encoger nada: la rejilla es un elemento flexible y
                  su `min-height` automático es su contenido, así que la fila
                  nunca baja de lo que miden los campos.

                  Y solo a partir de `lg`, que es donde hay DOS columnas. Por
                  debajo son dos filas apiladas, y repartir el alto entre ellas
                  daría media ficha al cuadro de soltar y media a los campos.
              */}
                  <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:grid-cols-2">
                    {/*
                  ── Sin rótulo, y estirando hasta el pie de la columna ──────
                  El rótulo decía "Soporte" encima de un cuadro punteado que ya
                  dice qué es: un sitio donde se sueltan archivos. Dos veces lo
                  mismo, y la primera gastaba un renglón del alto de la ficha.
                  Lo que hacía falta no era el título sino que el propio cuadro
                  lo dijera, y eso se arregla en su texto.

                  `h-full` sobre la columna y `flex` dentro: la rejilla ya
                  iguala el alto de las dos columnas, pero el contenido de esta
                  medía lo que medía el cuadro y dejaba medio metro de vacío
                  debajo. Estirando, el área donde se suelta es toda la columna
                  —que es además un blanco mucho más fácil de acertar con un
                  archivo agarrado—.
                */}
                    <div className="flex flex-col">
                      {movimiento ? (
                        <Soportes transactionId={movimiento.id} />
                      ) : (
                        <SoportesPendientes
                          archivos={pendientes}
                          onAñadir={(nuevos) => setPendientes((p) => [...p, ...nuevos])}
                          onQuitar={(i) => setPendientes((p) => p.filter((_, n) => n !== i))}
                        />
                      )}
                    </div>

                    {/*
                  El orden es el de la pregunta: de qué centro, de qué grupo,
                  qué concepto. Y después cuánto y cuándo, que son los dos
                  datos que se copian del papel.

                  Sin rótulo de sección: tres campos con su nombre encima no
                  necesitan que alguien anuncie que son tres campos.
                */}
                    <div className="flex flex-col gap-3">
                      {/*
                        El aviso de lo que se leyó, DENTRO de la columna de
                        campos.

                        Estaba encima de la rejilla, a todo el ancho, y lo que
                        dice —«verifica esto antes de guardar»— no tiene nada
                        que ver con el recibo de la izquierda: habla de los
                        campos de la derecha, que son los que se rellenaron
                        solos. Encabezando su columna, es el rótulo de lo que
                        hay debajo; cruzando la ficha entera, era un cartel.
                      */}
                      {lectura && <LoQueLei />}

                      {/*
                    Los tres se bloquean si el centro GUARDADO es estático.

                    Esta regla estaba y se perdió al rediseñar la ficha: los
                    desplegables pasaron a bloquearse solo por dependencia
                    —«elige antes un centro»— y el estático dejó de contar, así
                    que un movimiento de Costos fijos se podía reclasificar
                    desde aquí aunque la tabla no lo permitiera. La misma plata
                    se movía o no según por dónde se entrara.

                    Lo que protege un centro estático es su estructura. Borrar
                    el movimiento sí se puede —eso es el registro, no la
                    estructura—; moverlo de concepto, no.
                  */}
                      <Campo etiqueta="Centro de costos" id="mov-centro">
                        <Combo
                          id="mov-centro"
                          etiqueta="Centro de costos"
                          valor={centro ? String(centro.id) : ''}
                          opciones={arbol.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
                          deshabilitado={estatico}
                          onCambiar={(v) => setCategoryId(v === '' ? undefined : Number(v))}
                        />
                      </Campo>

                      <Campo etiqueta="Grupo" id="mov-grupo">
                        <Combo
                          id="mov-grupo"
                          etiqueta="Grupo"
                          valor={grupo ? String(grupo.id) : ''}
                          opciones={(centro?.children ?? []).map((g) => ({
                            valor: String(g.id),
                            etiqueta: g.name,
                          }))}
                          deshabilitado={estatico || !centro}
                          vacio={centro ? 'Sin elegir' : 'Elige antes un centro de costos'}
                          creando={crearCategoria.isPending}
                          onCambiar={(v) => setCategoryId(v === '' ? centro?.id : Number(v))}
                          onCrear={(nombre) => void crearDentro(nombre, centro?.id)}
                        />
                      </Campo>

                      <Campo etiqueta="Concepto" id="mov-concepto">
                        <Combo
                          id="mov-concepto"
                          etiqueta="Concepto"
                          valor={concepto ? String(concepto.id) : ''}
                          opciones={(grupo?.children ?? []).map((c) => ({
                            valor: String(c.id),
                            etiqueta: c.name,
                          }))}
                          deshabilitado={estatico || !grupo}
                          vacio={grupo ? 'Sin elegir' : 'Elige antes un grupo'}
                          creando={crearCategoria.isPending}
                          onCambiar={(v) => setCategoryId(v === '' ? grupo?.id : Number(v))}
                          onCrear={(nombre) => void crearDentro(nombre, grupo?.id)}
                        />
                      </Campo>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo etiqueta="Valor" id="mov-valor">
                          <Input
                            id="mov-valor"
                            // `inputMode` numérico abre el teclado de números en el
                            // teléfono; `type=number` traería flechitas y rechazaría
                            // la coma decimal que se usa en Colombia.
                            inputMode="decimal"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0"
                            required
                          />
                        </Campo>

                        <Campo etiqueta="Fecha" id="mov-fecha">
                          <SelectorDeFecha
                            id="mov-fecha"
                            valor={date}
                            onElegir={setDate}
                            requerido
                          />
                        </Campo>
                      </div>

                      {/*
                        Las notas, dentro de la columna de campos y pegadas a
                        los demás.

                        Estaban debajo de la rejilla y a todo el ancho: un
                        recuadro de mil píxeles para tres renglones que casi
                        nunca se escriben, pegado encima de los botones y con
                        media ficha vacía a su lado.

                        Y sin `mt-auto`, que las mandaba al fondo de la columna
                        para cerrarla a la altura del soporte. Eso las separaba
                        de los campos con un palmo de nada en medio, y una nota
                        sobre este movimiento es un campo más de los que se
                        rellenan al registrarlo: va donde va el siguiente, no
                        donde sobra sitio. Que la columna cierre antes que la
                        del soporte no es un desajuste —son dos cosas de largo
                        distinto—.
                      */}
                      <Campo etiqueta="Notas" id="mov-notas">
                        {/* Sin marcador. Decía «Opcional», que no es un ejemplo
                        de lo que va ahí sino una nota sobre la validación: este
                        campo no lleva `required`, y eso ya se sabe porque el
                        formulario se envía sin él. Un marcador que explica una
                        regla en vez de enseñar un ejemplo es un renglón
                        gastado. */}
                        <Textarea
                          id="mov-notas"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                        />
                      </Campo>
                    </div>
                  </div>
                </>
              ) : (
                <VistaDeLectura
                  tipo={type}
                  // El nombre sale del concepto, igual que en la tabla. Leía
                  // `description`, que en un movimiento registrado a mano está
                  // vacío desde que la ficha cambió su campo libre por un selector.
                  nombre={movimiento ? nombreDelMovimiento(movimiento, arbol) : ''}
                  valor={amount}
                  fecha={date}
                  periodo={movimiento?.period}
                  ruta={[centro?.name, grupo?.name, concepto?.name].filter(Boolean) as string[]}
                />
              )}

              {/*
            Los soportes, solo al EDITAR.

            Un movimiento que todavía no existe no puede tener recibos colgando
            de él, y enseñar la sección vacía al crear promete un sitio donde
            soltar un archivo que aquí no existe.

            Van al final y no arriba: quien abre un movimiento viene casi
            siempre a corregir una cifra o una fecha. El recibo es la prueba, y
            la prueba se consulta, no se edita.
          */}
              {/* Solo al LEER: editando, el soporte vive en la columna de la
              izquierda, al lado de los campos que sirve para comprobar. */}
              {!editandoCampos && movimiento && (
                <Seccion titulo="Soportes" caja={false} crece>
                  <Soportes transactionId={movimiento.id} />
                </Seccion>
              )}

              {/* Las notas, DESPUÉS de los soportes. El recibo es la prueba de lo
              que pasó; la nota es el comentario de alguien sobre eso. Primero
              el hecho, luego lo que se dijo de él. */}
              {!editandoCampos && notes.trim() !== '' && (
                <Seccion titulo="Notas">
                  {/* `whitespace-pre-line`: las notas se escriben con saltos de
                  línea y aplanarlas convierte una lista en un párrafo. */}
                  <p className="whitespace-pre-line text-sm">{notes}</p>
                </Seccion>
              )}

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Leyendo no hay pie: no hay nada que cancelar ni que guardar, y
              para salir ya está la equis de la esquina. Un botón "Cerrar"
              debajo de todo es una segunda puerta a la misma salida. */}
              {editandoCampos && (
                <PieDeModal>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!editando) return onCerrar();
                      setDescartes((n) => n + 1);
                      setEditable(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={guardando}>
                    {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {editando ? 'Guardar' : 'Registrar'}
                  </Button>
                </PieDeModal>
              )}
            </form>
          )}

          <Confirmacion
            abierta={confirmandoBorrado}
            titulo="¿Eliminar este movimiento?"
            peligrosa
            etiquetaConfirmar="Eliminar"
            ocupada={eliminar.isPending}
            onCancelar={() => setConfirmandoBorrado(false)}
            onConfirmar={() =>
              movimiento &&
              eliminar.mutate(movimiento.id, {
                onSuccess: () => {
                  setConfirmandoBorrado(false);
                  onCerrar();
                },
              })
            }
          >
            {/*
            Se dice lo que NO se borra, y no es un detalle: el nombre de este
            movimiento es el de su concepto, así que la papelera parece estar
            apuntando al concepto. No lo está. Sin esta frase, nadie borra un
            gasto mal anotado por miedo a llevarse «Aseo» por delante.
          */}
            Se borra el registro de este mes y no se puede deshacer; sus soportes se van con él. El
            concepto “{concepto?.name ?? grupo?.name ?? 'al que pertenece'}” no se toca: sigue en
            Centros de costos, que es el único sitio donde se edita o se elimina.
          </Confirmacion>
        </div>
      </div>
    </div>
  );
}

function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `expense` → "gasto". El tipo, dicho como se dice. */
function nombreDelTipo(tipo: TransactionType): string {
  return tipo === 'income' ? 'ingreso' : 'gasto';
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El movimiento cuando solo se está mirando.
 *
 * ── Por qué no son los mismos campos, apagados ──────────────────────────────
 * Porque un campo apagado sigue siendo un campo: tiene su marco, su etiqueta
 * encima y su altura de control, y ocupa el sitio de una caja donde se podría
 * escribir aunque no se pueda. Ocho de esos, uno debajo de otro, son un
 * formulario que no deja rellenarse —que se lee como una avería— cuando lo
 * que uno viene a hacer es LEER un dato: cuánto fue, cuándo, de qué.
 *
 * ── De dónde sale la jerarquía ──────────────────────────────────────────────
 * De que no todo pese igual. La cifra manda: va grande, en su color y sobre un
 * tinte del pastel que ya marca el tipo en el resumen. Debajo, sus dos datos
 * inseparables —de qué es y cuándo se pagó— en la misma caja, porque se leen
 * juntos. Y después secciones con su nombre encima, cada una respondiendo una
 * pregunta distinta. Una ficha donde todo es del mismo tamaño y del mismo gris
 * obliga a leerla entera para encontrar lo que se venía a mirar.
 */
function VistaDeLectura({
  tipo,
  nombre,
  valor,
  fecha,
  periodo,
  ruta,
}: {
  tipo: TransactionType;
  nombre: string;
  valor: string;
  fecha: string;
  /** `YYYY-MM-DD` del día 1 del mes al que PERTENECE el gasto. */
  periodo?: string;
  ruta: string[];
}) {
  // El periodo solo se nombra cuando NO es el mes del pago. Repetir
  // "septiembre" dos veces seguidas no informa; decirlo cuando la factura de
  // agosto se pagó en septiembre, sí —es lo que descuadra los totales de quien
  // no lo nota—.
  const mesDelPago = fecha.slice(0, 7);
  const desfasado = Boolean(periodo) && periodo!.slice(0, 7) !== mesDelPago;

  return (
    <div className="flex flex-col gap-5">
      {/*
        Partido en dos: arriba CUÁNTO, abajo de qué.

        Juntos en una sola caja, la cifra tenía cuatro líneas pegadas debajo y
        el bloque se leía como un párrafo que empieza con un número grande. La
        línea los separa en dos registros: el dato que se viene a ver, y el
        contexto que lo explica. Y deja a la cifra sola en su mitad, que es lo
        que la hace mandar sin tener que agrandarla más.

        Y es una TARJETA de verdad, no un velo negro al 5 %.

        Desde que el modal es del color del fondo, un tinte sobre él no se
        levanta de nada: quedaba una mancha apenas más oscura. `Card` es la
        superficie que la aplicación ya usa para "esto es una cosa" —en el
        resumen, en los centros de costos— y aquí dice lo mismo: el movimiento
        es un objeto, y lo de abajo son sus anexos.
      */}
      <Card className="overflow-hidden">
        <div className="px-4 py-5">
          {/*
            SIN `tabular`.

            Las cifras tabulares tienen todas el mismo ancho para que las
            columnas de una tabla alineen por dígito. Aquí no hay columna, hay
            un número solo y grande, y ese ancho fijo separa los dígitos como
            si alguien le hubiera metido interletraje.
          */}
          {/*
            Una flecha, no un signo.

            El menos delante de una cifra es una convención de TABLA: ahí hay
            una columna con gastos e ingresos mezclados y el signo los separa
            sin gastar sitio. Aquí no hay columna ni nada con qué confundirlo
            —la ficha entera es un gasto, y lo dice el título— así que el menos
            solo aporta un guion pegado al número.

            La flecha dice lo mismo mejor: sube y sale, baja y entra. Y al
            mismo peso que la cifra, para que se lea como parte de ella y no
            como un adorno al lado.
          */}
          <p className="flex items-center gap-2 font-display text-4xl font-bold leading-none text-acento-tinta sm:text-5xl">
            <ArrowUpRight
              className={cn('size-8 shrink-0 sm:size-10', tipo === 'income' && 'rotate-180')}
              strokeWidth={2.75}
              aria-hidden="true"
            />
            {formatCOP(valor || '0')}
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          <p className="truncate text-base font-medium">{nombre || 'Sin concepto'}</p>

          {/* El camino, sin etiqueta y sin fichas. Con fichas parecían
              pestañas —algo que se pulsa y cambia lo de abajo— y aquí no se
              pulsa nada: es dónde vive este movimiento, que se lee como una
              ruta. */}
          {ruta.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {ruta.map((nombre, i) => (
                <span key={nombre} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">›</span>}
                  <span className={cn(i === ruta.length - 1 && 'font-medium text-foreground')}>
                    {nombre}
                  </span>
                </span>
              ))}
            </p>
          )}

          <p className="mt-1 text-xs text-muted-foreground">Pagado el {diaLargo(fecha)}</p>

          {desfasado && (
            <p className="text-xs font-medium text-warning">
              Pertenece a {mesLargo(periodo!.slice(0, 7))}
            </p>
          )}
        </div>
      </Card>

      {ruta.length === 0 && (
        <p className="text-sm text-muted-foreground">Este movimiento está sin clasificar.</p>
      )}
    </div>
  );
}

/**
 * Una parte de la ficha, con su nombre ENCIMA y no sobre el borde.
 *
 * Antes eran `<fieldset>` con `<legend>`, y un `legend` lo dibuja el navegador
 * montado sobre la línea del borde: el texto partía la caja por arriba y se
 * comía un trozo de lo primero que hubiera dentro. El nombre va fuera, que
 * además es lo que crea la jerarquía —etiqueta pequeña, contenido debajo—.
 */
function Seccion({
  titulo,
  caja = true,
  crece = false,
  children,
}: {
  titulo: string;
  /** Con `false`, el contenido va suelto: lo que ya son tarjetas no necesita otra. */
  caja?: boolean;
  /**
   * Se come el alto que sobre en la ficha.
   *
   * Lo pide la de soportes, y solo ella. La ficha tiene alto mínimo, así que
   * al leer un movimiento con pocos campos sobra sitio, y el pie se lo lleva
   * al fondo con su `mt-auto`: el hueco quedaba entre el cuadro de soltar y
   * los botones. Un cuadro donde se sueltan archivos es además el único
   * elemento de la ficha al que el tamaño le sirve de algo —es el blanco que
   * hay que acertar con un archivo agarrado—, así que ese hueco es suyo.
   */
  crece?: boolean;
  children: ReactNode;
}) {
  return (
    // `gap-3` y no `gap-2`: con ocho pulgadas de miniaturas debajo, dos
    // píxeles menos hacían que el rótulo pareciera pegado a la primera fila,
    // casi montado encima —que es justo lo que se acaba de arreglar quitando
    // los `legend`—.
    <section className={cn('flex flex-col gap-3', crece && 'min-h-0 flex-1')}>
      {/*
        Sin mayúsculas sostenidas.

        Una palabra en versalitas pierde la silueta que la hace reconocible
        —"Soporte" y "SOPORTE" no se leen igual de rápido— y dentro de una
        ficha, donde todo el texto es corto, ese rótulo gritando compite con lo
        que titula. El tamaño y el gris ya dicen que es un rótulo.
      */}
      <h3 className="text-xs font-semibold text-muted-foreground">{titulo}</h3>
      {caja ? <Bloque className="flex flex-col gap-3">{children}</Bloque> : children}
    </section>
  );
}

/**
 * Busca un concepto por su nombre en el árbol.
 *
 * Sin distinguir mayúsculas ni tildes: lo que devuelve el clasificador viene
 * de una tabla de firmas escrita a mano, y lo que hay en el árbol lo escribió
 * una persona. "Celsia (Energia)" y "Celsia (Energía)" son el mismo concepto y
 * no hay ninguna razón para que un acento los separe.
 */
function conceptoLlamado(arbol: Category[], nombre: string): Category | undefined {
  const buscado = normalizar(nombre);

  for (const centro of arbol) {
    for (const grupo of centro.children ?? []) {
      for (const concepto of grupo.children ?? []) {
        if (normalizar(concepto.name) === buscado) return concepto;
      }
    }
  }
  return undefined;
}

/**
 * Las dos formas de empezar un movimiento.
 *
 * ── Por qué se pregunta en vez de deducirlo ─────────────────────────────────
 * Porque son dos actos distintos, no dos caminos al mismo sitio. Con el
 * soporte a mano, teclear el valor y la fecha es copiar lo que ya está escrito
 * en el papel —y equivocarse en un dígito—. Sin soporte, esperar a tener uno
 * para registrar el gasto es perder el gasto.
 *
 * ── Por qué la fila entera es el disparador ─────────────────────────────────
 * Porque la fila ES la opción. Con el clic solo en un botón pequeño al final,
 * el resto —el icono, el título, la explicación— se ve pulsable y no lo es, y
 * cada intento fallido enseña a desconfiar del resto de la pantalla.
 *
 * La vía de escanear es la excepción: lleva dos acciones distintas dentro, y
 * una fila no puede hacer dos cosas.
 */
function ComoEmpezar({
  onArchivo,
  onCamara,
  onAMano,
}: {
  onArchivo: (archivo: File) => void;
  onCamara: () => void;
  onAMano: () => void;
}) {
  const campo = useRef<HTMLInputElement>(null);

  return (
    /*
      ── TRES opciones, una al lado de la otra ─────────────────────────────
      Eran dos filas apiladas, y la primera contenía dos botones dentro: una
      caja que no se podía pulsar con dos pastillas pequeñas debajo de su
      explicación, y debajo una fila que sí se pulsaba entera. Tres cosas que
      se pueden hacer, presentadas de dos maneras distintas y en dos niveles
      —la jerarquía decía que la cámara y el archivo eran subopciones de algo,
      cuando en realidad son hermanas de registrar a mano—.

      Ahora son tres columnas iguales y los tres son el mismo objeto: una
      baldosa que se pulsa entera. Se comparan de un vistazo, que es lo que se
      viene a hacer aquí, y el blanco de cada una es toda la baldosa.

      En un teléfono se apilan: tres columnas en 375px dejan cada título
      partido en tres renglones.
    */
    <div className="grid gap-3 sm:grid-cols-3">
      <Via
        Icono={Camera}
        color="gasto"
        titulo="Tomar una foto"
        ayuda="Se leen el valor, la fecha y el concepto."
        onClick={onCamara}
      />

      <Via
        Icono={Upload}
        color="gasto"
        titulo="Subir un archivo"
        ayuda="Un PDF o una imagen del soporte."
        onClick={() => campo.current?.click()}
      />

      <Via
        Icono={Pencil}
        color="presupuesto"
        titulo="Registrar manualmente"
        ayuda="Sin soporte, o cuando ya sabes cómo clasificarlo."
        onClick={onAMano}
      />

      <input
        ref={campo}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="hidden"
        onChange={(e) => {
          const a = e.target.files?.[0];
          e.target.value = '';
          if (a) onArchivo(a);
        }}
      />
    </div>
  );
}

/**
 * Una de las tres vías.
 *
 * ── Por qué es una baldosa y no una fila ────────────────────────────────────
 * Porque las tres se comparan entre sí, y lo que se compara se pone al lado,
 * no debajo: en columna hay que leer las tres explicaciones en orden para
 * saber cuál es la que se quiere. Una al lado de otra se ven de un vistazo.
 *
 * ── Y siempre se pulsa ENTERA ───────────────────────────────────────────────
 * Antes había dos formas —con `onClick` la fila era un botón; sin él, una caja
 * que contenía botones más pequeños—, y eso hacía que la cámara y el archivo
 * parecieran subopciones de «escanear» cuando en realidad son hermanas de
 * registrar a mano. Con una sola forma, el blanco de cada opción es toda su
 * baldosa, que es lo que se acierta con el dedo.
 *
 * El contenido va en COLUMNA: el pastel arriba y el texto debajo. De lado, en
 * un tercio del ancho del modal, el texto se queda con setenta píxeles y el
 * título se parte.
 */
function Via({
  Icono,
  color,
  titulo,
  ayuda,
  onClick,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: ColorDeChip;
  titulo: string;
  ayuda: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Al pasar por encima se tiñe el borde y se llena con `accent`, que es
      // la superficie de lo que responde en toda la app. Antes era `muted`, y
      // dentro de un modal `muted` y `popover` se llevan un escalón de nada en
      // oscuro: había que marcar además el borde en `primary` —a plena tinta,
      // más fuerte que la fila entera— para que se notara algo.
      className={cn(
        BLOQUE,
        'flex h-full w-full flex-col items-start gap-3 p-4 text-left',
        'transition-colors hover:border-ring/40',
        REALCE,
      )}
    >
      <ChipIcono Icono={Icono} color={color} tamano="sm" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{ayuda}</span>
      </span>
    </button>
  );
}

/**
 * El aviso de que hay datos leídos por la máquina.
 *
 * ── Por qué el acento y no el ámbar ─────────────────────────────────────────
 * Porque no ha pasado nada malo. El ámbar de esta app está para lo que está
 * PENDIENTE —un pago que vence, un movimiento sin clasificar— y un naranja
 * intenso encima de un formulario que acaba de rellenarse solo se lee como un
 * error, cuando lo que hubo fue un acierto. El acento llama sin alarmar.
 *
 * ── La única cosa quieta que usa `accent` ───────────────────────────────────
 * En el resto de la app `accent` es la superficie de lo que RESPONDE: la
 * opción bajo el cursor, la fila señalada, el botón encendido. Este aviso no
 * responde a nada y aun así lo usa, a propósito: es lo más parecido que tiene
 * este tema a un realce que llame sin alarmar, y ponerlo en `info` —que es lo
 * que le tocaría por tono— lo dejaría igual que cualquier otra nota, cuando
 * este es el único sitio donde la aplicación pide que se revise lo que ella
 * misma acaba de escribir.
 *
 * Con el token, el contraste lo garantiza el tema: verde muy claro sobre casi
 * blanco, verde muy oscuro con letra menta sobre casi negro.
 *
 * ── Por qué una sola frase ──────────────────────────────────────────────────
 * Porque el detalle de por qué se clasificó así no cambia lo que hay que
 * hacer, que es mirar los campos. Contarlo entero ocupaba tres renglones y
 * empujaba hacia abajo justo lo que se pedía revisar.
 */
/**
 * El documento, con una banda de luz cruzándolo mientras se lee.
 *
 * ── Por qué se enseña el documento y no un girador ─────────────────────────
 * Porque un girador dice «espera» y nada más: es el mismo dibujo para cargar
 * una lista, guardar un formulario o leer un recibo. Aquí está pasando algo
 * concreto y que se puede enseñar —una máquina está mirando ESE papel—, y
 * enseñarlo hace dos cosas que el girador no: se entiende que la espera tiene
 * un motivo, y se ve qué documento se está leyendo, que es justo el dato que
 * hace falta si lo que sale no cuadra.
 *
 * ── Por qué el `blob:` se crea y se suelta aquí ────────────────────────────
 * Porque vive exactamente lo que dura este paso. Creado más arriba habría que
 * acordarse de soltarlo en cada una de las salidas —se leyó bien, falló, se
 * cerró la ficha— y el que se olvide se queda en la memoria de la pestaña con
 * el archivo entero dentro.
 */
function Escaneando({
  archivo,
  progreso,
}: {
  archivo: File | undefined;
  progreso: ProgresoDeLectura | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!archivo) return;
    const creado = URL.createObjectURL(archivo);
    setUrl(creado);
    return () => {
      URL.revokeObjectURL(creado);
      setUrl(null);
    };
  }, [archivo]);

  const esImagen = archivo?.type.startsWith('image/') ?? false;
  const etapa = progreso?.etapa ?? 'Leyendo el soporte…';

  return (
    <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
      {/*
        El cristal del escáner: el documento dentro, recortado, y las dos capas
        del barrido encima. `overflow-hidden` es lo que mantiene la banda
        dentro del marco, y `select-none` evita que un arrastre sobre él
        seleccione media ficha.
      */}
      <div
        className={cn(
          'relative w-full max-w-sm select-none overflow-hidden rounded-lg',
          'border border-border bg-card',
          // Una hoja es más alta que ancha. Fijando la proporción, el marco no
          // cambia de tamaño cuando la imagen acaba de cargar.
          'aspect-[3/4]',
        )}
      >
        {url === null ? null : esImagen ? (
          // `object-top`: lo que hace falta ver de un recibo está arriba —el
          // comercio, la fecha—, no en su centro geométrico.
          <img src={url} alt="" className="size-full object-cover object-top opacity-80" />
        ) : (
          <div className="grid size-full place-items-center overflow-hidden">
            <LienzoPdf url={url} />
          </div>
        )}

        {/*
          El rastro: lo ya barrido queda un poco más claro que lo que falta.
          Sin esto la banda parece un reflejo suelto pasando por encima; con
          él, parece que va dejando el trabajo hecho detrás.
        */}
        <span
          aria-hidden="true"
          className="deja-rastro pointer-events-none absolute inset-0 bg-accent/25"
        />

        {/* La banda, con su canto de avance brillante. */}
        <span
          aria-hidden="true"
          className={cn(
            'barre pointer-events-none absolute inset-y-0 left-0 w-1/4',
            'bg-gradient-to-r from-transparent via-acento-tinta/30 to-transparent',
          )}
        >
          <span className="absolute inset-y-0 right-0 w-px bg-acento-tinta shadow-[0_0_12px_2px_var(--acento-tinta)]" />
        </span>
      </div>

      <p className="text-sm font-medium">{etapa}</p>

      {/* El OCR de un escaneo tarda segundos y sin barra parece colgado. La
          barra es la compartida: esta medía 4px de alto y 192 de ancho y la de
          la importación 8px y todo el ancho, siendo la misma espera del mismo
          trabajo. */}
      <Progreso avance={progreso?.avance ?? 0} etiqueta={etapa} className="w-full max-w-sm" />

      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Todo ocurre en este dispositivo: el documento no se sube a ninguna parte.
      </p>
    </div>
  );
}

function LoQueLei() {
  return (
    /*
      ── `min-h-16`: la mitad más alto ─────────────────────────────────────────
      Medía lo que su renglón y su relleno, 44px, y con eso era una tira que la
      vista se salta para ir a los campos. Es lo primero que hay que leer de
      esta columna —dice que lo de abajo lo escribió una máquina y hay que
      comprobarlo—, así que tiene que pesar como algo y no como un borde.

      Y es un MÍNIMO y no un relleno mayor porque en una columna de la mitad de
      ancho la frase cae en dos renglones, y dos renglones con el relleno de
      arriba y abajo miden exactamente estos 64: el aviso se ve igual quepa la
      frase de una o de dos, en vez de dar un salto al cambiar el ancho.
    */
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground">
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      Los datos se extrajeron del soporte. Conviene verificarlos antes de guardar.
    </p>
  );
}

/**
 * Los soportes elegidos antes de que el movimiento exista.
 *
 * ── Por qué una galería y no una lista ──────────────────────────────────────
 * Porque con varios recibos lo que uno hace es pasar de uno a otro, y el
 * nombre del archivo no dice cuál es cuál: `IMG_4821.HEIC` y `scan0007.pdf`
 * son indistinguibles hasta que se abren. Una fila de miniaturas se reconoce
 * mirando, y el que se está viendo va marcado.
 *
 * ── Por qué los `blob:` viven aquí ──────────────────────────────────────────
 * Porque los mira la previsualización grande Y su miniatura: creados en cada
 * uno, el mismo archivo se cargaría dos veces en memoria. Aquí se crean una
 * vez y se sueltan juntos.
 */
function SoportesPendientes({
  archivos,
  onAñadir,
  onQuitar,
}: {
  archivos: File[];
  onAñadir: (archivos: File[]) => void;
  onQuitar: (indice: number) => void;
}) {
  const [activo, setActivo] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const creados = archivos.map((a) => URL.createObjectURL(a));
    setUrls(creados);
    // Cada blob vive en la memoria de la pestaña hasta que se le suelta.
    return () => {
      for (const u of creados) URL.revokeObjectURL(u);
    };
  }, [archivos]);

  // El que se está viendo, recortado: quitar el último dejaba el índice
  // apuntando a un archivo que ya no existe.
  const i = Math.min(activo, archivos.length - 1);
  // Sin nada todavía, el cuadro de soltar es lo único que hay y le toca todo
  // el alto. En cuanto hay un archivo, el alto se lo lleva la
  // previsualización y la fila de miniaturas mide lo que mide.
  const vacio = archivos.length === 0;

  return (
    <div className={cn('flex flex-col gap-3', vacio && 'min-h-0 flex-1')}>
      {i >= 0 && urls[i] && (
        <PreviaDeArchivo
          key={urls[i]}
          url={urls[i]}
          esImagen={archivos[i].type.startsWith('image/')}
        />
      )}

      <ul className={cn('flex flex-wrap gap-2', vacio && 'min-h-0 flex-1')}>
        {archivos.map((archivo, n) => (
          <li key={`${archivo.name}-${n}`}>
            <Tile
              url={urls[n]}
              esImagen={archivo.type.startsWith('image/')}
              nombre={archivo.name}
              activo={n === i}
              onVer={() => setActivo(n)}
              onQuitar={() => {
                onQuitar(n);
                // Si se va el que estaba puesto, se pasa al anterior.
                if (n <= i) setActivo(Math.max(0, i - 1));
              }}
            />
          </li>
        ))}

        {/* El MISMO cuadro que en un movimiento ya guardado: vacío ocupa el
            ancho y explica qué acepta; con algo dentro es una plaza más de la
            galería. Dos versiones del mismo hueco se separarían. */}
        {/* `self-stretch` y no `h-full`: el porqué, en `soportes.tsx`. */}
        <li className={cn(vacio && 'flex w-full self-stretch')}>
          <Soltar
            subiendo={false}
            progreso={0}
            solo={vacio}
            onArchivos={(lista) => onAñadir(Array.from(lista ?? []))}
          />
        </li>
      </ul>
    </div>
  );
}

/**
 * Una plaza de la galería.
 *
 * ── La papelera se enseña como el ojo del otro modal ────────────────────────
 * Un velo sobre la plaza entera con el icono en el centro, solo al pasar por
 * encima. Es el lenguaje que ya usa la galería de un movimiento guardado, y
 * repetirlo significa que una miniatura oscurecida quiere decir lo mismo en
 * los dos sitios: "aquí hay algo que hacer con esto".
 *
 * Una pastilla flotando en la esquina no decía eso: parecía un adorno del
 * recorte, y ocho de ellas encendidas a la vez son ocho invitaciones a borrar
 * algo sin querer.
 *
 * ── Por qué la papelera y no el ojo ─────────────────────────────────────────
 * Porque mirar ya se hace pulsando la plaza —y lo que se mira aparece al lado,
 * en grande—. Lo que no tenía sitio era descartar.
 */
function Tile({
  url,
  esImagen,
  nombre,
  activo,
  onVer,
  onQuitar,
}: {
  url: string | undefined;
  esImagen: boolean;
  nombre: string;
  activo: boolean;
  onVer: () => void;
  onQuitar: () => void;
}) {
  return (
    <div
      className={cn(
        /*
          La MISMA caja que el cuadro de añadir, que es su vecino en la fila:
          104px y el radio estándar.

          Y con BORDE de 2px, no con anillo. Los dos tenían el mismo radio
          nominal, pero un anillo se dibuja por FUERA del borde de la caja: la
          curva quedaba un píxel más abierta que la del cuadro punteado de al
          lado, y en dos plazas pegadas eso se ve. Con la misma anchura de
          trazo, la geometría es idéntica.
        */
        'group relative size-[104px] overflow-hidden rounded-lg border-2 bg-card transition-colors',
        activo ? 'border-acento-tinta' : 'border-border hover:border-muted-foreground',
      )}
    >
      {/* La plaza entera elige qué se previsualiza. */}
      <button
        type="button"
        onClick={onVer}
        title={nombre}
        aria-label={`Ver ${nombre}`}
        aria-pressed={activo}
        className="absolute inset-0 flex items-center justify-center"
      >
        {!url ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : esImagen ? (
          <img src={url} alt="" className="size-full object-cover object-top" />
        ) : (
          <LienzoPdf url={url} />
        )}
      </button>

      {/* El velo no intercepta el puntero: pulsar la plaza sigue eligiéndola,
          y solo la papelera de encima descarta. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-sala/55 opacity-0 transition-opacity group-hover:opacity-100"
      />

      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${nombre}`}
        title="Quitar este soporte"
        className={cn(
          'absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full',
          'text-sala-tinta opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive',
        )}
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * El soporte en grande, recorrible.
 *
 * ── Por qué llena la caja y no entra entera ─────────────────────────────────
 * Porque una hoja completa metida en 30rem de alto deja la letra a un tamaño
 * en el que el total no se lee, y esta columna existe exactamente para leer el
 * total. Llenando la caja, el documento se ve al tamaño en que se puede
 * comprobar, y lo que no cabe se alcanza arrastrando.
 *
 * ── Por qué arrastrar y no barras de desplazamiento ─────────────────────────
 * Porque es un documento, no una página: el gesto con el que todo el mundo
 * mueve un plano o un mapa es agarrarlo. Y con `pointer`, el mismo código
 * sirve para el ratón, el dedo y el lápiz.
 *
 * ── Los topes ───────────────────────────────────────────────────────────────
 * El desplazamiento se recorta a lo que falta por ver, así que nunca aparece
 * un hueco: el borde del documento no pasa del borde de la caja. Y si por el
 * lado corto el documento cabe justo, ese eje no se mueve —en vez de temblar
 * un píxel en cada arrastre—.
 */
function PreviaDeArchivo({ url, esImagen }: { url: string; esImagen: boolean }) {
  /** El tamaño natural de lo dibujado, para saber cuánto sobra por cada lado. */
  const [natural, setNatural] = useState<{ ancho: number; alto: number } | null>(null);
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  /*
    El zoom multiplica la escala que ya LLENA la caja, así que el 100 % es el
    documento cubriendo el marco y no su tamaño natural.

    No baja del 100 % a propósito: por debajo aparecerían franjas vacías a los
    lados, y una previsualización con huecos se lee como un error de montaje.
    Para ver la hoja entera está el pase a pantalla completa del movimiento ya
    guardado.
  */
  const [zoom, setZoom] = useState(0);

  const marco = useRef<HTMLDivElement>(null);
  const agarre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // La caja cambia de tamaño con la ventana, y los topes dependen de ella.
  useEffect(() => {
    const elemento = marco.current;
    if (!elemento) return;

    const medir = (): void => setCaja({ ancho: elemento.clientWidth, alto: elemento.clientHeight });

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  /*
    La escala que LLENA la caja: la mayor de las dos proporciones. Con la menor
    —que es `contain`— quedarían franjas vacías a los lados.
  */
  const cubrir =
    natural && caja.ancho > 0 ? Math.max(caja.ancho / natural.ancho, caja.alto / natural.alto) : 1;
  const escala = cubrir * ZOOMS[zoom];
  const ancho = natural ? natural.ancho * escala : 0;
  const alto = natural ? natural.alto * escala : 0;

  /** Cuánto se puede mover cada eje. Negativo: es lo que sobra por ver. */
  const limite = { x: Math.min(0, caja.ancho - ancho), y: Math.min(0, caja.alto - alto) };

  const recortar = (x: number, y: number): { x: number; y: number } => ({
    x: Math.min(0, Math.max(limite.x, x)),
    y: Math.min(0, Math.max(limite.y, y)),
  });

  // Empieza CENTRADO, y se recentra al cambiar el zoom: ampliar desde una
  // esquina deja mirando un margen en blanco en vez de lo que se estaba
  // leyendo.
  useEffect(() => {
    if (!natural || caja.ancho === 0) return;
    setPos(recortar(limite.x / 2, limite.y / 2));
    // Solo al cambiar el documento, la caja o el zoom: recentrar en cada
    // arrastre pelearía con el dedo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, caja.ancho, caja.alto, zoom]);

  const sePuedeMover = limite.x < 0 || limite.y < 0;

  const encuadre = {
    position: 'absolute' as const,
    left: pos.x,
    top: pos.y,
    width: ancho || undefined,
    height: alto || undefined,
    // Antes de medir se pinta invisible: un fotograma con el documento a su
    // tamaño natural y sin encuadrar se ve como un salto.
    visibility: natural ? ('visible' as const) : ('hidden' as const),
  };

  return (
    <div
      ref={marco}
      // `touch-action: none` para que el dedo mueva el documento y no desplace
      // la ficha entera por detrás.
      className={cn(
        'relative h-[30rem] touch-none select-none overflow-hidden rounded-lg bg-card ring-1 ring-border',
        sePuedeMover && (arrastrando ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      onPointerDown={(e) => {
        if (!sePuedeMover) return;
        /*
          Los mandos del zoom no arrastran nada.

          Aquí estaba el bug que hacía que el zoom "no funcionara": al pulsar
          un mando, este marco tomaba `setPointerCapture` para el arrastre, y
          la captura REDIRIGE también el `click` al elemento que capturó. El
          estado del zoom nunca cambiaba porque el `onClick` del botón no
          llegaba a dispararse nunca.
        */
        if ((e.target as HTMLElement).closest('[data-mandos]')) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        agarre.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
        setArrastrando(true);
      }}
      onPointerMove={(e) => {
        const desde = agarre.current;
        if (!desde) return;
        setPos(recortar(desde.x + (e.clientX - desde.px), desde.y + (e.clientY - desde.py)));
      }}
      onPointerUp={() => {
        agarre.current = null;
        setArrastrando(false);
      }}
      onPointerCancel={() => {
        agarre.current = null;
        setArrastrando(false);
      }}
    >
      {/* Los mandos del zoom, sobre una pastilla oscura: encima de un recibo
          —que es blanco— cualquier control claro desaparece. */}
      <div
        data-mandos=""
        className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
      >
        <MandoDeZoom
          etiqueta="Alejar"
          deshabilitado={zoom === 0}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
        >
          <Minus className="size-4" aria-hidden="true" />
        </MandoDeZoom>
        <button
          type="button"
          onClick={() => setZoom(0)}
          title="Volver al tamaño normal"
          className="tabular min-w-[3rem] text-center text-2xs font-medium text-sala-tinta"
        >
          {Math.round(ZOOMS[zoom] * 100)} %
        </button>
        <MandoDeZoom
          etiqueta="Acercar"
          deshabilitado={zoom === ZOOMS.length - 1}
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
        >
          <Plus className="size-4" aria-hidden="true" />
        </MandoDeZoom>
      </div>

      {esImagen ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(e) =>
            setNatural({
              ancho: e.currentTarget.naturalWidth,
              alto: e.currentTarget.naturalHeight,
            })
          }
          style={encuadre}
        />
      ) : (
        <LienzoPdf
          url={url}
          // A 1400 y no a 240: esto se mira para leer una cifra, y el tamaño
          // de una miniatura la deja borrosa.
          ancho={1400}
          onTamano={(a, h) => setNatural({ ancho: a, alto: h })}
          estilo={encuadre}
        />
      )}
    </div>
  );
}

/** Los saltos del zoom, como múltiplos de la escala que llena la caja. */
const ZOOMS = [1, 1.5, 2, 3];

/** Un mando del zoom. Vive sobre el documento, así que no usa la paleta. */
function MandoDeZoom({
  etiqueta,
  deshabilitado,
  onClick,
  children,
}: {
  etiqueta: string;
  deshabilitado: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        'flex size-7 items-center justify-center rounded-full text-sala-tinta transition-colors',
        deshabilitado ? 'opacity-40' : 'hover:bg-sala-tinta/15',
      )}
    >
      {children}
    </button>
  );
}
