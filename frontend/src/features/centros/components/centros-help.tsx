import { X } from 'lucide-react';

import { Button } from '@/shared/ui/atoms/button';
import { Card, CardContent } from '@/shared/ui/atoms/card';

/** El modelo explicado con el ejemplo más común, no en abstracto. */
export function Explicacion({ onCerrar }: { onCerrar: () => void }) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold">Cómo funciona</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tres niveles. Cada movimiento se guarda en el último, y los de arriba suman solos.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm-icon"
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
            explicacion="El bloque grande de tu dinero."
            ejemplo="Costos fijos"
          />
          <Nivel
            numero={2}
            nombre="Categoría"
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

        <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Así, <strong className="text-foreground">¿cuánto se gastó en servicios públicos?</strong>{' '}
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
