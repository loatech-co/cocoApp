import {
  ArrowUpRight,
  Camera,
  Loader2,
  Lock,
  Minus,
  Pencil,
  Plus,
  ScanLine,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trash2,
  Upload,
  X,
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
import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipIcono } from '@/components/ui/chip-icono';
import { Combo } from '@/components/ui/combo';
import { Confirmacion } from '@/components/ui/confirmacion';
import { SelectorDeDia } from '@/components/selector-de-dia';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const primerCampo = useRef<HTMLInputElement>(null);

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
    if (!movimiento) setTimeout(() => primerCampo.current?.focus(), 50);
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
   */
  async function escanear(archivo: File): Promise<void> {
    setPaso('leyendo');
    setError(null);
    setPendientes([archivo]);

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
      // `bg-carbon-950/50` no pintaba nada: `carbon` no existe en esta paleta,
      // así que la clase no generaba ningún color y el modal flotaba sobre la
      // página sin velo detrás.
      className="fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
        onClick={(e) => e.stopPropagation()}
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        className={cn(
          'max-h-[92dvh] w-full overflow-y-auto bg-popover p-5',
          'shadow-[var(--sombra-flotante)] ring-1 ring-black/5 dark:ring-white/12',
          // Más ancho: con dos columnas de campos, `max-w-lg` obligaba a que
          // cada una midiera menos que el texto que lleva dentro.
          // Más ancho desde que los soportes se ven en miniatura: con
          // `max-w-2xl` cabían dos recibos por fila y ocho quedaban en cuatro
          // renglones, que es más alto que el resto de la ficha junta.
          'rounded-t-2xl sm:max-w-5xl sm:rounded-2xl',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          {/* El tipo está en el TÍTULO y en el color, no en un par de botones
              dentro del formulario. Lo eligió el menú de "Nuevo movimiento"
              antes de abrir esto, así que aquí ya no es una pregunta: es de
              qué se está hablando, y el pastel lo dice antes de leer. */}
          <div className="flex min-w-0 items-center gap-3">
            <ChipIcono
              Icono={type === 'income' ? TrendingUp : TrendingDown}
              color={type === 'income' ? 'verde' : 'violeta'}
              tamano="sm"
            />
            <h2 className="truncate text-xl font-semibold">
              {!editando
                ? `Nuevo ${nombreDelTipo(type)}`
                : editable
                  ? `Editar ${nombreDelTipo(type)}`
                  : mayuscula(nombreDelTipo(type))}
            </h2>
          </div>

          {/* Juntas y del mismo tamaño, como en la ficha de un concepto: son
              las acciones que no son "guardar". */}
          <div className="flex shrink-0 items-center gap-1">
            {editando && !editable && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setEditable(true)}
                aria-label="Editar movimiento"
                title="Editar"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            )}

            {/* Solo en los dinámicos. Un movimiento de un centro estático no
                se borra desde aquí por la misma razón por la que no se
                reclasifica: su estructura se decide en Centros de costos. */}
            {editando && !estatico && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmandoBorrado(true)}
                aria-label="Eliminar movimiento"
                title="Eliminar"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onCerrar}
              aria-label="Cerrar"
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

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
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-7 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {progresoDeLectura?.etapa ?? 'Leyendo el soporte…'}
            </p>
            {/* El OCR de un escaneo tarda segundos y sin barra parece colgado. */}
            <div className="h-1 w-48 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.round((progresoDeLectura?.avance ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {paso === 'formulario' && (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          {lectura && <LoQueLei />}
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
              <div className="grid gap-5 lg:grid-cols-2">
                <Seccion titulo="Soporte" caja={false}>
                  {movimiento ? (
                    <Soportes transactionId={movimiento.id} />
                  ) : (
                    <SoportesPendientes
                      archivos={pendientes}
                      onAñadir={(nuevos) => setPendientes((p) => [...p, ...nuevos])}
                      onQuitar={(i) => setPendientes((p) => p.filter((_, n) => n !== i))}
                    />
                  )}
                </Seccion>

                {/*
                  El orden es el de la pregunta: de qué centro, de qué grupo,
                  qué concepto. Y después cuánto y cuándo, que son los dos
                  datos que se copian del papel.

                  Sin rótulo de sección: tres campos con su nombre encima no
                  necesitan que alguien anuncie que son tres campos.
                */}
                <div className="flex flex-col gap-3">
                  <Campo etiqueta="Centro de costos" id="mov-centro">
                    <Combo
                      id="mov-centro"
                      etiqueta="Centro de costos"
                      valor={centro ? String(centro.id) : ''}
                      opciones={arbol.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
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
                      deshabilitado={!centro}
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
                      deshabilitado={!grupo}
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
                        ref={primerCampo}
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
                      <SelectorDeDia id="mov-fecha" valor={date} onElegir={setDate} requerido />
                    </Campo>
                  </div>

                  {estatico && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        “{centroGuardado?.name}” es un centro estático. La clasificación y la
                        periodicidad se modifican desde Centros de costos.
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <Campo etiqueta="Notas" id="mov-notas">
                <textarea
                  id="mov-notas"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="rounded-lg border bg-card px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--input)' }}
                  placeholder="Opcional"
                />
              </Campo>
            </>
          ) : (
            <VistaDeLectura
              tipo={type}
              descripcion={description}
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
            <Seccion titulo="Soportes" caja={false}>
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
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (!editando) return onCerrar();
                  setDescartes((n) => n + 1);
                  setEditable(false);
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} className="flex-1">
                {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {editando ? 'Guardar' : 'Registrar'}
              </Button>
            </div>
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
          Se borra y no se puede deshacer. Sus soportes se van con él.
        </Confirmacion>
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
  descripcion,
  valor,
  fecha,
  periodo,
  ruta,
}: {
  tipo: TransactionType;
  descripcion: string;
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
          <p className="flex items-center gap-2 font-display text-4xl font-bold leading-none text-lima-tinta sm:text-5xl">
            <ArrowUpRight
              className={cn('size-8 shrink-0 sm:size-10', tipo === 'income' && 'rotate-180')}
              strokeWidth={2.75}
              aria-hidden="true"
            />
            {formatCOP(valor || '0')}
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          <p className="truncate text-base font-medium">{descripcion || 'Sin concepto'}</p>

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
  children,
}: {
  titulo: string;
  /** Con `false`, el contenido va suelto: lo que ya son tarjetas no necesita otra. */
  caja?: boolean;
  children: ReactNode;
}) {
  return (
    // `gap-3` y no `gap-2`: con ocho pulgadas de miniaturas debajo, dos
    // píxeles menos hacían que el rótulo pareciera pegado a la primera fila,
    // casi montado encima —que es justo lo que se acaba de arreglar quitando
    // los `legend`—.
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h3>
      {caja ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-3">{children}</div>
      ) : (
        children
      )}
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
    <div className="flex flex-col gap-3">
      <Via
        Icono={ScanLine}
        color="violeta"
        titulo="Escanear un soporte"
        ayuda="Se extraen el valor, la fecha y el concepto. Requieren confirmación antes de guardar."
      >
        <BotonDeVia Icono={Camera} onClick={onCamara}>
          Usar la cámara
        </BotonDeVia>
        <BotonDeVia Icono={Upload} onClick={() => campo.current?.click()}>
          Seleccionar un archivo
        </BotonDeVia>
      </Via>

      <Via
        Icono={Pencil}
        color="turquesa"
        titulo="Registro manual"
        ayuda="Para un movimiento sin soporte, o cuando su clasificación ya se conoce."
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
 * Una de las dos vías.
 *
 * Con `onClick` la fila entera es un botón; sin él, es una caja que contiene
 * los suyos. Las dos formas existen porque una fila no puede hacer dos cosas
 * a la vez, y escanear son dos.
 */
function Via({
  Icono,
  color,
  titulo,
  ayuda,
  onClick,
  children,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: 'violeta' | 'turquesa';
  titulo: string;
  ayuda: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const dentro = (
    <>
      <ChipIcono Icono={Icono} color={color} tamano="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="block">
          <span className="block text-sm font-semibold">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{ayuda}</span>
        </span>
        {children && <span className="flex flex-wrap gap-2">{children}</span>}
      </span>
    </>
  );

  const forma = 'flex w-full items-start gap-3 rounded-2xl bg-secondary/60 p-4 text-left';

  if (!onClick) return <div className={forma}>{dentro}</div>;

  return (
    <button type="button" onClick={onClick} className={cn(forma, 'transition-colors hover:bg-black/10')}>
      {dentro}
    </button>
  );
}

function BotonDeVia({
  Icono,
  onClick,
  children,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background"
    >
      <Icono className="size-3.5 shrink-0" aria-hidden={true} />
      {children}
    </button>
  );
}

/**
 * El aviso de que hay datos leídos por la máquina.
 *
 * ── Por qué lima y no ámbar ─────────────────────────────────────────────────
 * Porque no ha pasado nada malo. El ámbar de esta app está para lo que está
 * PENDIENTE —un pago que vence, un movimiento sin clasificar— y un naranja
 * intenso encima de un formulario que acaba de rellenarse solo se lee como un
 * error, cuando lo que hubo fue un acierto. El lima es el acento de la casa:
 * llama sin alarmar.
 *
 * ── Por qué el lima de la PALETA y no `bg-accent` ───────────────────────────
 * Porque `--accent` se invierte entre temas: en claro es lima-300, pero en
 * oscuro es bosque-800 —un verde oscuro— con la letra en lima. Con `bg-accent`
 * este aviso salía como un rectángulo verde sobre verde: parecía decoración,
 * no un aviso. `bg-lima-300` es lima en los dos temas.
 *
 * Y la letra en TINTA, nunca en blanco: blanco sobre lima da 1,23:1 de
 * contraste, muy por debajo del 4,5:1 que exige un texto.
 *
 * ── Al 70 % y con las esquinas más cerradas ─────────────────────────────────
 * Un lima opaco de esquina a esquina con el radio de una tarjeta pesaba como
 * una tarjeta: se leía como una superficie más de la ficha en vez de como una
 * nota puesta encima. Algo de transparencia lo asienta sobre lo que hay
 * detrás, y 10px —por debajo del radio estándar, que es el de los
 * contenedores— dicen que esto no es un contenedor.
 *
 * El 85 % no se veía: quince por ciento de verde oscuro por debajo de un lima
 * claro no cambia nada a la vista. Al 70 % el fondo se nota y el aviso se
 * asienta sobre la ficha en vez de flotar como una pegatina.
 *
 * Y la tinta sigue holgada: lima-300 al 70 % sobre el verde de la ficha da un
 * oliva claro, y tinta-950 encima queda alrededor de 6:1 —por encima del 4,5
 * que exige un texto—.
 *
 * ── Por qué una sola frase ──────────────────────────────────────────────────
 * Porque el detalle de por qué se clasificó así no cambia lo que hay que
 * hacer, que es mirar los campos. Contarlo entero ocupaba tres renglones y
 * empujaba hacia abajo justo lo que se pedía revisar.
 */
function LoQueLei() {
  return (
    <p className="flex items-center gap-2 rounded-[10px] bg-lima-300/70 px-4 py-3 text-sm font-medium text-tinta-950">
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

  return (
    <div className="flex flex-col gap-3">
      {i >= 0 && urls[i] && (
        <PreviaDeArchivo key={urls[i]} url={urls[i]} esImagen={archivos[i].type.startsWith('image/')} />
      )}

      <ul className="flex flex-wrap gap-2">
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
        <li className={cn(archivos.length === 0 && 'w-full')}>
          <Soltar
            subiendo={false}
            progreso={0}
            solo={archivos.length === 0}
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
          104px y 16px de radio.

          Y con BORDE de 2px, no con anillo. Los dos tenían el mismo radio
          nominal, pero un anillo se dibuja por FUERA del borde de la caja: la
          curva quedaba un píxel más abierta que la del cuadro punteado de al
          lado, y en dos plazas pegadas eso se ve. Con la misma anchura de
          trazo, la geometría es idéntica.
        */
        'group relative size-[104px] overflow-hidden rounded-2xl border-2 bg-card transition-colors',
        activo ? 'border-lima-tinta' : 'border-border hover:border-muted-foreground',
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
        className="pointer-events-none absolute inset-0 bg-tinta-950/55 opacity-0 transition-opacity group-hover:opacity-100"
      />

      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${nombre}`}
        title="Quitar este soporte"
        className={cn(
          'absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full',
          'text-tinta-50 opacity-0 transition-opacity',
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

    const medir = (): void =>
      setCaja({ ancho: elemento.clientWidth, alto: elemento.clientHeight });

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
    natural && caja.ancho > 0
      ? Math.max(caja.ancho / natural.ancho, caja.alto / natural.alto)
      : 1;
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
        'relative h-[30rem] touch-none select-none overflow-hidden rounded-2xl bg-card ring-1 ring-border',
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
        className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-tinta-950/75 p-0.5"
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
          className="tabular min-w-[3rem] text-center text-[11px] font-medium text-tinta-50"
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

/**
 * Un campo con su nombre encima.
 *
 * El nombre va FUERA del control y no dentro como marcador de posición: un
 * marcador desaparece al escribir, así que al revisar un formulario ya lleno
 * nadie sabe qué era cada caja.
 */
function Campo({
  etiqueta,
  id,
  children,
}: {
  etiqueta: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
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
        'flex size-7 items-center justify-center rounded-full text-tinta-50 transition-colors',
        deshabilitado ? 'opacity-40' : 'hover:bg-white/15',
      )}
    >
      {children}
    </button>
  );
}
