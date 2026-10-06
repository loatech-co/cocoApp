import { t } from '@/shared/lib/i18n';
import {
  USER_AGENT_APP,
  type AvisosDeLaApp,
  type EventoAlPuente,
  type MensajeAlPuente,
  type SesionParaLaWeb,
} from '@/shared/lib/native-contract';

/**
 * El puente con la app del teléfono.
 *
 * ── El único sitio que conoce `window.webkit` ───────────────────────────────
 * La web embebida en el `WKWebView` no tiene refresh token: hay UNA familia de
 * refresh por dispositivo y su única dueña es la app, en el llavero. Cuando la
 * web necesita sesión se la PIDE a la app por aquí, y la app contesta con un
 * access token que la web guarda en memoria exactamente como en Safari. Nada
 * viaja por la URL, ni por cookies, ni por la red: el mensaje va dentro del
 * proceso del webview.
 *
 * Todo lo que habla con la app pasa por este archivo. Si mañana el puente
 * cambia de nombre o de forma, se toca aquí y en ningún otro sitio: `session`
 * solo sabe que hay un `pedirSesion()`, y el armazón solo que hay un
 * `registrarPuente()`.
 *
 * ── Dos señales, no una ─────────────────────────────────────────────────────
 * Un `User-Agent` se finge con una extensión del navegador. Con solo esa señal
 * la web normal dejaría de renovar por cookie y se quedaría esperando a una
 * app que no existe. Por eso `enLaApp()` exige además que el puente ESTÉ: que
 * `window.webkit.messageHandlers.cocoSesion.postMessage` sea una función. Lo
 * uno sin lo otro no es la app.
 *
 * ── Lo que la app llama hacia la web ────────────────────────────────────────
 * `registrarPuente` vive en
 * `shared/api/native-bridge.ts`: necesita a `session`, y `session` necesita
 * este archivo.
 */

/**
 * Lo que la app puede llamar desde Swift (`evaluateJavaScript`). Los avisos
 * sin respuesta (`capturado`, `primerPlano`) son contrato con iOS y viven en
 * `native-contract.ts`.
 */
interface PuenteWeb extends AvisosDeLaApp {
  /** Navega sin recargar: `react-router` cambia la ruta por dentro. */
  ir(ruta: string): void;
  /** Abre la hoja de búsqueda. La pestaña nativa «Buscar» llama aquí. */
  abrirBusqueda(): void;
  /** La app empuja una sesión: al arrancar sin ella o tras el login nativo. */
  recibirSesion(sesion: SesionParaLaWeb): void;
  /** La app cerró la sesión real (401 al renovar): la web limpia su memoria. */
  sesionCerrada(): void;
}

/*
  La declaración de `window.webkit` vive AQUÍ y en ningún otro archivo. Es
  opcional de arriba abajo porque en Safari, en Chrome y en las pruebas no
  existe nada de esto, y el código tiene que poder preguntarlo sin romperse.
*/
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        /** Con respuesta (`WKScriptMessageHandlerWithReply`). */
        cocoSesion?: { postMessage(mensaje: MensajeAlPuente): Promise<unknown> };
        /** Sin respuesta (`WKScriptMessageHandler`). */
        cocoEventos?: { postMessage(evento: EventoAlPuente): void };
      };
    };
    __coco?: PuenteWeb;
  }
}

/**
 * Cuánto se espera a la app antes de darse por vencidos.
 *
 * La app responde al instante si tiene el token en memoria, y en lo que tarde
 * `/auth/refresh` si no. Diez segundos cubren una red mala; más que eso es
 * una app colgada, y la web no puede quedarse sin pintar nada mientras tanto.
 */
const TIEMPO_MAXIMO_MS = 10_000;

/** Por qué falló el puente. `motivo` es estable; el mensaje, para la bitácora. */
export class PuenteError extends Error {
  constructor(
    readonly motivo: 'sin-puente' | 'tiempo' | 'sin-sesion' | 'respuesta',
    message = t('errors.bridge.noSession'),
  ) {
    super(message);
    this.name = 'PuenteError';
  }
}

/** Si esta web corre DENTRO de la app del teléfono. Ver «dos señales». */
export function enLaApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.userAgent.includes(USER_AGENT_APP) &&
    typeof window.webkit?.messageHandlers?.cocoSesion?.postMessage === 'function'
  );
}

function esUnaSesion(valor: unknown): valor is SesionParaLaWeb {
  if (typeof valor !== 'object' || valor === null) return false;
  const sesion = valor as Record<string, unknown>;
  return (
    typeof sesion.access_token === 'string' &&
    typeof sesion.expires_in === 'number' &&
    typeof sesion.user === 'object' &&
    sesion.user !== null
  );
}

/**
 * Pide a la app un access token.
 *
 * Rechaza con `PuenteError` si no hay puente, si la app no contesta en
 * `TIEMPO_MAXIMO_MS`, si contesta que no tiene sesión o si contesta algo que
 * no es una sesión. Quien llama —`session.renovar()`— trata cualquier rechazo
 * igual: limpia la memoria y deja que `RequireAuth` espere a que la app la
 * empuje. Lo que NUNCA hace es avisar a la app de que borre su llavero.
 */
export function pedirSesion(): Promise<SesionParaLaWeb> {
  const puente = window.webkit?.messageHandlers?.cocoSesion;
  if (!puente) return Promise.reject(new PuenteError('sin-puente', t('errors.bridge.missing')));

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const tiempo = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new PuenteError('tiempo', t('errors.bridge.timeout'))),
      TIEMPO_MAXIMO_MS,
    );
  });

  const respuesta = Promise.resolve()
    // Dentro del `then` para que un `postMessage` que lance de forma síncrona
    // acabe como rechazo y no como excepción fuera de la promesa.
    .then(() => puente.postMessage({ tipo: 'pedirSesion' }))
    .then(
      (valor) => {
        if (!esUnaSesion(valor)) {
          throw new PuenteError('respuesta', t('errors.bridge.notASession'));
        }
        return valor;
      },
      (causa: unknown) => {
        // `WKScriptMessageHandlerWithReply` rechaza con el texto del error;
        // según la versión de WebKit llega suelto o envuelto en un `Error`.
        const texto =
          causa instanceof Error ? causa.message : typeof causa === 'string' ? causa : undefined;
        throw new PuenteError('sin-sesion', texto);
      },
    );

  return Promise.race([respuesta, tiempo]).finally(() => clearTimeout(temporizador));
}

/**
 * Cuenta algo a la app, sin esperar respuesta.
 *
 * Fuera de la app no hay a quién contárselo y no pasa nada: quien llama ya
 * preguntó `enLaApp()`, y si no lo hizo, tampoco hay que romper la web por un
 * aviso que no tiene destinatario.
 */
export function avisar(evento: EventoAlPuente): void {
  window.webkit?.messageHandlers?.cocoEventos?.postMessage(evento);
}
