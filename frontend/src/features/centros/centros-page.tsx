import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiClientError } from '@/lib/api-client';
import { useCategories, useCrearCategoria, useEliminarCategoria } from '@/lib/queries';
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
  const crear = useCrearCategoria();

  const [nuevoCentro, setNuevoCentro] = useState('');
  const [error, setError] = useState<string | null>(null);

  const arbol = categorias.data ?? [];

  async function crearCentro(): Promise<void> {
    const name = nuevoCentro.trim();
    if (!name) return;
    setError(null);
    try {
      await crear.mutateAsync({ name, kind: 'expense' });
      setNuevoCentro('');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Centros de costos
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          La estructura con la que se ordena tu plata.
        </p>
      </header>

      <Explicacion />

      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-xl font-semibold">Crear un centro de costos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El nivel más general. Por ejemplo: <em>Costos fijos</em>, <em>Variables</em>,{' '}
            <em>Negocio</em>.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              value={nuevoCentro}
              onChange={(e) => setNuevoCentro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void crearCentro();
              }}
              placeholder="Nombre del centro de costos"
              aria-label="Nombre del centro de costos"
              maxLength={255}
            />
            <Button
              type="button"
              onClick={() => void crearCentro()}
              disabled={crear.isPending || !nuevoCentro.trim()}
              className="shrink-0"
            >
              {crear.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              <Plus className="size-4" aria-hidden="true" />
              Crear
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

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
              Todavía no hay centros de costos. Crea el primero arriba.
            </p>
          </CardContent>
        </Card>
      )}

      {arbol.map((centro) => (
        <Centro key={centro.id} centro={centro} />
      ))}
    </div>
  );
}

/** El modelo explicado con el ejemplo más común, no en abstracto. */
function Explicacion() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-xl font-semibold">Cómo funciona</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tres niveles. Cada movimiento se guarda en el último, y los de arriba
          suman solos.
        </p>

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
  const grupos = centro.children ?? [];
  const conceptos = grupos.reduce((n, g) => n + (g.children?.length ?? 0), 0);

  return (
    <Card>
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-secondary sm:p-6"
        >
          {abierto ? (
            <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xl font-semibold">{centro.name}</span>
            <span className="block text-xs text-muted-foreground">
              {grupos.length} grupo(s) · {conceptos} concepto(s)
            </span>
          </span>
        </button>

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
  const eliminar = useEliminarCategoria();
  const conceptos = grupo.children ?? [];

  return (
    <div className="rounded-2xl bg-secondary/60 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-semibold">{grupo.name}</h3>
        <button
          type="button"
          onClick={() => {
            if (conceptos.length > 0) return;
            eliminar.mutate(grupo.id);
          }}
          disabled={conceptos.length > 0 || eliminar.isPending}
          title={
            conceptos.length > 0
              ? 'Primero hay que vaciar el grupo: borrarlo con conceptos dentro los dejaría huérfanos'
              : 'Eliminar grupo'
          }
          aria-label={`Eliminar el grupo ${grupo.name}`}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-card hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>

      {conceptos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {conceptos.map((concepto) => (
            <li
              key={concepto.id}
              className="rounded-full bg-card px-2.5 py-1 text-xs text-card-foreground"
            >
              {concepto.name}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Agregar padreId={grupo.id} etiqueta="Agregar concepto" marcador="Celsia, Claro Móvil…" />
      </div>
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
