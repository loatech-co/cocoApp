import { Camera, CameraOff, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

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
export function Camara({
  onTomar,
  onCerrar,
}: {
  onTomar: (archivo: File) => void;
  onCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const pista = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<'pidiendo' | 'lista' | 'sin-permiso' | 'sin-camara'>(
    'pidiendo',
  );

  useEffect(() => {
    let vivo = true;

    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado('sin-camara');
        return;
      }

      try {
        const flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
          audio: false,
        });

        if (!vivo) {
          for (const p of flujo.getTracks()) p.stop();
          return;
        }

        pista.current = flujo;
        if (video.current) video.current.srcObject = flujo;
        setEstado('lista');
      } catch (e) {
        if (!vivo) return;
        // `NotFoundError` es que no hay cámara; el resto, que no dieron permiso.
        setEstado((e as Error).name === 'NotFoundError' ? 'sin-camara' : 'sin-permiso');
      }
    })();

    return () => {
      vivo = false;
      for (const p of pista.current?.getTracks() ?? []) p.stop();
      pista.current = null;
    };
  }, []);

  function disparar(): void {
    const elemento = video.current;
    if (!elemento) return;

    const lienzo = document.createElement('canvas');
    lienzo.width = elemento.videoWidth;
    lienzo.height = elemento.videoHeight;
    lienzo.getContext('2d')?.drawImage(elemento, 0, 0);

    // JPEG al 92 %: lo que importa aquí es que el OCR lea bien. El servidor lo
    // pasa después a gris y lo comprime con los mismos parámetros del lote.
    lienzo.toBlob(
      (imagen) => {
        if (!imagen) return;
        onTomar(new File([imagen], `soporte-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-sala">
        {estado === 'lista' ? (
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className="size-full object-cover"
            aria-label="Vista de la cámara"
          />
        ) : estado === 'pidiendo' ? (
          <Loader2 className="size-6 animate-spin text-sala-tinta/70" aria-hidden="true" />
        ) : (
          <p className="flex max-w-xs flex-col items-center gap-2 px-4 text-center text-sm text-sala-tinta/80">
            <CameraOff className="size-6" aria-hidden="true" />
            {estado === 'sin-permiso'
              ? 'El navegador no concedió acceso a la cámara. Se puede habilitar desde los permisos del sitio.'
              : 'No se detectó ninguna cámara en este equipo.'}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCerrar} className="flex-1">
          <X className="size-4" aria-hidden="true" />
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={disparar}
          disabled={estado !== 'lista'}
          className="flex-1"
        >
          <Camera className="size-4" aria-hidden="true" />
          Capturar
        </Button>
      </div>
    </div>
  );
}
