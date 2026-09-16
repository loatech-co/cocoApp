import type { Account } from '@coco/types';
import { FileText, Loader2, ScanLine, Upload } from 'lucide-react';
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { ApiClientError } from '@/lib/api-client';
import { useLlevaCuentas } from '@/lib/preferences';
import { useAccounts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useCrearLote } from './imports-queries';
import { proveedorPara, TIPOS_ACEPTADOS, type ProgresoDeOcr } from './ocr';
import { parsearExtracto, type ResultadoDeParseo } from './parseo/extracto';
import { parsearCsv, type ResultadoDeCsv } from './parseo/csv';
import type { ColumnaDetectada } from './parseo/csv-columnas';
import { GuiaCsv } from './guia-csv';
import { MapeoDeColumnas } from './mapeo-columnas';

/** De qué vía vino el documento. Se guarda en el lote para poder comparar
 *  después qué origen produce menos correcciones en la revisión. */
type Origen = 'csv' | 'pdf' | 'image';

type Lectura =
  | ({ tipo: 'csv'; archivo: string; proveedor: string } & ResultadoDeCsv)
  | ({ tipo: 'documento'; archivo: string; proveedor: string; origen: Origen } & ResultadoDeParseo);

function origenDe(proveedor: string): Origen {
  if (proveedor === 'csv') return 'csv';
  if (proveedor === 'pdfjs') return 'pdf';
  return 'image';
}

const MENSAJE_VACIO: Record<Origen, string> = {
  csv: 'El archivo está vacío.',
  pdf: 'Este PDF no trae texto: probablemente sea un escaneo. Haz una captura de pantalla y súbela como imagen.',
  image:
    'No se pudo leer nada de esa imagen. Prueba con una captura más nítida y recortada a la tabla de movimientos.',
};

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
  const llevaCuentas = useLlevaCuentas();
  const cuentas = useAccounts();
  const crearLote = useCrearLote();

  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const [progreso, setProgreso] = useState<ProgresoDeOcr | null>(null);
  const [resultado, setResultado] = useState<Lectura | null>(null);
  // El texto crudo se conserva SOLO en memoria y solo mientras dura la
  // revisión: es lo que permite volver a parsear cuando se corrige el mapeo de
  // columnas, sin obligar a subir el archivo otra vez. Nunca sale de aquí.
  const [textoCrudo, setTextoCrudo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const activas = cuentas.data?.filter((cuenta) => !cuenta.is_archived) ?? [];
  // Sin preselección automática: antes se elegía la primera cuenta por ti, lo
  // que convertía "opcional" en "obligatoria y además adivinada". Si no eliges,
  // el lote entra sin cuenta, que es lo correcto.
  const cuentaElegida = llevaCuentas ? cuentaId : null;

  async function leer(archivo: File): Promise<void> {
    setError(null);
    setResultado(null);

    setTextoCrudo(null);

    const proveedor = proveedorPara(archivo);
    if (!proveedor) {
      setError('Ese tipo de archivo no se puede leer. Usa un CSV, un PDF o una imagen.');
      return;
    }

    setProgreso({ avance: 0, etapa: 'Empezando…' });

    try {
      const texto = await proveedor.extraerTexto(archivo, setProgreso);
      const origen = origenDe(proveedor.nombre);

      if (!texto.trim()) {
        setError(MENSAJE_VACIO[origen]);
        return;
      }

      setTextoCrudo(texto);

      if (origen === 'csv') {
        const csv = parsearCsv(texto);
        setResultado({ tipo: 'csv', ...csv, archivo: archivo.name, proveedor: proveedor.nombre });

        // Faltar una columna no es un error del archivo: es que la detección
        // no la reconoció. Se enseña el mapeo para corregirlo, no un error.
        if (csv.faltan.length === 0 && csv.movimientos.length === 0) {
          setError('El archivo se leyó pero no traía ninguna fila con fecha y monto.');
        }
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
        tipo: 'documento',
        ...parseado,
        archivo: archivo.name,
        proveedor: proveedor.nombre,
        origen,
      });
    } catch {
      setError('Algo falló leyendo el documento. Inténtalo de nuevo.');
    } finally {
      setProgreso(null);
    }
  }

  /**
   * Vuelve a parsear con el mapeo corregido.
   *
   * Se reutiliza el texto que ya está en memoria: obligar a subir el archivo
   * otra vez por cambiar qué columna es el monto sería absurdo.
   */
  function remapear(columnas: ColumnaDetectada[]): void {
    if (!textoCrudo || resultado?.tipo !== 'csv') return;
    setError(null);

    const csv = parsearCsv(textoCrudo, { mapeoManual: columnas });
    setResultado({ ...resultado, ...csv });
  }

  function subir(): void {
    if (!resultado) return;

    crearLote.mutate(
      {
        // Se omite el campo entero cuando no hay cuenta.
        ...(cuentaElegida !== null ? { account_id: cuentaElegida } : {}),
        source: resultado.tipo === 'csv' ? 'csv' : resultado.origen,
        label: resultado.archivo,
        ocr_provider: resultado.proveedor,
        rows: resultado.movimientos.map((movimiento) => ({
          date: movimiento.date,
          amount: movimiento.amount,
          type: movimiento.type,
          description: movimiento.description || undefined,
        })),
      },
      { onSuccess: (lote) => navegar(`/escanear/${lote.id}`) },
    );
  }

  const errorAlSubir =
    crearLote.error instanceof ApiClientError ? crearLote.error.message : null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Importar movimientos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube una captura o el PDF de tu extracto. Se lee <strong>en tu dispositivo</strong>: el
          documento no sale de aquí.
        </p>
      </header>

      {/*
        El paso de la cuenta solo existe para quien lleva cuentas, y aun así es
        OPCIONAL. Antes esta pantalla se bloqueaba entera con un "primero
        necesitas una cuenta": importar un extracto no puede depender de haberse
        inventado una cuenta primero.
      */}
      {llevaCuentas && activas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>¿A qué cuenta pertenece?</CardTitle>
            <CardDescription>
              Opcional. Sin cuenta, los movimientos entran igual; solo no suman a ningún saldo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="cuenta" className="sr-only">
              Cuenta
            </Label>
            <Select
              id="cuenta"
              etiqueta="Cuenta"
              className="max-w-sm"
              vacio="Sin cuenta"
              valor={cuentaId === null ? '' : String(cuentaId)}
              opciones={activas.map((cuenta: Account) => ({
                valor: String(cuenta.id),
                etiqueta: cuenta.name,
              }))}
              onCambiar={(v) => setCuentaId(v === '' ? null : Number(v))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>El documento</CardTitle>
          <CardDescription>
            Un PDF de extracto se lee exacto. Una captura pasa por reconocimiento de texto y
            puede traer errores — por eso hay un paso de revisión.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <GuiaCsv />

          {error && (
            <Alert variant="destructive">
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

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle>Lo que se reconoció</CardTitle>
            <CardDescription>
              Nada de esto ha tocado tus finanzas todavía. En el siguiente paso lo revisas y
              corriges antes de confirmar.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {resultado.tipo === 'csv' && (
              <MapeoDeColumnas
                columnas={resultado.columnas}
                faltan={resultado.faltan}
                onCambiar={remapear}
              />
            )}

            <p className="text-sm">
              <strong className="text-2xl">{resultado.movimientos.length}</strong>{' '}
              movimientos en <span className="text-muted-foreground">{resultado.archivo}</span>
            </p>

            {resultado.tipo === 'documento' && resultado.huboColumnaDeSaldo && (
              <p className="text-xs text-muted-foreground">
                El documento traía una columna de saldo corriente. Se tomó el monto del
                movimiento, no el saldo.
              </p>
            )}

            {resultado.tipo === 'csv' && resultado.usaSignos && (
              <p className="text-xs text-muted-foreground">
                El archivo marca los gastos con signo negativo, así que los montos positivos se
                tomaron como ingresos.
              </p>
            )}

            <Ignoradas
              lineas={
                resultado.tipo === 'csv' ? resultado.filasIgnoradas : resultado.lineasIgnoradas
              }
              motivo={
                resultado.tipo === 'csv'
                  ? 'No se les pudo leer la fecha o el monto.'
                  : 'Tenían cifras pero no se les pudo asignar una fecha.'
              }
            />

            {errorAlSubir && (
              <Alert variant="destructive">
                <AlertDescription>{errorAlSubir}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={subir}
                disabled={crearLote.isPending || resultado.movimientos.length === 0}
              >
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

/**
 * Lo que no se pudo interpretar.
 *
 * Se enseña siempre que haya algo: si el archivo traía cuarenta movimientos y
 * salieron doce, hay que poder ver los veintiocho que faltan. Descartarlos en
 * silencio sería la peor forma de perder datos — nadie se entera.
 */
function Ignoradas({ lineas, motivo }: { lineas: readonly string[]; motivo: string }) {
  if (lineas.length === 0) return null;

  return (
    <Alert variant="warning">
      <AlertTitle>
        {lineas.length} {lineas.length === 1 ? 'línea quedó' : 'líneas quedaron'} fuera
      </AlertTitle>
      <AlertDescription>
        {motivo} Si faltan movimientos, están aquí.
        <ul className="mt-2 max-h-32 overflow-y-auto font-mono text-xs">
          {lineas.map((linea, indice) => (
            <li key={`${linea}-${indice}`} className="truncate">
              {linea}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
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
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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
