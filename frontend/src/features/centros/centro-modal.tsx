import { Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Interruptor } from '@/components/ui/interruptor';
import { Campo } from '@/components/ui/campo';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api-client';
import { useCrearCategoria } from '@/lib/queries';

/**
 * Crear un centro de costos.
 *
 * ── Por qué en una ficha y no en la propia pantalla ─────────────────────────
 * Porque crear un centro se hace dos o tres veces en la vida de una cuenta, y
 * el formulario ocupaba la primera pantalla entera todos los demás días. Lo
 * que se mira aquí a diario es la estructura que ya existe; crear es una
 * excepción, y las excepciones van detrás de un botón.
 */
export function CentroModal({ abierta, onCerrar }: { abierta: boolean; onCerrar: () => void }) {
  const crear = useCrearCategoria();
  const [nombre, setNombre] = useState('');
  const [estatico, setEstatico] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se vacía en cada apertura: sin esto, lo que se canceló la vez anterior
  // reaparece escrito la siguiente.
  useEffect(() => {
    if (!abierta) return;
    setNombre('');
    setEstatico(false);
    setError(null);
  }, [abierta]);

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    try {
      await crear.mutateAsync({ name: nombre.trim(), kind: 'expense', estatico });
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  return (
    <Modal
      abierta={abierta}
      titulo="Nuevo centro de costos"
      ayuda="El nivel más general: Costos fijos, Variables, Negocio."
      onCerrar={onCerrar}
    >
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
        <Campo etiqueta="Nombre" id="centro-nombre">
          <Input
            id="centro-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Costos fijos, Negocio…"
            maxLength={255}
            required
            autoFocus
          />
        </Campo>

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
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-border bg-muted/60 p-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Estático</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              La clasificación de sus movimientos solo se modifica desde Centros de
              costos.
            </span>
          </span>
          <Interruptor checked={estatico} onChange={(e) => setEstatico(e.target.checked)} />
        </label>

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
            disabled={crear.isPending || nombre.trim() === ''}
            className="flex-1"
          >
            {crear.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
