import { Camera, CameraOff, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';

/**
 * The camera, inside the app.
 *
 * ── Why `capture` on an `<input type="file">` is not enough ─────────────────
 * Because only mobile browsers understand `capture`. On a desktop
 * the attribute is silently ignored and the button opens the file explorer:
 * whoever presses "Usar la cámara" on a laptop with a webcam finds themselves
 * looking for a folder, with no message explaining why.
 *
 * `getUserMedia` works in both places and does the same in both.
 *
 * ── Why the back camera ─────────────────────────────────────────────────────
 * `facingMode: environment`. On a phone, the one that points at the paper is the
 * back one; the front one focuses on whoever is holding the phone. On a laptop there is only
 * one and the request is met all the same.
 *
 * ── Why it turns off on leaving ─────────────────────────────────────────────
 * A video track nobody stops leaves the camera light on
 * until the page reloads. That is not a resource drain: it is an app
 * watching when nobody asked it to anymore.
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

      {/* The same footer as the other sheets: on the right on desktop and
          stacked full width on the phone. The two buttons split
          the width in half, so «Cancelar» weighed the same as «Capturar». */}
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

/** Asks for the back camera on mount and releases it on unmount. */
function useCameraStream(): { video: RefObject<HTMLVideoElement | null>; state: CameraState } {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('pidiendo');

  useEffect(() => {
    let isAlive = true;
    // It is read through a function: type analysis does not see that the cleanup
    // turns it off while waiting, and it would deem every check useless.
    const isStillAlive = (): boolean => isAlive;

    void (async () => {
      // Outside a secure context (http) `mediaDevices` does not exist, even though the
      // library type says it is always there. The `as` widens the type.
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
        // `NotFoundError` means there is no camera; the rest, that permission was not given.
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

/** Takes a photo from the video and hands it over as a file. */
function captureFrame(element: HTMLVideoElement | null, onCapture: (file: File) => void): void {
  if (!element) return;

  const canvas = document.createElement('canvas');
  canvas.width = element.videoWidth;
  canvas.height = element.videoHeight;
  canvas.getContext('2d')?.drawImage(element, 0, 0);

  // JPEG at 92 %: what matters here is that the OCR reads well. The server then
  // turns it gray and compresses it with the same parameters as the batch.
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
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-stage">
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
        <Loader2 className="size-6 animate-spin text-stage-ink/70" aria-hidden="true" />
      ) : (
        <p className="flex max-w-xs flex-col items-center gap-2 px-4 text-center text-sm text-stage-ink/80">
          <CameraOff className="size-6" aria-hidden="true" />
          {state === 'sin-permiso'
            ? t('transactions.camera.denied')
            : t('transactions.camera.notFound')}
        </p>
      )}
    </div>
  );
}
