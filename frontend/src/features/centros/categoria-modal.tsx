import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Interruptor } from '@/components/ui/interruptor';
import { Campo } from '@/components/ui/campo';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api-client';
import { useActualizarCategoria, useCrearCategoria } from '@/lib/queries';
import { BLOQUE } from '@/components/ui/bloque';
import { cn } from '@/lib/utils';
import { PieDeModal } from '@/components/ui/modal-partes';
import type { Category } from '@coco/types';
import { ICONOS_DE_GRUPO, IconoDeCategoria } from '@/components/ui/iconos';

/**
 * Los cincuenta iconos, abiertos.
 *
 * ── Por qué se puede quitar ─────────────────────────────────────────────────
 * Porque un grupo sin icono es un caso legítimo —los hay que no se parecen a
 * ningún dibujo— y sin una forma de volver atrás, el primer icono que alguien
 * pulse por curiosidad se queda ahí para siempre.
 */
function SelectorDeIcono({
  valor,
  onElegir,
}: {
  valor: string | null;
  onElegir: (icono: string | null) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Icono</legend>

      <div className={cn(BLOQUE, 'max-h-48 overflow-y-auto')}>
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
          {ICONOS_DE_GRUPO.map(({ nombre, etiqueta }) => {
            const elegido = valor === nombre;

            return (
              <button
                key={nombre}
                type="button"
                // Pulsar el que ya está puesto lo quita: es el gesto que todo
                // el mundo prueba para deshacer una elección, y sin él haría
                // falta un botón de "ninguno" ocupando una plaza de la rejilla.
                onClick={() => onElegir(elegido ? null : nombre)}
                aria-pressed={elegido}
                title={etiqueta}
                aria-label={etiqueta}
                className={cn(
                  'grid aspect-square place-items-center rounded-md transition-colors',
                  'movil:min-h-[42px]',
                  elegido
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <IconoDeCategoria nombre={nombre} className="size-4" />
              </button>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

/**
 * Crear o editar un centro de costos.
 *
 * ── Por qué en una ficha y no en la propia pantalla ─────────────────────────
 * Porque crear un centro se hace dos o tres veces en la vida de una cuenta, y
 * el formulario ocupaba la primera pantalla entera todos los demás días. Lo
 * que se mira aquí a diario es la estructura que ya existe; crear es una
 * excepción, y las excepciones van detrás de un botón.
 *
 * ── Por qué crear y editar son la MISMA ficha ───────────────────────────────
 * Porque los campos son los mismos —el nombre y si es estático— y la única
 * diferencia es de dónde salen sus valores iniciales. Dos fichas se separan:
 * una aprende un campo nuevo y la otra no, y entonces hay cosas que solo se
 * pueden poner al crear.
 *
 * Y editar hacía falta: los centros y los grupos no se podían renombrar desde
 * ningún sitio. Un nombre mal escrito obligaba a borrar el centro entero —con
 * sus grupos y sus conceptos— y volver a armarlo.
 */
export function CategoriaModal({
  abierta,
  nivel,
  categoria,
  padreId,
  onCerrar,
}: {
  abierta: boolean;
  /**
   * Qué se está tocando. Cambia el título, la ayuda y si aparece el
   * interruptor: lo estático se lee del CENTRO, que es el nivel de arriba, y
   * un grupo hereda lo que diga el suyo.
   */
  nivel: 'centro' | 'grupo';
  /** Con una categoría, se edita. Sin ella, se crea. */
  categoria?: Category | null;
  /** Al crear un grupo, de qué centro cuelga. */
  padreId?: number;
  onCerrar: () => void;
}) {
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const [nombre, setNombre] = useState('');
  const [estatico, setEstatico] = useState(false);
  const [icono, setIcono] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editando = categoria != null;
  const guardando = crear.isPending || actualizar.isPending;
  const esCentro = nivel === 'centro';

  // Se rellena en cada apertura con lo que toque: sin esto, lo que se canceló
  // la vez anterior reaparece escrito la siguiente.
  useEffect(() => {
    if (!abierta) return;
    setNombre(categoria?.name ?? '');
    setEstatico(categoria?.estatico ?? false);
    setIcono(categoria?.icon ?? null);
    setError(null);
  }, [abierta, categoria]);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    try {
      if (editando) {
        await actualizar.mutateAsync({
          id: Number(categoria.id),
          cambios: esCentro
            ? { name: nombre.trim(), estatico }
            : { name: nombre.trim(), icon: icono },
        });
      } else {
        await crear.mutateAsync({
          name: nombre.trim(),
          kind: 'expense',
          ...(esCentro
            ? { estatico }
            : { parent_id: padreId, ...(icono ? { icon: icono } : {}) }),
        });
      }
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo guardar.');
    }
  }

  return (
    <Modal
      abierta={abierta}
      titulo={`${editando ? 'Editar' : 'Nuevo'} ${esCentro ? 'centro de costos' : 'grupo'}`}
      ayuda={
        esCentro
          ? 'El nivel más general: Costos fijos, Variables, Negocio.'
          : 'El nivel de en medio: Servicios públicos, Educación, Transporte.'
      }
      onCerrar={onCerrar}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
        <Campo etiqueta="Nombre" id="categoria-nombre">
          <Input
            id="categoria-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Costos fijos, Negocio…"
            maxLength={255}
            required
          />
        </Campo>

        {/*
          El selector de icono, solo en los grupos.

          No está en los centros porque ahí no se ve: la fila de un centro ya
          lleva su flecha de desplegar a la izquierda del nombre, y un segundo
          símbolo al lado sería un icono compitiendo con un control.

          Y es una REJILLA y no un desplegable: cincuenta iconos en una lista
          hay que abrirla, recorrerla y cerrarla; abiertos a la vez se
          reconocen mirando, que es para lo que existe un icono. Ocupa cuatro
          filas de ocho, con su propio desplazamiento para no estirar la ficha.
        */}
        {!esCentro && <SelectorDeIcono valor={icono} onElegir={setIcono} />}

        {/*
          El interruptor a la DERECHA y dentro de una caja.

          Suelto y a la izquierda quedaba flotando entre dos campos, con tres
          renglones de letra pequeña colgando a su lado: se leía como una nota
          al pie y no como el control que es. La caja lo vuelve una fila de
          ajustes —nombre a un lado, estado al otro— que es la forma en la que
          ya se lee un interruptor en cualquier parte.

          La etiqueta envuelve las dos cosas, así que el texto entero es
          pulsable: en un teléfono es la diferencia entre acertarle y no.

          Y la explicación, corta. El porqué largo —que los costos fijos no se
          improvisan, que un clic distraído mueve plata sin que nadie lo note—
          vive en el código, no en el formulario.
        */}
        {/* Solo en los centros: lo estático se lee del nivel de arriba, y un
            grupo hereda lo que diga el suyo. Ofrecerlo en un grupo sería un
            interruptor que no hace nada. */}
        {esCentro && (
          <label className={cn(BLOQUE, 'flex cursor-pointer items-center justify-between gap-4')}>
            <span className="min-w-0">
              <span className="block text-sm font-medium">Estático</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                La clasificación de sus movimientos solo se modifica desde Centros de
                costos.
              </span>
            </span>
            <Interruptor checked={estatico} onChange={(e) => setEstatico(e.target.checked)} />
          </label>
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
          <Button type="submit" disabled={guardando || nombre.trim() === ''}>
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {editando ? 'Guardar' : 'Crear'}
          </Button>
        </PieDeModal>
      </form>
    </Modal>
  );
}
