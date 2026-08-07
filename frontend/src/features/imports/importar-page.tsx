import type { Account } from '@coco/types';
import { AlertCircle, FileText, Loader2, ScanLine, Upload } from 'lucide-react';
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/api-client';
import { useAccounts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useCrearLote } from './imports-queries';
import { proveedorPara, TIPOS_ACEPTADOS, type ProgresoDeOcr } from './ocr';
import { parsearExtracto, type ResultadoDeParseo } from './parseo/extracto';

/**
 * Importar un extracto.
 *
 * El documento NUNCA se sube. Se lee aquí, en el navegador, y lo único que
 * viaja al servidor son los movimientos ya parseados. La diferencia importa:
 * un extracto trae el número de cuenta, los saldos y el nombre del titular,
 * y nada de eso tiene por qué salir del equipo.
 */
export function ImportarPage() {
  const navegar = useNavigate();
  const cuentas = useAccounts();
  const crearLote = useCrearLote();

  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [progreso, setProgreso] = useState<ProgresoDeOcr | null>(null);
  const [resultado, setResultado] = useState<
    (ResultadoDeParseo & { archivo: string; proveedor: string; esPdf: boolean }) | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const activas = cuentas.data?.filter((cuenta) => !cuenta.is_archived) ?? [];
  const cuentaElegida = cuentaId ?? activas[0]?.id ?? null;

  async function leer(archivo: File): Promise<void> {
    setError(null);
    setResultado(null);

    const proveedor = proveedorPara(archivo);
    if (!proveedor) {
      setError('Ese tipo de archivo no se puede leer. Usa una imagen o un PDF.');
      return;
    }

    setProgreso({ avance: 0, etapa: 'Empezando…' });

    try {
      const texto = await proveedor.extraerTexto(archivo, setProgreso);
      const esPdf = archivo.type === 'application/pdf';

      if (!texto.trim()) {
        setError(
          esPdf
            ? 'Este PDF no trae texto: probablemente sea un escaneo. Haz una captura de pantalla y súbela como imagen.'
            : 'No se pudo leer nada de esa imagen. Prueba con una captura más nítida y recortada a la tabla de movimientos.',
        );
        return;
      }

      const parseado = parsearExtracto(texto);
      if (parseado.movimientos.length === 0) {
        setError(
          'Se leyó el documento pero no se reconoció ningún movimiento. Revisa que la captura incluya las fechas y los montos.',
        );
        return;
      }

      setResultado({
        ...parseado,
        archivo: archivo.name,
        proveedor: proveedor.nombre,
        esPdf,
      });
    } catch {
      setError('Algo falló leyendo el documento. Inténtalo de nuevo.');
    } finally {
      setProgreso(null);
    }
  }

  function subir(): void {
    if (!resultado || !cuentaElegida) return;

    crearLote.mutate(
      {
        account_id: cuentaElegida,
        source: resultado.esPdf ? 'pdf' : 'image',
        label: resultado.archivo,
        ocr_provider: resultado.proveedor,
        rows: resultado.movimientos.map((movimiento) => ({
          date: movimiento.date,
          amount: movimiento.amount,
          type: movimiento.type,
          description: movimiento.description || undefined,
        })),
      },
      { onSuccess: (lote) => navegar(`/importar/${lote.id}`) },
    );
  }

  const errorAlSubir =
    crearLote.error instanceof ApiClientError ? crearLote.error.message : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Importar movimientos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube una captura o el PDF de tu extracto. Se lee <strong>en tu dispositivo</strong>: el
          documento no sale de aquí.
        </p>
      </header>

      {activas.length === 0 && !cuentas.isPending && (
        <Alert variant="warning">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Primero necesitas una cuenta</AlertTitle>
          <AlertDescription>
            Los movimientos tienen que entrar a alguna parte. Crea una cuenta y vuelve.
          </AlertDescription>
        </Alert>
      )}

      {activas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>1. ¿A qué cuenta pertenece?</CardTitle>
          </CardHeader>
          <CardContent>
            <Label htmlFor="cuenta" className="sr-only">
              Cuenta
            </Label>
            <select
              id="cuenta"
              className="h-11 w-full max-w-sm rounded-md border border-input bg-background px-3 text-sm"
              value={cuentaElegida ?? ''}
              onChange={(evento) => setCuentaId(Number(evento.target.value))}
            >
              {activas.map((cuenta: Account) => (
                <option key={cuenta.id} value={cuenta.id}>
                  {cuenta.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      )}

      {activas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. El documento</CardTitle>
            <CardDescription>
              Un PDF de extracto se lee exacto. Una captura pasa por reconocimiento de texto y
              puede traer errores — por eso hay un paso de revisión.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {progreso ? (
              <Progreso progreso={progreso} />
            ) : (
              <ZonaDeSoltar
                arrastrando={arrastrando}
                onArrastrar={setArrastrando}
                onArchivo={(archivo) => void leer(archivo)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>3. Lo que se reconoció</CardTitle>
            <CardDescription>
              Nada de esto ha tocado tus finanzas todavía. En el siguiente paso lo revisas y
              corriges antes de confirmar.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            <p className="text-sm">
              <strong className="font-serif text-2xl">{resultado.movimientos.length}</strong>{' '}
              movimientos en <span className="text-muted-foreground">{resultado.archivo}</span>
            </p>

            {resultado.huboColumnaDeSaldo && (
              <p className="text-xs text-muted-foreground">
                El documento traía una columna de saldo corriente. Se tomó el monto del
                movimiento, no el saldo.
              </p>
            )}

            {resultado.lineasIgnoradas.length > 0 && (
              <Alert variant="warning">
                <AlertCircle aria-hidden="true" />
                <AlertTitle>
                  {resultado.lineasIgnoradas.length}{' '}
                  {resultado.lineasIgnoradas.length === 1 ? 'línea' : 'líneas'} sin fecha
                </AlertTitle>
                <AlertDescription>
                  Tenían cifras pero no se les pudo asignar una fecha, así que se dejaron fuera.
                  Si faltan movimientos, están aquí.
                  <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs">
                    {resultado.lineasIgnoradas.map((linea, indice) => (
                      <li key={`${linea}-${indice}`} className="truncate">
                        {linea}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {errorAlSubir && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{errorAlSubir}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={subir} disabled={crearLote.isPending || !cuentaElegida}>
                {crearLote.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Revisar los {resultado.movimientos.length} movimientos
              </Button>
              <Button variant="ghost" onClick={() => setResultado(null)}>
                Empezar de nuevo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Progreso({ progreso }: { progreso: ProgresoDeOcr }) {
  const porcentaje = Math.round(progreso.avance * 100);

  return (
    <div className="flex flex-col gap-3 py-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        <ScanLine className="size-4 animate-pulse text-primary" aria-hidden="true" />
        {progreso.etapa}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {porcentaje}% · Todo ocurre en tu dispositivo; el documento no se sube a ninguna parte.
      </p>
    </div>
  );
}

function ZonaDeSoltar({
  arrastrando,
  onArrastrar,
  onArchivo,
}: {
  arrastrando: boolean;
  onArrastrar: (valor: boolean) => void;
  onArchivo: (archivo: File) => void;
}) {
  function soltar(evento: DragEvent<HTMLLabelElement>): void {
    evento.preventDefault();
    onArrastrar(false);
    const archivo = evento.dataTransfer.files[0];
    if (archivo) onArchivo(archivo);
  }

  function elegir(evento: ChangeEvent<HTMLInputElement>): void {
    const archivo = evento.target.files?.[0];
    if (archivo) onArchivo(archivo);
    // Se limpia para que volver a elegir el MISMO archivo dispare el evento.
    evento.target.value = '';
  }

  return (
    <label
      onDragOver={(evento) => {
        evento.preventDefault();
        onArrastrar(true);
      }}
      onDragLeave={() => onArrastrar(false)}
      onDrop={soltar}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors',
        arrastrando ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      )}
    >
      <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="font-medium">Arrastra el archivo o haz clic para elegirlo</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="size-3.5" aria-hidden="true" />
          PDF, PNG, JPG o WEBP
        </p>
      </div>
      <input type="file" accept={TIPOS_ACEPTADOS} className="sr-only" onChange={elegir} />
    </label>
  );
}
