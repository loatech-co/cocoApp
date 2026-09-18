import { Loader2, Merge, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { CamposDePalabrasClave } from '@/components/campos-de-palabras-clave';
import { CamposDeRecurrencia, type Recurrencia } from '@/components/campos-de-recurrencia';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Campo } from '@/components/ui/campo';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api-client';
import {
  useActualizarCategoria,
  useCategories,
  useCrearCategoria,
  useUnificarCategoria,
} from '@/lib/queries';
import type { Category } from '@coco/types';
import { Bloque } from '@/components/ui/bloque';
import { PieDeModal } from '@/components/ui/modal-partes';
import { ConfirmarBorrado } from '@/features/centros/confirmar-borrado';
import { Select } from '@/components/ui/select';

/**
 * Crear o renombrar un concepto, y decir si se paga cada cierto tiempo.
 *
 * ── Por qué solo los conceptos ──────────────────────────────────────────────
 * Un centro de costos y una categoría no se pagan: son sumas. Lo que tiene un
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
  categoriaId,
  onCerrar,
}: {
  abierta: boolean;
  /** Sin concepto, el formulario crea dentro de `categoríaId`. Con él, edita. */
  concepto?: Category | null;
  categoriaId?: number;
  onCerrar: () => void;
}) {
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const unificar = useUnificarCategoria();
  const categorias = useCategories();

  const [nombre, setNombre] = useState('');
  const [recurrencia, setRecurrencia] = useState<Recurrencia>({
    recurrente: false,
    periodicidad: 'mensual',
    diaDePago: 1,
    // El mes en curso: si alguien pasa a trimestral, lo más probable es que el
    // ciclo empiece ahora, no en enero.
    mesDePago: new Date().getMonth() + 1,
    presupuesto: '',
    pagoAutomatico: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  /** Lo que se busca en un soporte para reconocer este concepto. */
  const [palabrasClave, setPalabrasClave] = useState<string[]>([]);
  /** La categoría al que pertenece. Vacío mientras no se esté editando. */
  const [categoria, setCategoría] = useState('');

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
      // Sin decimales: el campo escribe pesos enteros, que es como se escribe
      // la plata aquí. Un «180000.00» que vuelve de la API se enseñaría con un
      // «.00» que nadie tecleó y que el campo no deja borrar.
      presupuesto:
        concepto?.presupuesto != null ? String(Math.round(Number(concepto.presupuesto))) : '',
      pagoAutomatico: concepto?.pago_automatico ?? false,
    });
    setCategoría(concepto?.parent_id != null ? String(concepto.parent_id) : '');
    setPalabrasClave(concepto?.palabras_clave ?? []);
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
  /*
    ── Las categorías del MISMO centro, y solo esos ────────────────────────────
    Mover un concepto de categoría es corregir dónde está dentro de su centro:
    «Claro Móvil» estaba en Vivienda y va en Servicios públicos. Mover de
    CENTRO es otra cosa —cambia de qué bolsa sale la plata— y es la clase de
    decisión que no se toma de pasada en un desplegable mientras se corrige un
    nombre.

    Y hay una razón práctica encima: un centro puede ser estático, y entonces
    lo que cuelga de él no se reclasifica. Ofrecer el salto entre centros
    obligaría a decidir aquí qué pasa con esa regla; limitándolo al centro
    propio, la pregunta no existe.
  */
  const hermanos = (categorias.data ?? []).flatMap((centro) => {
    const categorias = centro.children ?? [];
    return categorias.some((g) => Number(g.id) === Number(concepto?.parent_id))
      ? categorias.map((g) => ({ valor: String(g.id), etiqueta: g.name }))
      : [];
  });

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
      /*
        Vacío es `null`, no cero.

        Son dos cosas distintas y la API las distingue: `null` es «no lo sé,
        estímalo con el promedio» y cero es «esto ahora no cuesta». Mandar cero
        por un campo en blanco haría desaparecer el concepto del presupuesto
        del mes sin que nadie lo hubiera pedido.

        Y si deja de ser recurrente se va con la recurrencia: un presupuesto
        «cada vez» no significa nada donde no hay una próxima vez.
      */
      presupuesto:
        recurrencia.recurrente && recurrencia.presupuesto.trim() !== ''
          ? Number(recurrencia.presupuesto)
          : null,
      // Se va con la recurrencia, como el presupuesto: cobrar solo «cada vez»
      // no significa nada donde no hay una próxima vez.
      pago_automatico: recurrencia.recurrente && recurrencia.pagoAutomatico,
      palabras_clave: palabrasClave,
    };

    try {
      if (concepto) {
        await actualizar.mutateAsync({
          id: concepto.id,
          cambios: {
            ...campos,
            // Solo si de verdad cambió: un `parent_id` en cada guardado
            // dispara la comprobación de ciclos y de profundidad del árbol
            // para nada.
            ...(categoria !== '' && Number(categoria) !== Number(concepto.parent_id)
              ? { parent_id: Number(categoria) }
              : {}),
          },
        });
      }
      else await crear.mutateAsync({ ...campos, kind: 'expense', parent_id: categoriaId });
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
              size="sm-icon"
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
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
          <Campo etiqueta="Nombre" id="concepto-nombre">
            <Input
              id="concepto-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Celsia (Energía), Claro Móvil…"
              required
            />
          </Campo>

          {/* Solo al editar: al crear, la categoría es aquella cuyo botón se pulsó
              para abrir esto, así que preguntarlo otra vez es preguntar por
              algo que se acaba de decir. */}
          {concepto && hermanos.length > 1 && (
            <Campo
              etiqueta="Categoría"
              id="concepto-categoria"
              ayuda="Solo las categorías de su mismo centro de costos."
            >
              <Select
                id="concepto-categoria"
                etiqueta="Categoría"
                valor={categoria}
                opciones={hermanos}
                onCambiar={setCategoría}
              />
            </Campo>
          )}

          <CamposDeRecurrencia valor={recurrencia} onCambiar={setRecurrencia} />

          {/*
            Después de la recurrencia y no antes del nombre.

            Lo que se viene a hacer a esta ficha es crear o corregir un
            concepto; que sus recibos se lean solos es lo que se hace DESPUÉS,
            y la primera vez casi nunca —no se sabe qué dice el recibo hasta
            que llega—. Arriba obligaría a pasar por encima de un campo que la
            mayoría de las veces se deja vacío.
          */}
          <CamposDePalabrasClave
            valor={palabrasClave}
            onCambiar={setPalabrasClave}
            arbol={categorias.data ?? []}
            conceptoId={concepto?.id}
          />

          {gemelo && (
            /*
              Superficie neutra, no ámbar.

              El ámbar es para lo que está PENDIENTE —un movimiento sin
              clasificar, un pago que vence—. Esto no está pendiente ni salió
              mal: es una salida que se ofrece. Y en oscuro, además, el
              `warning-surface` es un marrón que sobre el verde del modal daba
              un verde oliva sucio.
            */
            <Bloque className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">
                  Ya existe “{gemelo.name}”.
                </strong>{' '}
                Si lo unificas, sus movimientos pasan a ese concepto y{' '}
                {concepto ? `“${concepto.name}” desaparece` : 'no se crea uno nuevo'}.
              </p>
              {concepto && (
                <Button
                  type="button"
                  variant="herramienta"
                  size="sm"
                  className="self-start"
                  disabled={guardando}
                  onClick={() => void onUnificar(gemelo.id)}
                >
                  <Merge className="size-4" aria-hidden="true" />
                  Unificar con “{gemelo.name}”
                </Button>
              )}
            </Bloque>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <PieDeModal>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={guardando || nombre.trim() === '' || gemelo !== undefined}
            >
              {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {concepto ? 'Guardar' : 'Crear'}
            </Button>
          </PieDeModal>
        </form>
      </Modal>

      {concepto && (
        <ConfirmarBorrado
          categoria={concepto}
          nivel="concepto"
          arbol={categorias.data ?? []}
          abierta={confirmando}
          onCerrar={() => setConfirmando(false)}
          // Sin el concepto, esta ficha no tiene de qué hablar.
          onEliminada={onCerrar}
        />
      )}
    </>
  );
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptosDe(arbol: Category[]): Category[] {
  return arbol.flatMap((centro) =>
    (centro.children ?? []).flatMap((categoria) => categoria.children ?? []),
  );
}

/** Dos nombres son el mismo si solo se diferencian en mayúsculas o espacios. */
function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}
