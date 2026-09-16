import {
  ArrowUpRight,
  Camera,
  ExternalLink,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  ScanLine,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
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
import { Link } from 'react-router-dom';

import { CamposDeRecurrencia, type Recurrencia } from '@/components/campos-de-recurrencia';
import { Soportes } from '@/components/soportes';
import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipIcono } from '@/components/ui/chip-icono';
import { Confirmacion } from '@/components/ui/confirmacion';
import { SelectorDeDia } from '@/components/selector-de-dia';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ApiClientError, apiSubir } from '@/lib/api-client';
import { diaLargo, mesLargo } from '@/lib/fechas';
import {
  useActualizarCategoria,
  useActualizarMovimiento,
  useCategories,
  useCrearCategoria,
  useCrearMovimiento,
  useEliminarMovimiento,
} from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import { Camara } from './camara';
import { leerSoporte, type ProgresoDeLectura } from './leer-soporte';
import { normalizar, UMBRAL_DE_REVISION, type Lectura } from '@coco/lectura';
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
  const actualizarConcepto = useActualizarCategoria();
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

  // La recurrencia pertenece al CONCEPTO, así que se carga de él y se guarda
  // en él. Aquí solo se edita de paso, que es donde uno se acuerda.
  const [recurrencia, setRecurrencia] = useState<Recurrencia>({
    recurrente: false,
    periodicidad: 'mensual',
    diaDePago: 1,
    // El mes en curso: si alguien pasa a trimestral, lo más probable es que el
    // ciclo empiece ahora, no en enero.
    mesDePago: new Date().getMonth() + 1,
  });

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

  // Al elegir un concepto se trae SU recurrencia: es lo que ya estaba
  // guardado, y empezar de cero haría que abrir el modal y guardar sin tocar
  // nada borrara la marca.
  const arbolCargado = categorias.data ?? [];
  const conceptoElegido = rutaSeleccionada(arbolCargado, categoryId).concepto;

  useEffect(() => {
    if (!abierta) return;
    setRecurrencia({
      recurrente: conceptoElegido?.recurrente ?? false,
      periodicidad: conceptoElegido?.periodicidad ?? 'mensual',
      diaDePago: conceptoElegido?.dia_de_pago ?? 1,
      mesDePago: conceptoElegido?.mes_de_pago ?? new Date().getMonth() + 1,
    });
  }, [abierta, conceptoElegido]);

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
   * Crea el concepto que el clasificador reconoció y el árbol no tiene.
   *
   * Crea la rama entera si hace falta —centro, grupo y concepto— porque un
   * concepto suelto no existe: sin su grupo no suma en ningún desglose. Y deja
   * el nuevo elegido, que es lo que uno venía a hacer.
   */
  async function crearLoReconocido(): Promise<void> {
    if (!lectura?.concepto || !lectura.grupo || !lectura.centro) return;
    setError(null);

    try {
      const arbolActual = categorias.data ?? [];
      const centroExistente = arbolActual.find((c) => normalizar(c.name) === normalizar(lectura.centro!));
      const centroId =
        centroExistente?.id ??
        (await crearCategoria.mutateAsync({ name: lectura.centro, kind: 'expense' })).id;

      const grupoExistente = (centroExistente?.children ?? []).find(
        (g) => normalizar(g.name) === normalizar(lectura.grupo!),
      );
      const grupoId =
        grupoExistente?.id ??
        (await crearCategoria.mutateAsync({
          name: lectura.grupo,
          kind: 'expense',
          parent_id: centroId,
        })).id;

      const nuevo = await crearCategoria.mutateAsync({
        name: lectura.concepto,
        kind: 'expense',
        parent_id: grupoId,
      });

      setCategoryId(nuevo.id);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear el concepto.');
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

      // La recurrencia va aparte porque no es del movimiento: es del concepto.
      if (concepto && cambioLaRecurrencia(concepto, recurrencia)) {
        await actualizarConcepto.mutateAsync({
          id: concepto.id,
          cambios: {
            recurrente: recurrencia.recurrente,
            periodicidad: recurrencia.recurrente ? recurrencia.periodicidad : null,
            dia_de_pago: recurrencia.recurrente ? recurrencia.diaDePago : null,
            mes_de_pago:
              recurrencia.recurrente && recurrencia.periodicidad !== 'mensual'
                ? recurrencia.mesDePago
                : null,
          },
        });
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
          'rounded-t-2xl sm:max-w-3xl sm:rounded-2xl',
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
          {lectura && <LoQueLei lectura={lectura} />}
          {editandoCampos ? (
            <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mov-concepto">Concepto</Label>
            <Input
              id="mov-concepto"
              ref={primerCampo}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Celsia, colegio, mercado…"
              maxLength={255}
              /*
                En un centro estático el nombre tampoco se escribe aquí.

                Este campo y el concepto del árbol se llaman igual y significan
                lo mismo para quien los lee: dejar que se separen produce un
                movimiento que dice "Celsia" colgando de un concepto que se
                llama "Celsia (Energía)", y a partir de ahí nadie sabe cuál de
                los dos es el nombre bueno. El nombre de un concepto estático
                se cambia donde se definió.
              */
              disabled={!editandoCampos || estatico}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mov-valor">Valor</Label>
              <Input
                id="mov-valor"
                // `inputMode` numérico abre el teclado de números en el
                // teléfono; `type=number` traería flechitas y rechazaría la
                // coma decimal que se usa en Colombia.
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
                disabled={!editandoCampos}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mov-fecha">Fecha</Label>
              <SelectorDeDia
                id="mov-fecha"
                valor={date}
                onElegir={setDate}
                requerido
                deshabilitado={!editandoCampos}
              />
            </div>
          </div>

          {/*
            ── En un centro estático, aquí no hay nada que decidir ──────────
            Ni dónde se clasifica ni cada cuánto se paga: las dos cosas son
            del CONCEPTO, y el concepto de un centro estático se define en
            Centros de costos. Enseñar los desplegables apagados ocuparía
            media ficha para no dejar tocar nada; en su lugar va el camino
            hasta donde sí se cambia.
          */}
          {estatico ? (
            <div className="flex flex-col gap-2 rounded-2xl bg-secondary/60 p-3">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dónde se clasifica
              </p>
              <p className="px-1 text-sm">
                {[centro?.name, grupo?.name, concepto?.name].filter(Boolean).join(' › ')}
              </p>
              <p className="flex items-start gap-1.5 px-1 text-xs text-muted-foreground">
                <Lock className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  “{centroGuardado?.name}” es un centro estático. La clasificación y la
                  periodicidad se modifican desde Centros de costos.
                </span>
              </p>
              <Link
                to="/centros-de-costos"
                onClick={onCerrar}
                className="mx-1 flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background"
              >
                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                Editar el concepto en Centros de costos
              </Link>
            </div>
          ) : (
            <Seccion titulo="Dónde se clasifica">

              <Cascada
                etiqueta="Centro de costos"
                valor={centro?.id}
                opciones={arbol}
                deshabilitado={!editandoCampos}
                onElegir={setCategoryId}
              />
              <Cascada
                etiqueta="Grupo"
                valor={grupo?.id}
                opciones={centro?.children ?? []}
                deshabilitado={!editandoCampos || !centro}
                onElegir={(id) => setCategoryId(id ?? centro?.id)}
              />
              <Cascada
                etiqueta="Concepto"
                valor={concepto?.id}
                opciones={grupo?.children ?? []}
                deshabilitado={!editandoCampos || !grupo}
                onElegir={(id) => setCategoryId(id ?? grupo?.id)}
              />

              {/* Reconocí el acreedor pero no está en el árbol: ofrecerlo con
                  su rama ahorra ir a Centros de costos, crearlo, y volver. */}
              {lectura?.concepto &&
              lectura.grupo &&
              lectura.centro &&
              !conceptoLlamado(arbol, lectura.concepto) ? (
                <button
                  type="button"
                  onClick={() => void crearLoReconocido()}
                  disabled={crearCategoria.isPending}
                  className="flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background"
                >
                  {crearCategoria.isPending ? (
                    <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  Crear “{lectura.concepto}” en {lectura.centro} › {lectura.grupo}
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Un movimiento puede quedarse sin clasificar. Se guarda igual.
                </p>
              )}
            </Seccion>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mov-notas">Notas</Label>
            <textarea
              id="mov-notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              disabled={!editandoCampos}
              className="rounded-lg border bg-card px-3 py-2 text-sm"
              style={{ borderColor: 'var(--input)' }}
              placeholder="Opcional"
            />
          </div>

          {/* Solo con un concepto elegido, y nunca en un estático: la
              recurrencia es del CONCEPTO, y el de un centro estático se
              configura en Centros de costos —el enlace está arriba—. */}
          {concepto && !estatico && (
            <CamposDeRecurrencia
              valor={recurrencia}
              onCambiar={setRecurrencia}
              concepto={concepto.name}
            />
          )}
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
          {editando && movimiento && (
            <Seccion titulo="Soportes" caja={false}>
              <Soportes transactionId={movimiento.id} />
            </Seccion>
          )}

          {/* Creando todavía no hay de qué colgarlos, así que se quedan
              esperando y se suben en cuanto el movimiento existe. */}
          {!editando && (
            <Seccion titulo="Soportes">
              <SoportesPendientes
                archivos={pendientes}
                onAñadir={(nuevos) => setPendientes((p) => [...p, ...nuevos])}
                onQuitar={(i) => setPendientes((p) => p.filter((_, n) => n !== i))}
              />
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

function Cascada({
  etiqueta,
  valor,
  opciones,
  deshabilitado,
  onElegir,
}: {
  etiqueta: string;
  valor?: number;
  opciones: Category[];
  deshabilitado?: boolean;
  onElegir: (id: number | undefined) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <Select
        etiqueta={etiqueta}
        vacio="Sin elegir"
        valor={valor === undefined ? '' : String(valor)}
        deshabilitado={deshabilitado}
        opciones={opciones.map((o) => ({ valor: String(o.id), etiqueta: o.name }))}
        onCambiar={(v) => onElegir(v === '' ? undefined : Number(v))}
      />
    </label>
  );
}

/** Hoy en America/Bogota, para que la fecha por defecto no dependa del navegador. */
function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Si hay algo nuevo que guardar en el concepto. */
function cambioLaRecurrencia(
  concepto: {
    recurrente: boolean;
    periodicidad: string | null;
    dia_de_pago: number | null;
    mes_de_pago: number | null;
  },
  recurrencia: Recurrencia,
): boolean {
  if (concepto.recurrente !== recurrencia.recurrente) return true;
  if (!recurrencia.recurrente) return false;
  if (concepto.periodicidad !== recurrencia.periodicidad) return true;
  if (concepto.dia_de_pago !== recurrencia.diaDePago) return true;

  // El mes solo cuenta si el ciclo no es mensual: ahí no se guarda.
  return recurrencia.periodicidad !== 'mensual' && concepto.mes_de_pago !== recurrencia.mesDePago;
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
 * Lo que se leyó del soporte, dicho antes de que se guarde.
 *
 * ── Por qué se enseña y no se aplica en silencio ────────────────────────────
 * Porque un soporte mal leído que se guarda solo es peor que no leerlo: nadie
 * vuelve a mirar lo que ya quedó registrado, y el error se descubre meses
 * después cuando un total no cuadra. Dicho aquí, corregirlo cuesta un clic en
 * el campo de al lado.
 *
 * ── Por qué se dice también la confianza ────────────────────────────────────
 * Porque no todas las lecturas valen lo mismo, y quien confirma merece saber
 * cuál mirar con cuidado. Un PDF digital con el NIT y la línea de "total a
 * pagar" es casi seguro; una foto torcida de un recibo térmico, no.
 */
function LoQueLei({ lectura }: { lectura: Lectura }) {
  const seguro = lectura.confianza >= UMBRAL_DE_REVISION;

  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-2xl p-3 text-xs',
        // Ámbar para lo que hay que mirar, nunca rojo: no salió nada mal, hay
        // algo pendiente de confirmar.
        seguro ? 'bg-secondary/60 text-muted-foreground' : 'bg-warning-surface text-warning',
      )}
    >
      {seguro ? (
        <Sparkles className="mt-px size-4 shrink-0" aria-hidden="true" />
      ) : (
        <TriangleAlert className="mt-px size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0">
        {seguro ? 'Lectura del soporte. ' : 'Lectura con baja confianza. '}
        {lectura.motivo}
        {!seguro && ' Conviene revisar los campos antes de guardar.'}
      </span>
    </div>
  );
}

/**
 * Los soportes elegidos antes de que el movimiento exista.
 *
 * Se quedan en memoria hasta que hay un movimiento del que colgarlos. La
 * alternativa —crear el movimiento vacío para tener un identificador y luego
 * adjuntar— deja movimientos a medias en la base cada vez que alguien abre el
 * formulario y se arrepiente.
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
  const campo = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      {archivos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {archivos.map((a, i) => (
            <li
              key={`${a.name}-${i}`}
              className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs"
            >
              <span className="max-w-[14rem] truncate">{a.name}</span>
              <span className="tabular shrink-0 text-muted-foreground">
                {(a.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => onQuitar(i)}
                aria-label={`Quitar ${a.name}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => campo.current?.click()}
        className="flex w-fit items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-background"
      >
        <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
        {archivos.length === 0 ? 'Adjuntar un soporte' : 'Adjuntar otro'}
      </button>

      <input
        ref={campo}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="hidden"
        onChange={(e) => {
          onAñadir(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}
