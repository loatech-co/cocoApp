import {} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select } from '@/components/ui/select';
import type { ColumnaDetectada, Papel } from './parseo/csv-columnas';

/**
 * Qué columna es qué, con opción de corregirlo.
 *
 * ── Por qué se muestra siempre y no solo cuando falla ───────────────────────
 * La detección acierta la mayoría de las veces, pero cuando se equivoca lo hace
 * en silencio: tomaría la columna de saldo por el monto y el archivo entero
 * entraría mal. Enseñar lo detectado convierte un error invisible en uno obvio
 * antes de importar nada.
 */

const PAPELES: { valor: Papel; etiqueta: string }[] = [
  { valor: 'fecha', etiqueta: 'Fecha' },
  { valor: 'monto', etiqueta: 'Monto' },
  { valor: 'descripcion', etiqueta: 'Descripción' },
  { valor: 'tipo', etiqueta: 'Tipo' },
  { valor: 'categoria', etiqueta: 'Categoría' },
  { valor: 'ignorar', etiqueta: 'Ignorar' },
];

const NOMBRE: Record<string, string> = {
  fecha: 'la fecha',
  monto: 'el monto',
};

export function MapeoDeColumnas({
  columnas,
  faltan,
  onCambiar,
}: {
  columnas: readonly ColumnaDetectada[];
  faltan: readonly string[];
  onCambiar: (columnas: ColumnaDetectada[]) => void;
}) {
  function asignar(indice: number, papel: Papel): void {
    onCambiar(
      columnas.map((columna) => {
        if (columna.indice === indice) return { ...columna, papel };
        // Un papel solo puede estar en una columna: al asignarlo aquí, se
        // libera de donde estuviera. Sin esto se acabaría con dos "monto" y el
        // parser tomaría uno de los dos sin criterio.
        if (papel !== 'ignorar' && columna.papel === papel) {
          return { ...columna, papel: 'ignorar' as const };
        }
        return columna;
      }),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {faltan.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>
            No se reconoció {faltan.map((papel) => NOMBRE[papel] ?? papel).join(' ni ')}
          </AlertTitle>
          <AlertDescription>
            Indica abajo qué columna corresponde. Sin fecha y monto no se puede importar nada.
          </AlertDescription>
        </Alert>
      )}

      <div>
        <p className="text-sm font-medium">Qué es cada columna</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Se detectó automáticamente. Corrige lo que esté mal antes de continuar.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {columnas.map((columna) => (
          <li key={columna.indice} className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={columna.cabecera}>
              {columna.cabecera || <span className="text-muted-foreground">(sin nombre)</span>}
            </span>

            <label className="sr-only" htmlFor={`papel-${columna.indice}`}>
              Papel de la columna {columna.cabecera}
            </label>
            <Select
              tamano="sm"
              id={`papel-${columna.indice}`}
              etiqueta="Qué contiene esta columna"
              className="w-40 shrink-0"
              valor={columna.papel}
              opciones={PAPELES.map((papel) => ({
                valor: papel.valor,
                etiqueta: papel.etiqueta,
              }))}
              onCambiar={(v) => asignar(columna.indice, v as Papel)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
