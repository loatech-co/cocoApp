import { Plus, ScanText } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import { Campo } from '@/components/ui/campo';
import { Chip } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { conceptoQueYaLaUsa, limpiar, partir, porQueNoEntra } from '@/lib/palabras-clave';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';

/**
 * Las palabras que hacen que un recibo se reconozca solo.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Al adjuntar un soporte, la ficha del movimiento lo lee y rellena el valor,
 * la fecha y el concepto. Lo hace con un catálogo de firmas que salió de 443
 * recibos reales, y por eso sabe reconocer a los acreedores de quien los
 * trajo: el primer recibo de una inmobiliaria que no esté ahí no se reconoce,
 * y hasta hoy la única salida era abrir el código.
 *
 * Aquí se escribe lo que dice ESE recibo —«Comfandi», el NIT— y el siguiente
 * entra clasificado. Lo escrito gana al catálogo: ver `PRIORIDAD_DE_LO_ESCRITO`.
 *
 * ── Por qué en el concepto y no en una pantalla de reglas ───────────────────
 * Porque el momento en que uno sabe qué palabra reconoce un recibo es el
 * momento en que lo tiene delante, y el sitio donde se dice qué es cada cosa
 * ya existe: Centros de costos. Una pantalla aparte de «reglas de lectura»
 * sería un segundo mapa que mantener de acuerdo con el primero.
 *
 * ── Por qué se escriben y se ven como chips ─────────────────────────────────
 * Porque son una lista corta de cosas cortas. En un campo de texto con comas
 * —que es la otra forma— no se ve dónde acaba una y empieza la otra, y quitar
 * la del medio es editar una cadena a mano.
 */
export function CamposDePalabrasClave({
  valor,
  onCambiar,
  arbol,
  conceptoId,
  className,
}: {
  valor: string[];
  onCambiar: (siguiente: string[]) => void;
  /** Para avisar si otra palabra ya está puesta en otro concepto. */
  arbol?: readonly Category[];
  /** El concepto que se está editando, para no avisar de sí mismo. */
  conceptoId?: Category['id'];
  className?: string;
}) {
  const [escrita, setEscrita] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  /**
   * Añade lo que haya escrito. Devuelve lo que no pudo entrar, para dejarlo en
   * la caja: borrar lo que alguien acaba de teclear sin decir por qué es la
   * forma más rápida de que deje de escribir.
   */
  function añadir(): void {
    const candidatas = partir(escrita);
    if (candidatas.length === 0) {
      setEscrita('');
      return;
    }

    const puestas = [...valor];
    const rechazadas: string[] = [];
    let primerAviso: string | null = null;

    for (const candidata of candidatas) {
      const problema = porQueNoEntra(candidata, puestas);
      if (problema) {
        primerAviso ??= problema;
        rechazadas.push(candidata);
        continue;
      }
      puestas.push(limpiar(candidata));
    }

    if (puestas.length !== valor.length) onCambiar(puestas);
    setEscrita(rechazadas.join(', '));
    setAviso(primerAviso);
  }

  function alTeclear(evento: KeyboardEvent<HTMLInputElement>): void {
    /*
      Enter añade, y NO envía el formulario.

      Sin el `preventDefault`, teclear una palabra y pulsar Enter —que es el
      gesto con el que se escribe una lista— guardaba el concepto con la
      palabra a medio escribir y cerraba la ficha.
    */
    if (evento.key === 'Enter') {
      evento.preventDefault();
      añadir();
      return;
    }

    // Retroceso con la caja vacía quita la última: es como se corrige una
    // lista de chips en cualquier parte, y ahorra apuntar a un aspa de 16px.
    if (evento.key === 'Backspace' && escrita === '' && valor.length > 0) {
      onCambiar(valor.slice(0, -1));
      setAviso(null);
    }
  }

  const enOtroConcepto = valor
    .map((palabra) => ({ palabra, otro: conceptoQueYaLaUsa(arbol ?? [], palabra, conceptoId) }))
    .find((par) => par.otro !== undefined);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Campo
        etiqueta="Palabras clave"
        id="concepto-palabras-clave"
        ayuda="Lo que dice el recibo y no cambia de un mes a otro: el acreedor, su NIT. Pulsa Enter para agregar cada una."
      >
        <Input
          id="concepto-palabras-clave"
          value={escrita}
          onChange={(e) => {
            setEscrita(e.target.value);
            if (aviso) setAviso(null);
          }}
          onKeyDown={alTeclear}
          // Lo tecleado y no confirmado entra igual al salir del campo: si no,
          // escribir la palabra y pulsar «Guardar» la pierde en silencio, y
          // nadie relee una lista para comprobar que está lo que acaba de
          // escribir.
          onBlur={añadir}
          placeholder="Aquaoccidente, 805027653…"
          icono={ScanText}
          acciones={[
            <button
              key="añadir"
              type="button"
              // Enter ya lo hace, pero en un teléfono el teclado no siempre
              // enseña un Enter y este es el único sitio donde se ve que la
              // caja no guarda una frase sino una lista.
              onClick={añadir}
              disabled={limpiar(escrita) === ''}
              aria-label="Agregar la palabra clave"
              title="Agregar"
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-muted-foreground',
                'transition-colors hover:bg-muted hover:text-foreground',
                'disabled:pointer-events-none disabled:opacity-40',
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>,
          ]}
        />
      </Campo>

      {valor.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {valor.map((palabra) => (
            <li key={palabra}>
              {/* El nombre no abre nada: solo se quita. Por eso va sin
                  `onClick`, y el chip lo pinta como texto en vez de como un
                  botón que no haría nada. */}
              <Chip
                onQuitar={() => {
                  onCambiar(valor.filter((suya) => suya !== palabra));
                  setAviso(null);
                }}
                etiquetaDeQuitar={`Quitar ${palabra}`}
                className="max-w-full"
              >
                {palabra}
              </Chip>
            </li>
          ))}
        </ul>
      )}

      {/*
        Los dos avisos, en gris y no en rojo.

        Ninguno es un error: uno dice que una palabra no entró y por qué, y el
        otro que ya está puesta en otro concepto —que se puede hacer, y a veces
        es lo que se quiere—. El rojo es para lo que salió mal.
      */}
      {aviso && <p className="text-xs leading-relaxed text-muted-foreground">{aviso}</p>}

      {!aviso && enOtroConcepto?.otro && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          “{enOtroConcepto.palabra}” también está en{' '}
          <strong className="font-medium text-foreground">{enOtroConcepto.otro.name}</strong>. Un
          recibo que la diga puede caer en cualquiera de los dos.
        </p>
      )}
    </div>
  );
}
