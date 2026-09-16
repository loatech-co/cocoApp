import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  EllipsisVertical,
  Lock,
  LockOpen,
  Loader2,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Menu, MenuOpcion } from '@/components/menu';
import { Confirmacion } from '@/components/ui/confirmacion';
import { CentroModal } from '@/features/centros/centro-modal';
import { ConceptoModal } from '@/features/centros/concepto-modal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import {
  useActualizarCategoria,
  useCategories,
  useCrearCategoria,
  useEliminarCategoria,
} from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Category } from '@coco/types';

/**
 * Centros de costos.
 *
 * Es la pantalla donde se define la FORMA de los reportes, así que explica el
 * modelo en vez de dar por sentado que se entiende. Alguien que abre esto por
 * primera vez tiene que salir sabiendo qué es un grupo y por qué existe.
 */
export function CentrosPage() {
  const categorias = useCategories();

  const [creando, setCreando] = useState(false);
  const [verAyuda, setVerAyuda] = useState(false);

  const arbol = categorias.data ?? [];

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* El botón al extremo opuesto del título, como en el resto de la app:
          es la única acción de la pantalla y se busca siempre en la misma
          esquina. */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Centros de costos
            </h1>
            {/* La explicación se enseña una vez y estorba el resto de las
                veces. Detrás del signo de interrogación sigue estando para
                quien la necesite, sin ocupar media pantalla para quien ya la
                leyó. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-pressed={verAyuda}
              aria-label={verAyuda ? 'Ocultar cómo funciona' : 'Cómo funciona'}
              title={verAyuda ? 'Ocultar cómo funciona' : 'Cómo funciona'}
              onClick={() => setVerAyuda((v) => !v)}
            >
              <CircleHelp className="size-5" aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            La estructura con la que se ordena tu plata.
          </p>
        </div>

        <Button type="button" onClick={() => setCreando(true)} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          Nuevo centro de costos
        </Button>
      </header>

      {verAyuda && <Explicacion onCerrar={() => setVerAyuda(false)} />}

      {categorias.isPending && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      )}

      {arbol.length === 0 && !categorias.isPending && (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay centros de costos.
            </p>
            {/* El botón aquí además de arriba: en una pantalla vacía, lo
                único que se puede hacer tiene que estar donde se está
                mirando. */}
            <Button type="button" onClick={() => setCreando(true)} className="mt-4">
              <Plus className="size-4" aria-hidden="true" />
              Crear un centro de costos
            </Button>
          </CardContent>
        </Card>
      )}

      {arbol.map((centro) => (
        <Centro key={centro.id} centro={centro} />
      ))}

      <CentroModal abierta={creando} onCerrar={() => setCreando(false)} />
    </div>
  );
}

/** El modelo explicado con el ejemplo más común, no en abstracto. */
function Explicacion({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Cómo funciona</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tres niveles. Cada movimiento se guarda en el último, y los de
              arriba suman solos.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCerrar}
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          <Nivel
            numero={1}
            nombre="Centro de costos"
            explicacion="El bloque grande de tu plata."
            ejemplo="Costos fijos"
          />
          <Nivel
            numero={2}
            nombre="Grupo"
            explicacion="Un tipo de gasto dentro de ese bloque."
            ejemplo="Servicios públicos"
          />
          <Nivel
            numero={3}
            nombre="Concepto"
            explicacion="A quién le pagas. Aquí van los movimientos."
            ejemplo="Celsia (Energía)"
          />
        </ol>

        <p className="mt-4 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          Así, <strong className="text-foreground">¿cuánto se fue en servicios públicos?</strong>{' '}
          es la suma de sus conceptos, y no hay que registrarlo por separado en ningún lado.
        </p>
      </CardContent>
    </Card>
  );
}

function Nivel({
  numero,
  nombre,
  explicacion,
  ejemplo,
}: {
  numero: number;
  nombre: string;
  explicacion: string;
  ejemplo: string;
}) {
  return (
    <li className="flex gap-3" style={{ paddingLeft: `${(numero - 1) * 1.25}rem` }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {numero}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{nombre}</span>
        <span className="block text-sm text-muted-foreground">
          {explicacion} Ej: <em className="text-foreground">{ejemplo}</em>
        </span>
      </span>
    </li>
  );
}

function Centro({ centro }: { centro: Category }) {
  const [abierto, setAbierto] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const eliminar = useEliminarCategoria();
  const actualizar = useActualizarCategoria();
  const grupos = centro.children ?? [];
  const conceptos = grupos.reduce((n, g) => n + (g.children?.length ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-0">
        {/*
          El resaltado va en la FILA, no en el botón.

          Puesto en el botón, se detenía justo antes del kebab —que está fuera
          de él para que pulsarlo no despliegue el centro— y dejaba un trozo sin
          iluminar. Y como el botón es rectangular, sus esquinas cuadradas
          asomaban por encima de las redondeadas de la tarjeta.
        */}
        <div
          className={cn(
            'flex items-center gap-2 pr-4 transition-colors hover:bg-secondary sm:pr-6',
            'rounded-t-2xl',
            // Cerrado, la fila ES la tarjeta: se redondea también por abajo.
            !abierto && 'rounded-b-2xl',
          )}
        >
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left sm:p-6"
          >
            {abierto ? (
              <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-xl font-semibold">{centro.name}</span>
                {/* El candado y no la palabra "estático": es un estado del
                    centro, y en una lista se reconoce antes por su forma que
                    leyendo una etiqueta en cada fila. */}
                {centro.estatico && (
                  <Lock
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-label="Centro estático"
                  />
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {grupos.length} grupo(s) · {conceptos} concepto(s)
              </span>
            </span>
          </button>

          {/* Fuera del botón que despliega: dentro, pulsarlo abriría el centro
              además de abrir el menú, porque el clic llega a los dos. */}
          <Menu
            etiqueta={`Acciones de ${centro.name}`}
            Icono={EllipsisVertical}
            soloIcono
            variante="ghost"
          >
            {(cerrar) => (
              <>
                {/* Poder cambiarlo después, no solo al crearlo: los centros que
                    ya existían nacieron antes de que esto existiera. */}
                <MenuOpcion
                  Icono={centro.estatico ? LockOpen : Lock}
                  onClick={() => {
                    cerrar();
                    actualizar.mutate({
                      id: Number(centro.id),
                      cambios: { estatico: !centro.estatico },
                    });
                  }}
                >
                  {centro.estatico ? 'Marcar como dinámico' : 'Marcar como estático'}
                </MenuOpcion>
                <MenuOpcion
                  Icono={Trash2}
                  peligro
                  onClick={() => {
                    cerrar();
                    setConfirmando(true);
                  }}
                >
                  Eliminar
                </MenuOpcion>
              </>
            )}
          </Menu>
        </div>

        <Confirmacion
          abierta={confirmando}
          titulo={`¿Eliminar “${centro.name}”?`}
          peligrosa
          etiquetaConfirmar="Eliminar"
          ocupada={eliminar.isPending}
          onCancelar={() => setConfirmando(false)}
          onConfirmar={() =>
            eliminar.mutate(centro.id, { onSuccess: () => setConfirmando(false) })
          }
        >
          Se borra y no se puede deshacer. Si tiene movimientos, el sistema se
          niega: no se elimina nada que deje filas sin clasificar.
        </Confirmacion>

        {abierto && (
          <div className="border-t border-border p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              {grupos.map((grupo) => (
                <Grupo key={grupo.id} grupo={grupo} />
              ))}

              {grupos.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Este centro no tiene grupos todavía.
                </p>
              )}

              <Agregar
                padreId={centro.id}
                etiqueta="Agregar grupo"
                marcador="Servicios públicos, Educación…"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Grupo({ grupo }: { grupo: Category }) {
  const [editando, setEditando] = useState<Category | null>(null);
  const [creando, setCreando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const eliminar = useEliminarCategoria();
  const conceptos = grupo.children ?? [];

  return (
    <div className="rounded-2xl bg-secondary/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{grupo.name}</h3>
        {/* El mismo menú que en el centro: un icono suelto no tiene dónde
            pulsarse —en un teléfono hay que acertarle a 16px— y no se ve como
            algo pulsable hasta que uno lo prueba. */}
        <Menu
          etiqueta={`Acciones de ${grupo.name}`}
          Icono={EllipsisVertical}
          soloIcono
          variante="ghost"
        >
          {(cerrar) => (
            <MenuOpcion
              Icono={Trash2}
              peligro
              onClick={() => {
                cerrar();
                setConfirmando(true);
              }}
            >
              Eliminar
            </MenuOpcion>
          )}
        </Menu>
      </div>

      {conceptos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {conceptos.map((concepto) => (
            <li key={concepto.id}>
              {/* Se abren para editar: renombrar y decir si se pagan solos.
                  Antes eran texto muerto, y el único modo de corregir un
                  nombre mal escrito era borrar el concepto y crearlo de nuevo
                  —con lo que los movimientos se quedaban sin clasificar—. */}
              <button
                type="button"
                onClick={() => setEditando(concepto)}
                title={`Editar ${concepto.name}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs text-card-foreground',
                  // Se OSCURECE. `background` es más oscuro que `card` en los
                  // dos temas —bosque-925 contra bosque-900 en oscuro, el
                  // tinte contra el blanco en claro—, así que el chip se
                  // separa de su fondo sin cambiar de color ni ganar bordes.
                  //
                  // Aclarándolo no servía: la caja del grupo ya es
                  // `secondary/60`, y el chip acababa del color de su propio
                  // fondo justo cuando se lo estaba señalando.
                  'transition-colors hover:bg-background',
                )}
              >
                {concepto.recurrente && (
                  <Repeat
                    className="size-3 shrink-0 opacity-70"
                    aria-label="Se paga cada cierto tiempo"
                  />
                )}
                {concepto.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreando(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Agregar concepto
        </Button>
      </div>

      <Confirmacion
        abierta={confirmando}
        titulo={`¿Eliminar “${grupo.name}”?`}
        peligrosa
        etiquetaConfirmar="Eliminar"
        ocupada={eliminar.isPending}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          eliminar.mutate(grupo.id, { onSuccess: () => setConfirmando(false) })
        }
      >
        Se borra y no se puede deshacer. Si tiene movimientos, el sistema se
        niega: no se elimina nada que deje filas sin clasificar.
      </Confirmacion>

      <ConceptoModal
        abierta={editando !== null}
        concepto={editando}
        onCerrar={() => setEditando(null)}
      />
      <ConceptoModal abierta={creando} grupoId={grupo.id} onCerrar={() => setCreando(false)} />
    </div>
  );
}

/** Un campo que aparece al pedirlo: tener veinte inputs abiertos a la vez satura. */
function Agregar({
  padreId,
  etiqueta,
  marcador,
}: {
  padreId: number;
  etiqueta: string;
  marcador: string;
}) {
  const crear = useCrearCategoria();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function guardar(): Promise<void> {
    const name = nombre.trim();
    if (!name) return;
    setError(null);
    try {
      await crear.mutateAsync({ name, kind: 'expense', parent_id: padreId });
      setNombre('');
      setAbierto(false);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5',
          'text-xs font-medium text-primary transition-colors hover:bg-accent',
        )}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {etiqueta}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void guardar();
            if (e.key === 'Escape') setAbierto(false);
          }}
          placeholder={marcador}
          aria-label={etiqueta}
          maxLength={255}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void guardar()}
            disabled={crear.isPending || !nombre.trim()}
            className="flex-1 sm:flex-none"
          >
            {crear.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Guardar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setAbierto(false)}
            className="flex-1 sm:flex-none"
          >
            Cancelar
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
