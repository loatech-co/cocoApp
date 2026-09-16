import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileWarning,
  FileText,
  ImagePlus,
  Loader2,
  Upload,
  Minus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import { Button } from '@/components/ui/button';
import { Confirmacion } from '@/components/ui/confirmacion';
import { ApiClientError, apiBlob } from '@/lib/api-client';
import { cargarPdfjs } from '@/lib/pdf';
import { useEliminarSoporte, useSoportes, useSubirSoportes } from '@/lib/queries';
import { cn } from '@/lib/utils';
import type { Soporte } from '@coco/types';

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

  async function aceptar(archivos: FileList | null): Promise<void> {
    if (!archivos || archivos.length === 0) return;
    setErrorDeSubida(null);
    setProgreso(0);

    try {
      await subir.mutateAsync({ archivos: Array.from(archivos), onProgreso: setProgreso });
    } catch (e) {
      setErrorDeSubida(
        e instanceof ApiClientError ? e.message : 'No se pudo subir. Inténtalo otra vez.',
      );
    }
  }

  /** El `blob:` de cada soporte, por id. Se descargan una vez y se comparten. */
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [enGrande, setEnGrande] = useState<number | null>(null);

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
          /* La miniatura se queda en su marco vacío; el pase lo dirá. */
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
  }, [transactionId, lista.length]);

  if (soportes.isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Buscando soportes…
      </p>
    );
  }

  return (
    <>
      {/* Tamaño fijo y que fluyan: con `grid-cols-N` un solo soporte se
          estiraba hasta ocupar un cuarto de la ficha y parecía otra cosa. */}
      {/* Sin ningún soporte, la lista es solo el cuadro de soltar y le toca
          todo el alto de su columna. Con miniaturas dentro, mide lo que mide. */}
      <ul className={cn('flex flex-wrap gap-3', lista.length === 0 && 'min-h-0 flex-1')}>
        {lista.map((s, i) => (
          <li key={String(s.id)}>
            <Miniatura
              soporte={s}
              url={urls[String(s.id)]}
              numero={i + 1}
              onAbrir={() => setEnGrande(i)}
            />
          </li>
        ))}

        {/* El hueco para añadir va CON las miniaturas, del mismo tamaño y en
            la misma fila: así se ve que es otra plaza de lo mismo. Sin
            ninguno, es lo único que hay, y un cuadro punteado y vacío se lee
            como "aquí falta algo" mejor que cualquier frase. */}
        <li className={cn(lista.length === 0 && 'h-full w-full')}>
          <Soltar
            subiendo={subir.isPending}
            progreso={progreso}
            solo={lista.length === 0}
            onArchivos={(a) => void aceptar(a)}
          />
        </li>
      </ul>

      {errorDeSubida && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {errorDeSubida}
        </p>
      )}

      {enGrande !== null && (
        <Pase
          transactionId={transactionId}
          lista={lista}
          urls={urls}
          indice={Math.min(enGrande, lista.length - 1)}
          onIr={setEnGrande}
          onCerrar={() => setEnGrande(null)}
        />
      )}
    </>
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
  onArchivos,
}: {
  subiendo: boolean;
  progreso: number;
  /** Sin ningún soporte todavía: ocupa el ancho y explica. */
  solo: boolean;
  onArchivos: (archivos: FileList | null) => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  return (
    // `h-full` y no solo `w-full`: el botón de dentro pide `size-full`, y sin
    // alto aquí ese `h-full` se resuelve contra una caja del tamaño de su
    // contenido y no estira. Es el eslabón que rompía la cadena
    // rejilla → lista → plaza → botón.
    <div className={cn(solo && 'h-full w-full')}
      onDragOver={(e) => {
        e.preventDefault();
        setEncima(true);
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setEncima(false);
        if (!subiendo) onArchivos(e.dataTransfer.files);
      }}
    >
      <button
        type="button"
        onClick={() => campo.current?.click()}
        disabled={subiendo}
        aria-label="Añadir soportes"
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 rounded-lg',
          'border-2 border-dashed transition-colors',
          /*
            Sin ningún soporte, el cuadro ocupa el ANCHO y explica.

            Un cuadrito de 104px solo en una fila vacía se lee como un botón
            que alguien dejó ahí: no dice qué acepta ni que se pueda arrastrar.
            Con el ancho entero hay sitio para decir las dos cosas, y es
            además la forma en la que todo el mundo reconoce una zona donde se
            sueltan archivos.

            En cuanto hay uno, vuelve a ser una plaza más de la fila: ahí el
            contexto ya lo dan las miniaturas de al lado.
          */
          // `size-full` para que llene la columna, con un suelo de 144px por
          // si el contenedor no tiene alto que dar —en la ficha de un
          // movimiento guardado la columna no estira—.
          solo ? 'size-full min-h-36 px-4 py-8' : 'size-[104px]',
          /*
            Al pasar por encima se oscurece EL FONDO, y el trazo no se toca.

            Con el borde cambiando de color, el punteado entero se redibujaba
            al entrar y al salir: una línea discontinua que parpadea de un gris
            a otro llama más la atención que el cuadro al que pertenece. El
            fondo se oscurece sin mover nada de sitio.

            El trazo se reserva para cuando se arrastra un archivo encima: ahí
            sí hay algo que decir —"esto es lo que lo va a recibir"— y el lima
            lo dice de una vez.
          */
          subiendo
            ? 'cursor-wait border-border text-muted-foreground'
            : encima
              ? 'border-acento-tinta bg-accent text-accent-foreground'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        {subiendo ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            {/* El porcentaje, no una barra: en una caja de 104px una barra son
                cuatro píxeles de alto que no se ven moverse. */}
            <span className="tabular text-xs font-medium">
              {Math.round(progreso * 100)} %
            </span>
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
              Adjuntar los soportes del movimiento
            </span>
            <span className="text-center text-xs">
              El recibo, la factura o el comprobante de pago. Arrastrarlos aquí
              o seleccionarlos del equipo.
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-center text-2xs text-muted-foreground">
              <FileText className="size-3.5 shrink-0" aria-hidden="true" />
              PDF, JPG, PNG, HEIC o WEBP
            </span>
          </>
        ) : (
          <>
            <ImagePlus className="size-6" aria-hidden="true" />
            <span className="px-2 text-center text-2xs leading-tight">Añadir soporte</span>
          </>
        )}
      </button>

      {/* El campo de verdad, escondido: el nativo no se puede peinar y el
          `<button>` de arriba sí. */}
      <input
        ref={campo}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
        className="hidden"
        onChange={(e) => {
          onArchivos(e.target.files);
          // Se vacía para que subir DOS VECES el mismo archivo dispare el
          // evento la segunda: sin esto, el valor no cambia y no pasa nada.
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Un soporte en pequeño.
 *
 * ── Por qué cuadrada y no con la proporción de una hoja ─────────────────────
 * Porque en fila son ocho, y ocho rectángulos altos hacen una pared. El
 * cuadrado ocupa menos alto, deja más por fila y recorta la hoja por donde
 * conviene: por arriba, que es donde están el membrete y el logo —lo que de
 * verdad distingue un recibo de otro de un vistazo—.
 */
function Miniatura({
  soporte,
  url,
  numero,
  onAbrir,
}: {
  soporte: Soporte;
  url?: string;
  numero: number;
  onAbrir: () => void;
}) {
  const esImagen = soporte.mime_type.startsWith('image/');

  return (
    <button
      type="button"
      onClick={onAbrir}
      disabled={!soporte.disponible}
      title={soporte.nombre_archivo}
      aria-label={`Ver ${soporte.nombre_archivo}`}
      className={cn(
        'group relative flex size-[104px] items-center justify-center overflow-hidden',
        'rounded-lg bg-card ring-1 ring-border transition-all',
        // `lima-tinta` y no `primary`, por lo mismo que el hueco de al lado:
        // el verde oscuro de `primary` no se ve sobre un fondo oscuro, y las
        // dos piezas están en la misma fila —tenían que responder igual—.
        soporte.disponible
          ? 'cursor-pointer hover:ring-2 hover:ring-acento-tinta'
          : 'cursor-not-allowed opacity-50',
      )}
    >
      {!soporte.disponible ? (
        <FileWarning className="size-6 text-muted-foreground" aria-hidden="true" />
      ) : !url ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : esImagen ? (
        <img src={url} alt="" className="size-full object-cover object-top" />
      ) : (
        <LienzoPdf url={url} />
      )}

      <span className="tabular absolute left-1.5 top-1.5 rounded-full bg-sala/70 px-1.5 text-2xs font-medium text-sala-tinta">
        {numero}
      </span>

      {/* El velo con el ojo. Una miniatura recortada no dice si se puede
          abrir: parece una ilustración. El ojo lo dice, y solo cuando hace
          falta —al pasar por encima—, sin robarle sitio al recibo el resto
          del tiempo. */}
      {soporte.disponible && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-sala/55 opacity-0',
            'transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          <Eye className="size-6 text-sala-tinta" />
        </span>
      )}
    </button>
  );
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

  // El aviso del tamaño va en una ref: en las dependencias del efecto haría
  // que el PDF se volviera a dibujar en cada render del padre.
  const onTamanoRef = useRef(onTamano);
  onTamanoRef.current = onTamano;

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
        if (vivo) onTamanoRef.current?.(vista.width, vista.height);
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
  indice,
  onIr,
  onCerrar,
}: {
  transactionId: number;
  lista: Soporte[];
  urls: Record<string, string>;
  indice: number;
  onIr: (i: number) => void;
  onCerrar: () => void;
}) {
  const eliminar = useEliminarSoporte(transactionId);
  const [confirmando, setConfirmando] = useState(false);
  const soporte = lista[indice];
  const url = urls[String(soporte.id)];
  const esImagen = soporte.mime_type.startsWith('image/');

  const [zoom, setZoom] = useState(NORMAL);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);

  // Cambiar de soporte reinicia el zoom y la página: seguir en la página 3 de
  // un recibo de una sola hoja deja el visor en blanco.
  useEffect(() => {
    setZoom(NORMAL);
    setPagina(1);
    setPaginas(1);
  }, [indice]);

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
          {!url ? (
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
            <PaginaPdf
              url={url}
              pagina={pagina}
              escala={escala}
              onPaginas={setPaginas}
            />
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
        titulo="¿Eliminar este soporte?"
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
        Se borra y no se puede deshacer. El movimiento se queda como está.
      </Confirmacion>
    </div>
  );
}

/** Un botón sobre el velo oscuro del pase. Aquí no vale la paleta de la app. */
function BotonOscuro({
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
      size="sm-icon"
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

  useEffect(() => {
    let vivo = true;
    setPintando(true);

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
