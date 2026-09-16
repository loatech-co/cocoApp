import { ExternalLink, Loader2, Lock, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { CamposDeRecurrencia, type Recurrencia } from '@/components/campos-de-recurrencia';
import { Soportes } from '@/components/soportes';
import { rutaSeleccionada } from '@/components/toolbar-filtros';
import { Button } from '@/components/ui/button';
import { Confirmacion } from '@/components/ui/confirmacion';
import { SelectorDeDia } from '@/components/selector-de-dia';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import {
  useActualizarCategoria,
  useActualizarMovimiento,
  useCategories,
  useCrearMovimiento,
  useEliminarMovimiento,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
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
  onCerrar: () => void;
}) {
  const categorias = useCategories();
  const crear = useCrearMovimiento();
  const actualizar = useActualizarMovimiento();
  const actualizarConcepto = useActualizarCategoria();
  const eliminar = useEliminarMovimiento();
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
    setType(movimiento?.type ?? 'expense');
    setCategoryId(movimiento?.category_id ?? categoriaPorDefecto);
    setNotes(movimiento?.notes ?? '');
    setError(null);
    setConfirmandoBorrado(false);
    setEditable(!movimiento);
    // El foco solo cuando hay algo que escribir: puesto en un campo de solo
    // lectura, el cursor parpadea en un sitio donde no se puede escribir.
    if (!movimiento) setTimeout(() => primerCampo.current?.focus(), 50);
  }, [abierta, movimiento, categoriaPorDefecto, descartes]);

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
      if (movimiento) await actualizar.mutateAsync({ id: movimiento.id, cambios: cuerpo });
      else await crear.mutateAsync(cuerpo as never);

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
    }
  }

  const guardando = crear.isPending || actualizar.isPending;

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
          'rounded-t-2xl sm:max-w-2xl sm:rounded-2xl',
          'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-5',
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {!editando ? 'Nuevo movimiento' : editable ? 'Editar movimiento' : 'Movimiento'}
          </h2>

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

        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="flex gap-2" role="group" aria-label="Tipo de movimiento">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                disabled={!editandoCampos}
                aria-pressed={type === t}
                className={cn(
                  'flex-1 rounded-full py-2.5 text-sm font-medium transition-colors',
                  type === t
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                  !editandoCampos && 'cursor-default opacity-60',
                )}
              >
                {t === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>

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
            <fieldset className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Dónde se clasifica
              </legend>

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

              <p className="px-1 text-xs text-muted-foreground">
                Un movimiento puede quedarse sin clasificar. Se guarda igual.
              </p>
            </fieldset>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mov-notas">Notas</Label>
            <textarea
              id="mov-notas"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
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
            <fieldset className="flex flex-col gap-3 rounded-2xl bg-secondary/60 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Soportes
              </legend>
              <Soportes transactionId={movimiento.id} />
            </fieldset>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Leyendo no hay nada que cancelar ni que guardar: un solo botón
              que cierra. "Cancelar" al lado de "Guardar" en una ficha que no
              se ha tocado invita a pensar que algo quedó a medias. */}
          {editandoCampos ? (
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
          ) : (
            <div className="pt-1">
              <Button type="button" variant="ghost" onClick={onCerrar} className="w-full">
                Cerrar
              </Button>
            </div>
          )}
        </form>

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
