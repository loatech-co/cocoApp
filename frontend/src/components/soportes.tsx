import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  FileText,
  FileWarning,
  ImagePlus,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';
import { Confirmacion } from '@/components/ui/confirmacion';
import { ApiClientError, apiBlob } from '@/lib/api-client';
import { cargarPdfjs } from '@/lib/pdf';
import { useEliminarSoporte, useSoportes, useSubirSoportes } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAlCambiar } from '@/lib/al-cambiar';
import type { Soporte } from '@coco/types';
import { REALCE_DE_SUPERFICIE, SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';

/**
 * El texto de la confirmación de borrar un soporte, escrito una vez.
 *
 * Se pregunta desde dos sitios —la galería de un movimiento y el pase a
 * pantalla completa— y estaba escrito en los dos. Es la misma pregunta sobre
 * la misma cosa: escrita dos veces, el día que cambie una cambia una.
 *
 * Dice que el movimiento no se elimina por lo mismo que la del movimiento dice
 * que el concepto no se toca: lo que se está borrando se ve DENTRO de lo otro,
 * así que la papelera parece apuntar al contenedor.
 */
const BORRAR_UN_SOPORTE =
  'Estás a punto de borrar un soporte. El movimiento no se elimina. Esta acción no se ' +
  'puede deshacer. ¿Estás seguro de que quieres continuar?';

/**
 * Los soportes de un movimiento: el recibo que prueba que ese pago existió.
 *
 * ── Por qué miniaturas y no pestañas ────────────────────────────────────────
 * Porque "Soporte 1 de 8" no dice nada. Ocho pestañas iguales obligan a
 * abrirlas una por una para encontrar la factura que uno busca, que es
 * exactamente el trabajo que uno venía a evitar. Una página dibujada se
 * reconoce de un vistazo: el recibo del agua no se parece al del colegio.
 *
 * ── Por qué el archivo se pide con código y no con un `src` ─────────────────
 * Porque el token de sesión vive en memoria, no en una cookie, así que una
 * petición que arranca el navegador por su cuenta —la de un `src`— sale sin
 * autorización. Se piden con `fetch`, con el token, y se convierten en `blob:`
 * que el visor sí puede consumir.
 *
 * Eso no es un rodeo para esquivar una limitación: es la consecuencia de que
 * el recibo NO tenga una URL que funcione para quien la tenga. Si bastara un
 * `src`, bastaría también con que alguien copiara el enlace.
 */
export function Soportes({ transactionId }: { transactionId: number }) {
  const soportes = useSoportes(transactionId);
  const subir = useSubirSoportes(transactionId);
  const lista = soportes.data ?? [];

  const [progreso, setProgreso] = useState(0);
  const [errorDeSubida, setErrorDeSubida] = useState<string | null>(null);
  /**
   * Añadiendo: la columna enseña el cuadro grande en vez de la galería.
   *
   * La baldosa de 104px no da para más que un icono: ni explica qué se acepta
   * ni tiene sitio para el botón de pegar, que es de donde salen la mitad de
   * los soportes. Así que la baldosa lleva al cuadro grande —el mismo de una
   * ficha sin soportes— y de ahí se vuelve.
   */
  const [añadiendo, setAñadiendo] = useState(false);
  /** El soporte que se va a borrar desde la columna, a la espera del sí. */
  const [borrando, setBorrando] = useState<Soporte | null>(null);
  const eliminar = useEliminarSoporte(transactionId);

  async function aceptar(archivos: File[]): Promise<void> {
    if (archivos.length === 0) return;
    setErrorDeSubida(null);
    setProgreso(0);

    try {
      await subir.mutateAsync({ archivos, onProgreso: setProgreso });
      setAñadiendo(false);
    } catch (e) {
      setErrorDeSubida(
        e instanceof ApiClientError ? e.message : 'No se pudo subir. Inténtalo otra vez.',
      );
    }
  }

  /** El `blob:` de cada soporte, por id. Se descargan una vez y se comparten. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  /**
   * Los que no se están viendo, y POR QUÉ. Dos motivos, y no son el mismo.
   *
   * ── `ausente` ─────────────────────────────────────────────────────────────
   * El servidor miró el disco y el archivo no está. Es definitivo: reintentar
   * no lo va a traer. Pasa porque la base y el almacén son dos sitios
   * distintos —las fichas viven en Postgres, el mismo para todos los entornos,
   * y los archivos en disco, que no lo es—, así que un soporte importado en
   * una máquina y no sincronizado a la otra sale en la lista y no está.
   *
   * ── `sin-cargar` ──────────────────────────────────────────────────────────
   * La descarga falló y no sabemos más: un 500 del servidor, la sesión
   * caducada, la red que se cortó a mitad. El archivo puede estar
   * perfectamente. Es pasajero, así que lleva un reintento.
   *
   * Estaban juntos y contestaban lo mismo —«no está en el servidor»— a un
   * soporte que sí estaba. Es el mismo error que el 415 que se comía los
   * agotamientos de recursos: dar por definitivo lo que solo era un fallo.
   */
  const [fallos, setFallos] = useState<Readonly<Record<string, FalloDeSoporte>>>({});
  /** Sube al reintentar, y con eso vuelve a correr el efecto de las descargas. */
  const [intento, setIntento] = useState(0);
  const [enGrande, setEnGrande] = useState<number | null>(null);
  /**
   * Cuál se está viendo arriba.
   *
   * La columna de un movimiento GUARDADO enseñaba solo la fila de miniaturas,
   * y la de uno que se está creando enseña el documento en grande con las
   * miniaturas debajo. Era la misma columna diciendo dos cosas distintas: al
   * crear, el recibo está para comprobar lo que se leyó; al editar,
   * exactamente igual —se abre una ficha para mirar el papel, no para mirar
   * ocho cuadraditos de 104px.
   */
  const [activo, setActivo] = useState(0);

  /*
    Los que el servidor ya dijo que no tiene se marcan de entrada, sin
    pedirlos: sería una petición que se sabe que va a devolver 404.

    Es estado DERIVADO de la lista, no un efecto, así que se ajusta en el
    render y no dentro del efecto de las descargas. Y por eso la limpieza de
    ese efecto ya no vacía `fallos`: con la misma firma, esto lo deja como toca
    —vacío si no hay lista, o con los ausentes— ANTES de que el efecto anterior
    se limpie. Si la limpieza lo vaciara después, se llevaría la siembra por
    delante.
  */
  useAlCambiar([transactionId, lista.length, intento], () => {
    setFallos(
      Object.fromEntries(
        lista.filter((s) => !s.disponible).map((s) => [String(s.id), 'ausente' as const]),
      ),
    );
  });

  useEffect(() => {
    if (lista.length === 0) return;

    const corte = new AbortController();
    const creados: string[] = [];

    for (const s of lista) {
      if (!s.disponible) continue;

      apiBlob(`/transactions/${transactionId}/soportes/${s.id}`, corte.signal)
        .then((blob) => {
          if (corte.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          creados.push(url);
          setUrls((previo) => ({ ...previo, [String(s.id)]: url }));
        })
        .catch(() => {
          // Se cayó la descarga, y eso NO dice que el archivo no esté: puede
          // ser un 500, la sesión caducada o la red. Se marca como lo que es
          // —no se pudo cargar— y se ofrece reintentar.
          //
          // El corte no cuenta: abortamos nosotros al desmontar o al cambiar
          // de movimiento, y eso no es un fallo de nada.
          if (corte.signal.aborted) return;
          setFallos((previo) => ({ ...previo, [String(s.id)]: 'sin-cargar' }));
        });
    }

    return () => {
      corte.abort();
      // Cada blob vive en la memoria de la pestaña hasta que se le suelta. Sin
      // esto, abrir veinte movimientos deja ciento sesenta archivos cargados.
      for (const url of creados) URL.revokeObjectURL(url);
      setUrls({});
    };
    // `lista.length` y no `lista`: la consulta devuelve un array nuevo en cada
    // render y con él las descargas empezarían otra vez sin parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, lista.length, intento]);

  if (soportes.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Buscando soportes…
      </p>
    );
  }

  // El que se está viendo, recortado: borrar el último dejaba el índice
  // apuntando a un soporte que ya no existe.
  const i = Math.min(activo, lista.length - 1);
  const enseñado = i >= 0 ? lista[i] : undefined;
  const urlDelEnseñado = enseñado ? urls[String(enseñado.id)] : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {enseñado && (
        <PreviaDeArchivo
          // La clave es el SOPORTE y no su url: con la url, el marco se
          // desmontaba y se volvía a montar al llegar el archivo, que es
          // justo el parpadeo que esto viene a quitar.
          key={String(enseñado.id)}
          url={urlDelEnseñado}
          fallo={fallos[String(enseñado.id)]}
          onReintentar={() => setIntento((n) => n + 1)}
          esImagen={enseñado.mime_type.startsWith('image/')}
          // Aquí SÍ hay pase a pantalla completa —el soporte ya existe en el
          // servidor, con su descarga y su zoom—, así que la previsualización
          // es también la puerta.
          onAbrir={() => setEnGrande(i)}
          acciones={
            <>
              {lista.length > 1 && (
                <>
                  <BotonOscuro
                    etiqueta="Soporte anterior"
                    deshabilitado={i === 0}
                    onClick={() => setActivo(i - 1)}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </BotonOscuro>
                  <span className="tabular px-1 text-xs font-medium text-sala-tinta">
                    {i + 1} / {lista.length}
                  </span>
                  <BotonOscuro
                    etiqueta="Soporte siguiente"
                    deshabilitado={i === lista.length - 1}
                    onClick={() => setActivo(i + 1)}
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </BotonOscuro>
                  <SeparadorDeMandos />
                </>
              )}

              <BotonOscuro etiqueta="Agregar otro soporte" onClick={() => setAñadiendo(true)}>
                <Plus className="size-4" aria-hidden="true" />
              </BotonOscuro>

              {/* Borrar pregunta antes: es lo único de esta barra que no se
                  puede deshacer. */}
              <BotonOscuro etiqueta="Eliminar este soporte" onClick={() => setBorrando(enseñado)}>
                <Trash2 className="size-4" aria-hidden="true" />
              </BotonOscuro>
            </>
          }
        />
      )}

      {/*
        ── Sin fila de miniaturas ────────────────────────────────────────────
        Eran ocho cuadrados de 104px debajo del papel, y con la ficha topada en
        720 se comían un tercio de la columna para decir algo que el papel ya
        dice: cuál se está mirando. Lo que hacían —contar, elegir, añadir,
        quitar— cabe sobre el propio documento y ahí no gasta alto.

        El contador y las flechas solo aparecen con más de uno: con un único
        soporte, «1 de 1» y dos flechas apagadas son tres controles que no
        hacen nada.
      */}
      {lista.length === 0 && (
        <div className="flex min-h-0 flex-1">
          <Soltar
            subiendo={subir.isPending}
            progreso={progreso}
            solo
            onArchivos={(a) => void aceptar(a)}
          />
        </div>
      )}

      {errorDeSubida && (
        <p role="alert" className="text-xs text-destructive">
          {errorDeSubida}
        </p>
      )}

      {/* Borrar pregunta antes, y con las mismas palabras que el pase: es la
          misma acción, hecha desde otro sitio. */}
      <Confirmacion
        abierta={borrando !== null}
        titulo="Eliminar soporte"
        peligrosa
        etiquetaConfirmar="Eliminar"
        ocupada={eliminar.isPending}
        onCancelar={() => setBorrando(null)}
        onConfirmar={() => {
          if (!borrando) return;
          eliminar.mutate(Number(borrando.id), {
            onSuccess: () => {
              setBorrando(null);
              // Si se va el último de la fila, se enseña el anterior.
              setActivo((n) => Math.max(0, Math.min(n, lista.length - 2)));
            },
          });
        }}
      >
        {BORRAR_UN_SOPORTE}
      </Confirmacion>

      {añadiendo && (
        <PanelDeSubida
          subiendo={subir.isPending}
          progreso={progreso}
          onArchivos={(a) => void aceptar(a)}
          onCerrar={() => setAñadiendo(false)}
        />
      )}

      {enGrande !== null && (
        <Pase
          transactionId={transactionId}
          lista={lista}
          urls={urls}
          fallos={fallos}
          onReintentar={() => setIntento((n) => n + 1)}
          indice={Math.min(enGrande, lista.length - 1)}
          onIr={setEnGrande}
          onCerrar={() => setEnGrande(null)}
        />
      )}
    </div>
  );
}

/**
 * El cuadro de subir, sobre la ficha que lo pidió.
 *
 * ── Por qué un panel encima y no un paso dentro ─────────────────────────────
 * Porque añadir un soporte no es una etapa del formulario: es algo que se hace
 * EN MEDIO de otra cosa —revisando una ficha, corrigiendo una cifra— y se
 * vuelve a lo que se estaba haciendo. Un paso obliga a salir de la ficha,
 * cambia lo que se ve y deja la duda de si lo escrito sigue ahí; un panel
 * encima deja la ficha a la vista, detrás.
 *
 * Y sirve para los dos sitios que lo abren: la vía «Subir un archivo» de un
 * movimiento nuevo y la baldosa de la galería de uno que ya tiene soportes. Sin
 * él eran dos pantallas distintas para el mismo gesto.
 *
 * ── Por qué Escape se atrapa en CAPTURA ─────────────────────────────────────
 * La ficha del movimiento escucha Escape en el documento para cerrarse. Este
 * panel se monta después, así que su oyente correría el segundo y la ficha se
 * cerraría igual —con lo escrito dentro—. En captura llega primero y detiene
 * el evento: Escape cierra el panel y nada más.
 */
export function PanelDeSubida({
  subiendo,
  progreso,
  onArchivos,
  onCerrar,
}: {
  subiendo: boolean;
  progreso: number;
  onArchivos: (archivos: File[]) => void;
  onCerrar: () => void;
}) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onCerrar();
    };

    document.addEventListener('keydown', alPulsar, true);
    return () => document.removeEventListener('keydown', alPulsar, true);
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Agregar soportes"
      // Por encima de la ficha, que está en z-50, igual que el pase.
      className={cn(
        'fixed inset-0 z-[60] flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        // 24 hasta el canto de la pantalla, como todas las fichas del teléfono.
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` y no `onClick`: con clic, arrastrar desde dentro del
      // panel hasta el velo —que es justo lo que se hace al soltar un
      // archivo— lo cerraría a mitad del gesto.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        className={cn(
          'flex w-full flex-col p-4 sm:max-w-xl sm:p-5',
          SUPERFICIE_FLOTANTE,
          'emerge rounded-lg',
        )}
      >
        <Soltar subiendo={subiendo} progreso={progreso} solo onArchivos={onArchivos} />
      </div>
    </div>
  );
}

/**
 * El hueco donde se sueltan los recibos.
 *
 * ── Por qué es un cuadro punteado y no un botón ─────────────────────────────
 * Porque ocupa una plaza en la misma fila que las miniaturas y del mismo
 * tamaño: se lee como el sitio del próximo soporte, no como una acción en otro
 * sitio de la ficha. Y el borde punteado es lo que en todas partes significa
 * "aquí cabe algo que todavía no está" —un botón sólido diría lo contrario,
 * que ahí ya hay una cosa—.
 *
 * ── Por qué también acepta que se suelte encima ─────────────────────────────
 * Porque el recibo casi siempre viene de otra ventana: del correo, de la
 * carpeta de descargas. Obligar a pasar por el diálogo de archivos es pedir
 * que se busque a mano lo que ya se tiene agarrado.
 */
export function Soltar({
  subiendo,
  progreso,
  solo,
  alPulsar,
  onArchivos,
}: {
  subiendo: boolean;
  progreso: number;
  /** Sin ningún soporte todavía: ocupa el ancho y explica. */
  solo: boolean;
  /**
   * Qué hace la baldosa pequeña al pulsarse, si no es abrir el buscador.
   *
   * La galería la usa para llevar al cuadro grande en vez de al buscador del
   * sistema: en 104px no caben ni la explicación de qué se acepta ni el botón
   * de pegar, así que la baldosa pasó a ser una PUERTA y el cuadro grande el
   * sitio donde de verdad se añade.
   */
  alPulsar?: () => void;
  onArchivos: (archivos: File[]) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [problemaAlPegar, setProblemaAlPegar] = useState<string | null>(null);

  /*
    ── Pegar una captura ───────────────────────────────────────────────────
    Una captura de pantalla vive en el portapapeles y en ningún otro sitio:
    para adjuntarla había que guardarla primero en el disco, buscarla y
    arrastrarla. Tres pasos para algo que se acaba de capturar.

    Es un BOTÓN y no un atajo de teclado escuchando en la ficha. Un pegado que
    solo funciona con el cursor en el sitio correcto no se descubre y falla
    sin decir por qué; un botón se ve, dice lo que hace y se puede pulsar con
    el dedo en un teléfono.

    El portapapeles no siempre se deja leer —Safari lo pregunta, y sin HTTPS
    ni existe—, así que el fallo se cuenta y se ofrece la salida de siempre:
    arrastrar o elegir del equipo.
  */
  async function pegar(): Promise<void> {
    setProblemaAlPegar(null);

    try {
      const enElPortapapeles = await navigator.clipboard.read();
      const capturas: File[] = [];

      for (const elemento of enElPortapapeles) {
        const tipo = elemento.types.find((t) => t.startsWith('image/'));
        if (!tipo) continue;
        capturas.push(nombrarCaptura(await elemento.getType(tipo), tipo));
      }

      if (capturas.length === 0) {
        setProblemaAlPegar('En el portapapeles no hay ninguna imagen.');
        return;
      }

      onArchivos(capturas);
    } catch {
      setProblemaAlPegar(
        'El navegador no dejó leer el portapapeles. Arrastra la captura o elígela del equipo.',
      );
    }
  }

  return (
    /*
      ── Una CAJA, no un botón ───────────────────────────────────────────────
      Era un `<button>` entero, y por eso el botón de pegar tuvo que vivir
      fuera, debajo: un botón dentro de otro no es HTML válido. Pero el pegar
      es una de las tres formas de dar un archivo —arrastrarlo, elegirlo,
      pegarlo— y ponerlo fuera lo dejaba pareciendo otra cosa, colgando del
      cuadro en vez de siendo parte de él.

      Así que el cuadro es una caja, y quien abre el buscador de archivos es un
      botón que la cubre entera por debajo del contenido. El resultado a la
      vista es el mismo —se pulsa en cualquier parte del cuadro y se abre el
      buscador— y encima cabe lo que haga falta dentro.
    */
    <div
      className={cn(solo && 'flex w-full self-stretch')}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        if (!subiendo) onArchivos(Array.from(e.dataTransfer.files));
      }}
    >
      <div
        className={cn(
          'relative flex flex-col items-center justify-center gap-1.5 rounded-lg',
          'border-2 border-dashed transition-colors',
          solo ? 'min-h-36 flex-1 px-4 py-8' : 'size-[104px]',
          subiendo
            ? 'cursor-wait border-border text-muted-foreground'
            : encima
              ? 'border-acento-tinta bg-accent text-accent-foreground'
              : cn('border-border text-muted-foreground', REALCE_DE_SUPERFICIE),
        )}
      >
        {/* El botón que cubre la caja. Va PRIMERO y sin contenido: lo que se
            lee encima son los rótulos de abajo, que no interceptan el ratón
            para que el clic llegue hasta aquí caiga donde caiga. */}
        <button
          type="button"
          onClick={alPulsar ?? (() => campo.current?.click())}
          disabled={subiendo}
          aria-label="Agregar soportes"
          // Sin anillo propio: el foco de un botón lo pinta `index.css` para
          // todos a la vez, y escribirlo aquí es la excepción que la prueba de
          // `lib/foco.test.ts` no deja pasar.
          className="absolute inset-0 rounded-lg"
        />

        <div className="pointer-events-none relative flex flex-col items-center gap-1.5">
          {subiendo ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              {/* El porcentaje, no una barra: en una caja de 104px una barra
                  son cuatro píxeles de alto que no se ven moverse. */}
              <span className="tabular text-xs font-medium">{Math.round(progreso * 100)} %</span>
            </>
          ) : solo ? (
            <>
              {/*
                El texto dice QUÉ va aquí, no solo cómo ponerlo.

                Decía "Arrastrar un archivo aquí": con un rótulo de sección
                encima que ponía "Soporte", eso bastaba. Sin el rótulo, "un
                archivo" no dice de qué archivo se trata, y este cuadro es el
                único sitio de la ficha donde se adjunta el recibo.
              */}
              <Upload className="size-6" aria-hidden="true" />
              <span className="text-center text-sm font-medium text-foreground">
                Agregar los soportes del movimiento
              </span>
              <span className="text-center text-xs">
                El recibo, la factura o el comprobante de pago. Arrastrarlos aquí o seleccionarlos
                del equipo.
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-center text-2xs text-muted-foreground">
                <FileText className="size-3.5 shrink-0" aria-hidden="true" />
                PDF, JPG, PNG, HEIC o WEBP
              </span>
            </>
          ) : (
            <>
              <ImagePlus className="size-6" aria-hidden="true" />
              <span className="px-2 text-center text-2xs leading-tight">Agregar soporte</span>
            </>
          )}
        </div>

        {/* La tercera forma de dar un archivo, dentro del cuadro y con las
            otras dos: separada, se leía como otra cosa colgando debajo.

            `relative` para quedar por encima del botón que cubre la caja, o el
            clic se lo llevaría él. */}
        {solo && !subiendo && (
          <div className="relative mt-4 flex flex-col items-center gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => void pegar()}>
              <ClipboardPaste aria-hidden="true" />
              Pegar una captura
            </Button>
            {problemaAlPegar && (
              <p role="alert" className="max-w-xs text-center text-xs text-muted-foreground">
                {problemaAlPegar}
              </p>
            )}
          </div>
        )}
      </div>

      {/* El campo de verdad, escondido: el nativo no se puede peinar y el
          `<button>` de arriba sí. */}
      <input
        ref={campo}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="hidden"
        onChange={(e) => {
          onArchivos(Array.from(e.target.files ?? []));
          // Se vacía para que subir DOS VECES el mismo archivo dispare el
          // evento la segunda: sin esto, el valor no cambia y no pasa nada.
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Le pone nombre a una captura pegada.
 *
 * El portapapeles no entrega nombres: lo que llega es un blob. Sin esto, todas
 * las capturas se llamarían igual y en una fila de miniaturas no habría forma
 * de saber cuál es cuál. Con la fecha y la hora, el nombre dice al menos
 * cuándo se pegó.
 *
 * La extensión sale del TIPO y no de un nombre que no existe: según de dónde
 * se copie, el portapapeles entrega png, jpeg o webp.
 */
function nombrarCaptura(contenido: Blob, tipo: string): File {
  const extension = tipo.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return new File([contenido], `captura-${sello}.${extension}`, { type: tipo });
}

/**
 * La primera página de un PDF, pintada en un lienzo.
 *
 * Se dibuja más grande que su caja y se encoge por CSS: en una pantalla
 * retina, dibujarla al tamaño de la caja deja un texto borroso que parece un
 * escaneo malo cuando el escaneo está bien.
 */
export function LienzoPdf({
  url,
  ajuste = 'cover',
  ancho = 240,
  onTamano,
  estilo,
}: {
  url: string;
  /**
   * `cover` recorta por arriba; `contain` enseña la hoja entera.
   *
   * En una miniatura de 104px recortar es lo correcto: lo que distingue un
   * recibo de otro es el membrete. En una previsualización que existe para
   * COMPROBAR una cifra, recortar esconde justo lo que se viene a leer, que
   * casi nunca está en la cabecera.
   */
  ajuste?: 'cover' | 'contain';
  /** A cuántos píxeles se dibuja la página. Más, para verla grande. */
  ancho?: number;
  /** El tamaño real del dibujo, para quien necesite encuadrarlo. */
  onTamano?: (ancho: number, alto: number) => void;
  /** Si se pasa, el lienzo se mide por aquí en vez de llenar su caja. */
  estilo?: CSSProperties;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [fallo, setFallo] = useState(false);

  // El aviso del tamaño como evento de efecto: en las dependencias haría que
  // el PDF se volviera a dibujar en cada render del padre. `useEffectEvent`
  // da una función estable que llama siempre a la versión más reciente sin
  // ser dependencia. Antes era una ref escrita durante el render, que hace lo
  // mismo a mano y es lo que la regla de los refs prohíbe.
  const avisarTamano = useEffectEvent((ancho: number, alto: number) => onTamano?.(ancho, alto));

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        const documento = await pdfjs.getDocument({ url }).promise;
        const pagina = await documento.getPage(1);

        if (!vivo || !lienzo.current) return;

        const base = pagina.getViewport({ scale: 1 });
        const vista = pagina.getViewport({ scale: ancho / base.width });

        const contexto = lienzo.current.getContext('2d');
        if (!contexto) return;

        lienzo.current.width = vista.width;
        lienzo.current.height = vista.height;

        await pagina.render({ canvas: lienzo.current, canvasContext: contexto, viewport: vista })
          .promise;
        await documento.cleanup();
        if (vivo) avisarTamano(vista.width, vista.height);
      } catch {
        if (vivo) setFallo(true);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [url, ancho]);

  if (fallo) return <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />;

  if (estilo) return <canvas ref={lienzo} style={estilo} aria-hidden="true" />;

  return (
    <canvas
      ref={lienzo}
      className={cn('size-full', ajuste === 'cover' ? 'object-cover object-top' : 'object-contain')}
      aria-hidden="true"
    />
  );
}

/** Los saltos del zoom. Fijos y pocos: un control continuo pide precisión que
    nadie quiere darle a un recibo. */
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
/** El índice del 100 %, por nombre: `ZOOMS.indexOf(2)` es el 200 %, no el 2º. */
const NORMAL = ZOOMS.indexOf(1);
/** El ancho de una hoja al 100 %: carta legible en un portátil sin ampliar. */
const ANCHO_HOJA = 620;

/**
 * El pase de soportes: el recibo a tamaño de leerlo.
 *
 * ── Por qué el PDF también se dibuja ────────────────────────────────────────
 * Un `<iframe>` con el visor del navegador enseña el PDF, pero trae su propia
 * barra, su propio zoom y su propio idioma, y encima cambia según el navegador
 * y el sistema. Al lado de una imagen, que se amplía con los botones de aquí,
 * el mismo gesto hacía dos cosas distintas según qué soporte tocara.
 *
 * Dibujando la página en un lienzo, las dos son lo mismo: un mapa de bits que
 * este componente amplía, desplaza y descarga igual. Cuesta un render de
 * pdf.js y a cambio el visor se comporta siempre igual.
 */
function Pase({
  transactionId,
  lista,
  urls,
  fallos,
  onReintentar,
  indice,
  onIr,
  onCerrar,
}: {
  transactionId: number;
  lista: Soporte[];
  urls: Record<string, string>;
  /** Por qué no se ve cada uno, si es que no se ve. Ver `Soportes`. */
  fallos: Readonly<Record<string, FalloDeSoporte>>;
  onReintentar: () => void;
  indice: number;
  onIr: (i: number) => void;
  onCerrar: () => void;
}) {
  const eliminar = useEliminarSoporte(transactionId);
  const [confirmando, setConfirmando] = useState(false);
  const soporte = lista[indice];
  const url = urls[String(soporte.id)];
  const fallo = fallos[String(soporte.id)];
  const esImagen = soporte.mime_type.startsWith('image/');

  const [zoom, setZoom] = useState(NORMAL);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);

  // Cambiar de soporte reinicia el zoom y la página: seguir en la página 3 de
  // un recibo de una sola hoja deja el visor en blanco.
  useAlCambiar([indice], () => {
    setZoom(NORMAL);
    setPagina(1);
    setPaginas(1);
  });

  const cambiarZoom = useCallback(
    (paso: number) => setZoom((z) => Math.min(ZOOMS.length - 1, Math.max(0, z + paso))),
    [],
  );

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft' && indice > 0) onIr(indice - 1);
      else if (e.key === 'ArrowRight' && indice < lista.length - 1) onIr(indice + 1);
      else if (e.key === '+' || e.key === '=') cambiarZoom(1);
      else if (e.key === '-') cambiarZoom(-1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [indice, lista.length, onIr, onCerrar, cambiarZoom]);

  const escala = ZOOMS[zoom];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={soporte.nombre_archivo}
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
      // Por encima del modal del movimiento, que está en z-50.
      className="fixed inset-0 z-[60] flex flex-col bg-sala/90 p-3 backdrop-blur-sm sm:p-6"
    >
      {/* ── Cabecera ──────────────────────────────────────────────────── */}
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-sala-tinta">{soporte.nombre_archivo}</p>
          <p className="tabular text-xs text-sala-tinta/60">
            {lista.length > 1 && `${indice + 1} de ${lista.length} · `}
            {(soporte.tamano / 1024).toFixed(0)} KB
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Descargar es un enlace, no un botón con JavaScript: el navegador
              ya sabe guardar un archivo, y con `download` se guarda con su
              nombre de verdad y no con el uuid del almacén. */}
          {url && (
            <a
              href={url}
              download={soporte.nombre_archivo}
              title="Descargar"
              aria-label={`Descargar ${soporte.nombre_archivo}`}
              className="flex size-9 items-center justify-center rounded-lg text-sala-tinta transition-colors hover:bg-sala-tinta/10"
            >
              <Download className="size-4" aria-hidden="true" />
            </a>
          )}
          {/* Poder quitar lo que se acaba de subir por error. Sin esto, una
              foto movida se queda para siempre colgando del movimiento. */}
          <BotonOscuro onClick={() => setConfirmando(true)} etiqueta="Eliminar soporte">
            <Trash2 className="size-4" aria-hidden="true" />
          </BotonOscuro>
          <BotonOscuro onClick={onCerrar} etiqueta="Cerrar">
            <X className="size-4" aria-hidden="true" />
          </BotonOscuro>
        </div>
      </div>

      {/* ── El recibo ─────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 gap-2">
        {lista.length > 1 && (
          <BotonOscuro
            onClick={() => onIr(indice - 1)}
            deshabilitado={indice === 0}
            etiqueta="Soporte anterior"
            className="self-center"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </BotonOscuro>
        )}

        {/*
          El hueco es OSCURO y la hoja flota encima.

          Antes el contenedor entero era blanco, así que un recibo de 620px en
          una pantalla ancha dejaba dos franjas blancas enormes a los lados: en
          una app de fondo verde oscuro, y de noche, eso deslumbra. Lo blanco
          tiene que ser el papel y nada más, que es además como se ve un
          documento en cualquier visor.

          `overflow-auto`: ampliado, el recibo se recorre con la barra de
          desplazamiento. Es lo que ya sabe hacer el navegador y no hay que
          reinventar el arrastre.
        */}
        <div className="relative flex min-w-0 flex-1 justify-center overflow-auto rounded-lg bg-sala/25 p-3 sm:p-6">
          {fallo ? (
            <div className="flex w-full items-center justify-center">
              <SoporteQueNoSeVe fallo={fallo} onReintentar={onReintentar} oscuro />
            </div>
          ) : !url ? (
            <div className="flex w-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-sala-tinta/70" aria-hidden="true" />
            </div>
          ) : esImagen ? (
            <img
              src={url}
              alt={soporte.nombre_archivo}
              // El MISMO ancho que una página de PDF: si una imagen midiera
              // otra cosa, el botón de ampliar haría dos cosas distintas
              // según qué soporte estuviera abierto.
              className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
              style={{ width: ANCHO_HOJA * escala }}
            />
          ) : (
            <PaginaPdf url={url} pagina={pagina} escala={escala} onPaginas={setPaginas} />
          )}
        </div>

        {lista.length > 1 && (
          <BotonOscuro
            onClick={() => onIr(indice + 1)}
            deshabilitado={indice === lista.length - 1}
            etiqueta="Soporte siguiente"
            className="self-center"
          >
            <ChevronRight className="size-5" aria-hidden="true" />
          </BotonOscuro>
        )}
      </div>

      {/* ── Controles ─────────────────────────────────────────────────── */}
      <div className="mt-3 flex shrink-0 flex-wrap items-center justify-center gap-3">
        <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
          <BotonOscuro onClick={() => cambiarZoom(-1)} deshabilitado={zoom === 0} etiqueta="Alejar">
            <Minus className="size-4" aria-hidden="true" />
          </BotonOscuro>
          {/* El porcentaje se pulsa para volver al tamaño normal: es donde
              todo el mundo intenta pulsar cuando se ha perdido ampliando. */}
          <button
            type="button"
            onClick={() => setZoom(NORMAL)}
            className="tabular min-w-[3.5rem] text-center text-xs font-medium text-sala-tinta"
          >
            {Math.round(escala * 100)} %
          </button>
          <BotonOscuro
            onClick={() => cambiarZoom(1)}
            deshabilitado={zoom === ZOOMS.length - 1}
            etiqueta="Acercar"
          >
            <Plus className="size-4" aria-hidden="true" />
          </BotonOscuro>
        </div>

        {paginas > 1 && (
          <div className="flex items-center gap-1 rounded-full bg-sala-tinta/10 px-1">
            <BotonOscuro
              onClick={() => setPagina((p) => p - 1)}
              deshabilitado={pagina === 1}
              etiqueta="Página anterior"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </BotonOscuro>
            <span className="tabular min-w-[4.5rem] text-center text-xs font-medium text-sala-tinta">
              Pág. {pagina} / {paginas}
            </span>
            <BotonOscuro
              onClick={() => setPagina((p) => p + 1)}
              deshabilitado={pagina === paginas}
              etiqueta="Página siguiente"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </BotonOscuro>
          </div>
        )}
      </div>

      {/* Misma capa que el pase y DESPUÉS en el árbol: con el mismo z-index,
          manda el que va después, así que el diálogo queda encima. */}
      <Confirmacion
        abierta={confirmando}
        titulo="Eliminar soporte"
        peligrosa
        etiquetaConfirmar="Eliminar"
        ocupada={eliminar.isPending}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={() =>
          eliminar.mutate(Number(soporte.id), {
            onSuccess: () => {
              setConfirmando(false);
              // Era el único: no queda nada que enseñar.
              if (lista.length === 1) onCerrar();
              else if (indice === lista.length - 1) onIr(indice - 1);
            },
          })
        }
      >
        {BORRAR_UN_SOPORTE}
      </Confirmacion>
    </div>
  );
}

/** Un botón sobre el velo oscuro del pase. Aquí no vale la paleta de la app. */
/**
 * Un mando que vive SOBRE el documento.
 *
 * No usa la paleta de la aplicación: encima de un recibo —que es blanco— un
 * control claro desaparece. Se exporta porque los mandos de la
 * previsualización los pone quien la usa: la ficha de un movimiento sin
 * guardar quita archivos de la memoria y la de uno guardado los borra del
 * servidor, pero los dos botones son el mismo objeto.
 */
/**
 * La raya entre dos grupos de mandos dentro de la misma pastilla.
 *
 * ── Qué separa ──────────────────────────────────────────────────────────────
 * Moverse de lo que MODIFICA. Pasar al soporte siguiente no cambia nada;
 * agregar y borrar sí, y borrar no se deshace. Seguidos sin nada en medio, las
 * flechas y el más se leen como una sola regleta de cinco botones, y el que
 * está justo después del contador —el más— se pulsa creyendo que es «el
 * siguiente».
 *
 * ── Por qué una raya y no un hueco ──────────────────────────────────────────
 * Un hueco dentro de una pastilla de 40px de alto tiene que ser grande para
 * leerse como separación, y entonces la pastilla crece a lo ancho encima del
 * papel. Un píxel dice lo mismo y no ocupa nada.
 *
 * Va al 25 % de la tinta: tiene que verse como una división, no como un sexto
 * control.
 */
export function SeparadorDeMandos() {
  return <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-sala-tinta/25" />;
}

export function BotonOscuro({
  onClick,
  etiqueta,
  deshabilitado = false,
  className,
  children,
}: {
  onClick: () => void;
  etiqueta: string;
  deshabilitado?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      // Redondo: estos mandos viven dentro de una pastilla redonda, y un
      // resaltado cuadrado ahí deja dos esquinas asomando en cada extremo.
      size="sm-icon-redondo"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn('text-sala-tinta hover:bg-sala-tinta/10 hover:text-sala-tinta', className)}
    >
      {children}
    </Button>
  );
}

/**
 * Una página de PDF dibujada al tamaño que pide el zoom.
 *
 * Se REDIBUJA al ampliar en vez de estirar el lienzo con CSS: un PDF es
 * vectorial, así que redibujarlo da texto nítido a cualquier tamaño, mientras
 * que estirar un mapa de bits da exactamente el aspecto que uno teme al
 * ampliar un recibo —el de un escaneo malo—.
 */
function PaginaPdf({
  url,
  pagina,
  escala,
  onPaginas,
}: {
  url: string;
  pagina: number;
  escala: number;
  onPaginas: (n: number) => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [fallo, setFallo] = useState(false);
  const [pintando, setPintando] = useState(true);

  // «Pintando» desde el primer render de cada cambio, no un fotograma después:
  // es estado que se deriva de que cambió el documento, la página o la escala.
  useAlCambiar([url, pagina, escala], () => setPintando(true));

  useEffect(() => {
    let vivo = true;

    void (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        const documento = await pdfjs.getDocument({ url }).promise;
        if (!vivo) return;

        onPaginas(documento.numPages);
        const hoja = await documento.getPage(Math.min(pagina, documento.numPages));
        if (!vivo || !lienzo.current) return;

        // Al DOBLE de píxeles de los que se enseñan: es lo que lo deja nítido
        // en una pantalla retina.
        const base = hoja.getViewport({ scale: 1 });
        const vista = hoja.getViewport({ scale: ((ANCHO_HOJA * escala) / base.width) * 2 });

        const contexto = lienzo.current.getContext('2d');
        if (!contexto) return;

        lienzo.current.width = vista.width;
        lienzo.current.height = vista.height;

        await hoja.render({ canvas: lienzo.current, canvasContext: contexto, viewport: vista })
          .promise;
        await documento.cleanup();
        if (vivo) setPintando(false);
      } catch {
        if (vivo) {
          setFallo(true);
          setPintando(false);
        }
      }
    })();

    return () => {
      vivo = false;
    };
  }, [url, pagina, escala, onPaginas]);

  if (fallo) {
    return (
      <p className="flex items-center gap-2 self-center text-sm text-sala-tinta/80">
        <FileWarning className="size-5" aria-hidden="true" />
        No se pudo dibujar este PDF.
      </p>
    );
  }

  return (
    <>
      {pintando && (
        <Loader2
          className="absolute size-6 animate-spin self-center text-sala-tinta/70"
          aria-hidden="true"
        />
      )}
      {/* El lienzo se dibuja al doble de píxeles y se enseña a la mitad: es lo
          que lo deja nítido en una pantalla retina. */}
      <canvas
        ref={lienzo}
        className="h-fit max-w-none rounded-lg bg-white shadow-2xl"
        style={{ width: ANCHO_HOJA * escala }}
      />
    </>
  );
}

/**
 * El soporte en grande, recorrible.
 *
 * ── Por qué llena la caja y no entra entera ─────────────────────────────────
 * Porque una hoja completa metida en 30rem de alto deja la letra a un tamaño
 * en el que el total no se lee, y esta columna existe exactamente para leer el
 * total. Llenando la caja, el documento se ve al tamaño en que se puede
 * comprobar, y lo que no cabe se alcanza arrastrando.
 *
 * ── Por qué arrastrar y no barras de desplazamiento ─────────────────────────
 * Porque es un documento, no una página: el gesto con el que todo el mundo
 * mueve un plano o un mapa es agarrarlo. Y con `pointer`, el mismo código
 * sirve para el ratón, el dedo y el lápiz.
 *
 * ── Los topes ───────────────────────────────────────────────────────────────
 * El desplazamiento se recorta a lo que falta por ver, así que nunca aparece
 * un hueco: el borde del documento no pasa del borde de la caja. Y si por el
 * lado corto el documento cabe justo, ese eje no se mueve —en vez de temblar
 * un píxel en cada arrastre—.
 */
/** Por qué no se está viendo un soporte. Ver `fallos` en `Soportes`. */
export type FalloDeSoporte = 'ausente' | 'sin-cargar';

/**
 * El hueco de un soporte que no se ve, diciendo por qué.
 *
 * ── Los dos motivos no se contestan igual ───────────────────────────────────
 * `ausente` es definitivo: el servidor miró el disco y el archivo no está, así
 * que reintentar no lo va a traer y lo útil es decir dónde mirar —la ficha
 * está en la base, el archivo en el disco de cada servidor, y se sincronizan
 * aparte—.
 *
 * `sin-cargar` no dice nada del archivo: la descarga se cayó y puede haber
 * sido un 500, la sesión caducada o la red. Ahí sí se reintenta, y prometer
 * que «no está» sería mentir sobre algo que probablemente está.
 *
 * Los dos iban por el mismo camino, y un soporte que existía recibía «no está
 * en el servidor».
 *
 * ── Por qué no es rojo ──────────────────────────────────────────────────────
 * Porque no falló nada de lo que se acaba de hacer: el movimiento está bien y
 * su ficha también. El rojo de esta app está reservado a lo que salió mal y a
 * lo que no se puede deshacer.
 *
 * `oscuro` es para el pase a pantalla completa, cuyo fondo ya lo es: el gris
 * de la app desaparecería encima.
 */
function SoporteQueNoSeVe({
  fallo,
  onReintentar,
  oscuro = false,
}: {
  fallo: FalloDeSoporte;
  onReintentar?: () => void;
  oscuro?: boolean;
}) {
  return (
    <span
      className={cn(
        'grid size-full place-items-center px-6 text-center',
        oscuro ? 'text-sala-tinta/70' : 'text-muted-foreground',
      )}
      role="status"
    >
      <span className="flex max-w-xs flex-col items-center gap-2 text-sm">
        <FileWarning className="size-6 shrink-0" aria-hidden="true" />
        {fallo === 'ausente' ? (
          <span>Este soporte no está en el servidor. Su ficha sí: el archivo es lo que falta.</span>
        ) : (
          <>
            <span>No se pudo cargar este soporte. El archivo puede estar bien.</span>
            {onReintentar && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={onReintentar}
              >
                Reintentar
              </Button>
            )}
          </>
        )}
      </span>
    </span>
  );
}

export function PreviaDeArchivo({
  url,
  fallo,
  onReintentar,
  esImagen,
  onAbrir,
  acciones,
}: {
  /**
   * El documento. Mientras no esté, se enseña el marco vacío con su girador.
   *
   * ── Por qué el marco va PRIMERO ───────────────────────────────────────────
   * El soporte de un movimiento guardado se descarga: hay un momento —corto en
   * una imagen, largo en un PDF de varias hojas— en el que no hay nada que
   * pintar. Sin marco, la columna se queda vacía y aparece de golpe un bloque
   * que empuja lo de abajo; con él, el sitio ya está hecho y lo único que
   * cambia es lo que hay dentro.
   *
   * Es la misma razón por la que una tabla enseña sus filas en gris antes de
   * tener datos: lo que no puede cambiar de tamaño es la página.
   */
  url?: string;
  /**
   * El documento no se está viendo, y por qué.
   *
   * Sin esto se dibujaba el mismo girador que mientras se espera, y un soporte
   * que no iba a llegar giraba para siempre: quien mira no puede distinguir
   * «está tardando» de «no está», que piden cosas distintas.
   */
  fallo?: FalloDeSoporte;
  /** Solo hace algo con `sin-cargar`: lo ausente no vuelve por reintentarlo. */
  onReintentar?: () => void;
  esImagen: boolean;
  /**
   * Abre el pase a pantalla completa, si lo hay.
   *
   * Solo lo tiene un soporte ya guardado: el que todavía está esperando a que
   * se guarde el movimiento no existe en ninguna parte que se pueda abrir. Sin
   * esto, el botón aparecería en los dos sitios y en uno no haría nada.
   */
  onAbrir?: () => void;
  /**
   * Lo que se puede hacer con ESTE documento: borrarlo, añadir otro, pasar al
   * siguiente.
   *
   * Van aquí desde que no hay miniaturas. La fila de miniaturas era la que
   * decía cuántos documentos hay, cuál se está viendo y por dónde se añade o
   * se quita uno; sin ella, todo eso tiene que caber sobre el papel o
   * desaparece.
   */
  acciones?: ReactNode;
}) {
  /** El tamaño natural de lo dibujado, para saber cuánto sobra por cada lado. */
  const [natural, setNatural] = useState<{ ancho: number; alto: number } | null>(null);
  const [caja, setCaja] = useState({ ancho: 0, alto: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  /*
    El zoom multiplica la escala que ya LLENA la caja, así que el 100 % es el
    documento cubriendo el marco y no su tamaño natural.

    No baja del 100 % a propósito: por debajo aparecerían franjas vacías a los
    lados, y una previsualización con huecos se lee como un error de montaje.
    Para ver la hoja entera está el pase a pantalla completa del movimiento ya
    guardado.
  */
  const [zoom, setZoom] = useState(0);

  const marco = useRef<HTMLDivElement>(null);
  const agarre = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // La caja cambia de tamaño con la ventana, y los topes dependen de ella.
  useEffect(() => {
    const elemento = marco.current;
    if (!elemento) return;

    const medir = (): void => setCaja({ ancho: elemento.clientWidth, alto: elemento.clientHeight });

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  /*
    La escala que LLENA la caja: la mayor de las dos proporciones. Con la menor
    —que es `contain`— quedarían franjas vacías a los lados.
  */
  const cubrir =
    natural && caja.ancho > 0 ? Math.max(caja.ancho / natural.ancho, caja.alto / natural.alto) : 1;
  const escala = cubrir * PASOS_DE_LA_PREVIA[zoom];
  const ancho = natural ? natural.ancho * escala : 0;
  const alto = natural ? natural.alto * escala : 0;

  /** Cuánto se puede mover cada eje. Negativo: es lo que sobra por ver. */
  const limite = { x: Math.min(0, caja.ancho - ancho), y: Math.min(0, caja.alto - alto) };

  const recortar = (x: number, y: number): { x: number; y: number } => ({
    x: Math.min(0, Math.max(limite.x, x)),
    y: Math.min(0, Math.max(limite.y, y)),
  });

  // Empieza CENTRADO, y se recentra al cambiar el zoom: ampliar desde una
  // esquina deja mirando un margen en blanco en vez de lo que se estaba
  // leyendo.
  //
  // Solo al cambiar el documento, la caja o el zoom: recentrar en cada
  // arrastre pelearía con el dedo. Antes era un efecto con las dependencias
  // recortadas a mano y una excepción al lint para que lo tolerara; con la
  // firma explícita la excepción sobra.
  useAlCambiar([natural, caja.ancho, caja.alto, zoom], () => {
    if (!natural || caja.ancho === 0) return;
    setPos(recortar(limite.x / 2, limite.y / 2));
  });

  const sePuedeMover = limite.x < 0 || limite.y < 0;

  const encuadre = {
    position: 'absolute' as const,
    left: pos.x,
    top: pos.y,
    width: ancho || undefined,
    height: alto || undefined,
    // Antes de medir se pinta invisible: un fotograma con el documento a su
    // tamaño natural y sin encuadrar se ve como un salto.
    visibility: natural ? ('visible' as const) : ('hidden' as const),
  };

  return (
    <div
      ref={marco}
      // `touch-action: none` para que el dedo mueva el documento y no desplace
      // la ficha entera por detrás.
      className={cn(
        /*
          ── El alto lo pone la COLUMNA, no este marco ──────────────────────
          Tuvo 480 y luego 350 fijos, y un alto fijo se equivoca por los dos
          lados: en la ficha del movimiento, que llega a 1024 de ancho, dejaba
          un palmo de vacío entre el papel y el pie de su columna —la de al
          lado, con sus cinco campos, llega bastante más abajo—; y en una
          ventana baja se comía el sitio de todo lo demás.

          Con `flex-1` mide lo que le sobre a su columna, que es exactamente
          lo que mide la columna de campos: las dos son celdas de la misma
          fila de la rejilla. El documento se reencuadra solo —el marco se
          mide con un `ResizeObserver` y la escala sale de ahí— así que crecer
          no le cuesta nada.

          El suelo de 220 es para el caso en que no haya alto que repartir:
          una previsualización de cuarenta píxeles no enseña nada y el
          `ResizeObserver` se quedaría midiendo una franja.
        */
        'relative min-h-[220px] flex-1 touch-none select-none overflow-hidden rounded-lg bg-card ring-1 ring-border',
        sePuedeMover && (arrastrando ? 'cursor-grabbing' : 'cursor-grab'),
      )}
      onPointerDown={(e) => {
        if (!sePuedeMover) return;
        /*
          Los mandos del zoom no arrastran nada.

          Aquí estaba el bug que hacía que el zoom "no funcionara": al pulsar
          un mando, este marco tomaba `setPointerCapture` para el arrastre, y
          la captura REDIRIGE también el `click` al elemento que capturó. El
          estado del zoom nunca cambiaba porque el `onClick` del botón no
          llegaba a dispararse nunca.
        */
        if ((e.target as HTMLElement).closest('[data-mandos]')) return;

        e.currentTarget.setPointerCapture(e.pointerId);
        agarre.current = { x: pos.x, y: pos.y, px: e.clientX, py: e.clientY };
        setArrastrando(true);
      }}
      onPointerMove={(e) => {
        const desde = agarre.current;
        if (!desde) return;
        setPos(recortar(desde.x + (e.clientX - desde.px), desde.y + (e.clientY - desde.py)));
      }}
      onPointerUp={() => {
        agarre.current = null;
        setArrastrando(false);
      }}
      onPointerCancel={() => {
        agarre.current = null;
        setArrastrando(false);
      }}
    >
      {/* El pase a pantalla completa, arriba y en la esquina contraria a los
          mandos del zoom: son dos cosas distintas —una amplía dentro del
          marco, la otra saca el documento del marco— y juntas se pulsarían la
          una por la otra. */}
      {(onAbrir || acciones) && (
        <div
          data-mandos=""
          className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
        >
          {acciones}
          {onAbrir && (
            <BotonOscuro etiqueta="Ver en grande" onClick={onAbrir}>
              <Maximize2 className="size-4" aria-hidden="true" />
            </BotonOscuro>
          )}
        </div>
      )}

      {/* Los mandos del zoom, sobre una pastilla oscura: encima de un recibo
          —que es blanco— cualquier control claro desaparece.

          Solo con el documento cargado: ampliar un marco vacío no hace nada, y
          un control que no responde se lee como un fallo. */}
      <div
        data-mandos=""
        hidden={!url}
        className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 rounded-full bg-sala/75 p-0.5"
      >
        <BotonOscuro
          etiqueta="Alejar"
          deshabilitado={zoom === 0}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
        >
          <Minus className="size-4" aria-hidden="true" />
        </BotonOscuro>
        <button
          type="button"
          onClick={() => setZoom(0)}
          title="Volver al tamaño normal"
          className="tabular min-w-[3rem] text-center text-2xs font-medium text-sala-tinta"
        >
          {Math.round(PASOS_DE_LA_PREVIA[zoom] * 100)} %
        </button>
        <BotonOscuro
          etiqueta="Acercar"
          deshabilitado={zoom === PASOS_DE_LA_PREVIA.length - 1}
          onClick={() => setZoom((z) => Math.min(PASOS_DE_LA_PREVIA.length - 1, z + 1))}
        >
          <Plus className="size-4" aria-hidden="true" />
        </BotonOscuro>
      </div>

      {fallo ? (
        <SoporteQueNoSeVe fallo={fallo} onReintentar={onReintentar} />
      ) : !url ? (
        // El girador en el centro del marco, con el mismo gris que el resto de
        // lo que está esperando en esta app.
        <span
          className="grid size-full place-items-center"
          role="status"
          aria-label="Cargando el soporte"
        >
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </span>
      ) : esImagen ? (
        <img
          src={url}
          alt=""
          draggable={false}
          /*
            `max-w-none`, y no es cosmético: es lo que deformaba la imagen.

            El preflight de Tailwind declara `img, video { max-width: 100%;
            height: auto }` para que ninguna imagen suelta se salga de su
            columna. Aquí eso es justo lo contrario de lo que hace falta: el
            encuadre calcula un ancho y un alto que YA guardan la proporción
            —la escala es la misma para los dos ejes— y los pinta en el
            `style`. El `max-width` del preflight le gana al ancho en línea
            —un máximo siempre gana— pero no toca el alto, así que la imagen
            se quedaba con el ancho del marco y el alto entero: estirada.

            Se veía en cuanto el documento era más ancho que el marco, que es
            SIEMPRE con el encuadre que llena la caja, y se veía peor cuanto
            más estrecho el marco —en un teléfono, brutal— y peor todavía con
            el zoom, que multiplica el ancho y no el tope.

            No le pasaba al PDF porque lo pinta un `<canvas>`, y esa regla del
            preflight es solo para `img` y `video`. De ahí que pareciera que
            fallaba con «algunas imágenes».
          */
          className="max-w-none"
          onLoad={(e) =>
            setNatural({
              ancho: e.currentTarget.naturalWidth,
              alto: e.currentTarget.naturalHeight,
            })
          }
          style={encuadre}
        />
      ) : (
        <LienzoPdf
          url={url}
          // A 1400 y no a 240: esto se mira para leer una cifra, y el tamaño
          // de una miniatura la deja borrosa.
          ancho={1400}
          onTamano={(a, h) => setNatural({ ancho: a, alto: h })}
          estilo={encuadre}
        />
      )}
    </div>
  );
}

/** Los saltos del zoom, como múltiplos de la escala que llena la caja. */
const PASOS_DE_LA_PREVIA = [1, 1.5, 2, 3];
