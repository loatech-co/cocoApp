import { Camera, CameraOff, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

/**
 * La cámara, dentro de la aplicación.
 *
 * ── Por qué no basta con `capture` en un `<input type="file">` ──────────────
 * Porque `capture` solo lo entienden los navegadores móviles. En un escritorio
 * el atributo se ignora en silencio y el botón abre el explorador de archivos:
 * quien pulsa "Usar la cámara" en un portátil con webcam se encuentra
 * buscando una carpeta, sin ningún mensaje que explique por qué.
 *
 * `getUserMedia` funciona en los dos sitios y hace lo mismo en ambos.
 *
 * ── Por qué la cámara trasera ───────────────────────────────────────────────
 * `facingMode: environment`. En un teléfono, la que apunta al papel es la de
 * atrás; la frontal enfoca a quien sostiene el teléfono. En un portátil solo
 * hay una y la petición se cumple igual.
 *
 * ── Por qué se apaga al salir ───────────────────────────────────────────────
 * Una pista de vídeo que nadie detiene deja la luz de la cámara encendida
 * hasta que se recarga la página. Eso no es un consumo: es una aplicación
 * mirando cuando ya nadie se lo pidió.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
}) {
  const { video, state } = useCameraStream();

  return (
    <div className="flex flex-col gap-3">
      <Viewfinder video={video} state={state} />

      {/* El mismo pie que las demás fichas: a la derecha en el escritorio y
          apilado a ancho completo en el teléfono. Los dos botones se repartían
          el ancho a medias, así que «Cancelar» pesaba igual que «Capturar». */}
      <ModalFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => captureFrame(video.current, onCapture)}
          disabled={state !== 'lista'}
        >
          <Camera className="size-4" aria-hidden="true" />
          {t('transactions.camera.capture')}
        </Button>
      </ModalFooter>
    </div>
  );
}

type CameraState = 'pidiendo' | 'lista' | 'sin-permiso' | 'sin-camara';

/** Pide la cámara de atrás al montar y la suelta al desmontar. */
function useCameraStream(): { video: RefObject<HTMLVideoElement | null>; state: CameraState } {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('pidiendo');

  useEffect(() => {
    let isAlive = true;
    // Se lee con una función: el análisis de tipos no ve que la limpieza lo
    // apaga mientras se espera, y daría cada comprobación por inútil.
    const isStillAlive = (): boolean => isAlive;

    void (async () => {
      // Fuera de un contexto seguro (http) `mediaDevices` no existe, aunque el
      // tipo de la biblioteca diga que siempre está. El `as` ensancha el tipo.
      const devices = navigator.mediaDevices as Partial<MediaDevices> | undefined;
      if (!devices?.getUserMedia) {
        setState('sin-camara');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
          audio: false,
        });

        if (!isStillAlive()) {
          for (const p of stream.getTracks()) p.stop();
          return;
        }

        track.current = stream;
        if (video.current) video.current.srcObject = stream;
        setState('lista');
      } catch (e) {
        if (!isStillAlive()) return;
        // `NotFoundError` es que no hay cámara; el resto, que no dieron permiso.
        setState((e as Error).name === 'NotFoundError' ? 'sin-camara' : 'sin-permiso');
      }
    })();

    return () => {
      isAlive = false;
      for (const p of track.current?.getTracks() ?? []) p.stop();
      track.current = null;
    };
  }, []);

  return { video, state };
}

/** Saca una foto del vídeo y la entrega como archivo. */
function captureFrame(element: HTMLVideoElement | null, onCapture: (file: File) => void): void {
  if (!element) return;

  const canvas = document.createElement('canvas');
  canvas.width = element.videoWidth;
  canvas.height = element.videoHeight;
  canvas.getContext('2d')?.drawImage(element, 0, 0);

  // JPEG al 92 %: lo que importa aquí es que el OCR lea bien. El servidor lo
  // pasa después a gris y lo comprime con los mismos parámetros del lote.
  canvas.toBlob(
    (image) => {
      if (!image) return;
      onCapture(new File([image], `soporte-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    },
    'image/jpeg',
    0.92,
  );
}

function Viewfinder({
  video,
  state,
}: {
  video: RefObject<HTMLVideoElement | null>;
  state: CameraState;
}) {
  return (
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-sala">
      {state === 'lista' ? (
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="size-full object-cover"
          aria-label={t('transactions.camera.preview')}
        />
      ) : state === 'pidiendo' ? (
        <Loader2 className="size-6 animate-spin text-sala-tinta/70" aria-hidden="true" />
      ) : (
        <p className="flex max-w-xs flex-col items-center gap-2 px-4 text-center text-sm text-sala-tinta/80">
          <CameraOff className="size-6" aria-hidden="true" />
          {state === 'sin-permiso'
            ? t('transactions.camera.denied')
            : t('transactions.camera.notFound')}
        </p>
      )}
    </div>
  );
}
