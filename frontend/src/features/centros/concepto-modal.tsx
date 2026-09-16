import { Loader2, Merge, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { CamposDeRecurrencia, type Recurrencia } from '@/components/campos-de-recurrencia';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api-client';
import { Confirmacion } from '@/components/ui/confirmacion';
import {
  useActualizarCategoria,
  useCategories,
  useCrearCategoria,
  useEliminarCategoria,
  useUnificarCategoria,
} from '@/lib/queries';
import type { Category } from '@coco/types';

/**
 * Crear o renombrar un concepto, y decir si se paga cada cierto tiempo.
 *
 * ── Por qué solo los conceptos ──────────────────────────────────────────────
 * Un centro de costos y un grupo no se pagan: son sumas. Lo que tiene un
 * importe, una fecha y una periodicidad es el concepto —el alquiler, la
 * energía—, y es el único nivel donde la recurrencia significa algo.
 *
 * ── Por qué el mismo formato que el de movimientos ──────────────────────────
 * Porque es la misma clase de acto: abrir una ficha, cambiar unos campos,
 * guardar. Dos formularios distintos para lo mismo obligan a aprender dos
 * veces dónde está el botón de guardar.
 */
export function ConceptoModal({
  abierta,
  concepto,
  grupoId,
  onCerrar,
}: {
  abierta: boolean;
  /** Sin concepto, el formulario crea dentro de `grupoId`. Con él, edita. */
  concepto?: Category | null;
  grupoId?: number;
  onCerrar: () => void;
}) {
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const unificar = useUnificarCategoria();
  const archivar = useEliminarCategoria();
  const categorias = useCategories();

  const [nombre, setNombre] = useState('');
  const [recurrencia, setRecurrencia] = useState<Recurrencia>({
    recurrente: false,
    periodicidad: 'mensual',
    diaDePago: 1,
    // El mes en curso: si alguien pasa a trimestral, lo más probable es que el
    // ciclo empiece ahora, no en enero.
    mesDePago: new Date().getMonth() + 1,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  // Se recarga en cada apertura: sin esto, abrir el segundo concepto mostraría
  // los datos del primero.
  useEffect(() => {
    if (!abierta) return;
    setNombre(concepto?.name ?? '');
    setRecurrencia({
      recurrente: concepto?.recurrente ?? false,
      periodicidad: concepto?.periodicidad ?? 'mensual',
      diaDePago: concepto?.dia_de_pago ?? 1,
      mesDePago: concepto?.mes_de_pago ?? new Date().getMonth() + 1,
    });
    setError(null);
  }, [abierta, concepto]);

  if (!abierta) return null;

  const guardando = crear.isPending || actualizar.isPending || unificar.isPending;

  /*
    ── El choque de nombres ────────────────────────────────────────────────
    Los duplicados aparecen solos: una importación crea "Movistar", otra crea
    "MOVISTAR S.A.", y a partir de ahí la misma factura suma por separado en
    dos conceptos. Ningún total cuadra y la dona muestra dos porciones donde
    hay una.

    Renombrar a secas no lo arregla —quedarían dos conceptos con el mismo
    nombre, que es peor: se ven iguales y siguen sumando aparte—, así que
    cuando el nombre ya existe se ofrece fundirlos.

    Sin distinguir mayúsculas ni espacios de sobra, que es justo como se
    escriben distinto dos veces la misma cosa.
  */
  const gemelo = conceptosDe(categorias.data ?? []).find(
    (c) => c.id !== concepto?.id && normalizar(c.name) === normalizar(nombre),
  );

  async function onUnificar(destinoId: number): Promise<void> {
    if (!concepto) return;
    setError(null);

    try {
      await unificar.mutateAsync({ origenId: concepto.id, destinoId });
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo unificar.');
    }
  }

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    const campos = {
      name: nombre.trim(),
      recurrente: recurrencia.recurrente,
      periodicidad: recurrencia.recurrente ? recurrencia.periodicidad : null,
      dia_de_pago: recurrencia.recurrente ? recurrencia.diaDePago : null,
      // El mes solo significa algo si el ciclo no es mensual.
      mes_de_pago:
        recurrencia.recurrente && recurrencia.periodicidad !== 'mensual'
          ? recurrencia.mesDePago
          : null,
    };

    try {
      if (concepto) await actualizar.mutateAsync({ id: concepto.id, cambios: campos });
      else await crear.mutateAsync({ ...campos, kind: 'expense', parent_id: grupoId });
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo guardar.');
    }
  }

  return (
    <>
      <Modal
        abierta={abierta}
        titulo={concepto ? 'Editar concepto' : 'Nuevo concepto'}
        ayuda="Lo más específico: lo que aparece en la factura."
        // Eliminar va en la cabecera, al lado de la equis: es la otra acción
        // de la ficha que no es "guardar".
        acciones={
          concepto && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmando(true)}
              aria-label={`Eliminar ${concepto.name}`}
              title="Eliminar concepto"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )
        }
        onCerrar={onCerrar}
      >
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="concepto-nombre">Nombre</Label>
            <Input
              id="concepto-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Celsia (Energía), Claro Móvil…"
              required
              autoFocus
            />
          </div>

          <CamposDeRecurrencia valor={recurrencia} onCambiar={setRecurrencia} />

          {gemelo && (
            /*
              Superficie neutra, no ámbar.

              El ámbar es para lo que está PENDIENTE —un movimiento sin
              clasificar, un pago que vence—. Esto no está pendiente ni salió
              mal: es una salida que se ofrece. Y en oscuro, además, el
              `warning-surface` es un marrón que sobre el verde del modal daba
              un verde oliva sucio.
            */
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-secondary/60 p-3">
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">
                  Ya existe “{gemelo.name}”.
                </strong>{' '}
                Si lo unificás, sus movimientos pasan a ese concepto y{' '}
                {concepto ? `“${concepto.name}” desaparece` : 'no se crea uno nuevo'}.
              </p>
              {concepto && (
                <Button
                  type="button"
                  variant="herramienta"
                  size="chip"
                  className="self-start"
                  disabled={guardando}
                  onClick={() => void onUnificar(gemelo.id)}
                >
                  <Merge className="size-4" aria-hidden="true" />
                  Unificar con “{gemelo.name}”
                </Button>
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onCerrar} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={guardando || nombre.trim() === '' || gemelo !== undefined}
              className="flex-1"
            >
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {concepto ? 'Guardar' : 'Crear'}
            </Button>
          </div>
        </form>
      </Modal>

      {concepto && (
        <Confirmacion
          abierta={confirmando}
          titulo={`¿Eliminar “${concepto.name}”?`}
          peligrosa
          etiquetaConfirmar="Eliminar"
          ocupada={archivar.isPending}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() =>
            archivar.mutate(concepto.id, {
              onSuccess: () => {
                setConfirmando(false);
                onCerrar();
              },
            })
          }
        >
          Se borra y no se puede deshacer. Si tiene movimientos, el sistema se
          niega: no se elimina nada que deje filas sin clasificar.
        </Confirmacion>
      )}
    </>
  );
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptosDe(arbol: Category[]): Category[] {
  return arbol.flatMap((centro) =>
    (centro.children ?? []).flatMap((grupo) => grupo.children ?? []),
  );
}

/** Dos nombres son el mismo si solo se diferencian en mayúsculas o espacios. */
function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}
