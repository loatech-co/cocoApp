import { t } from '@/shared/lib/i18n';
import {
  USER_AGENT_APP,
  type AvisosDeLaApp,
  type BridgeEvent,
  type BridgeMessage,
  type BridgeSession,
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
interface WebBridge extends AvisosDeLaApp {
  /** Navega sin recargar: `react-router` cambia la ruta por dentro. */
  ir(path: string): void;
  /** Abre la hoja de búsqueda. La pestaña nativa «Buscar» llama aquí. */
  abrirBusqueda(): void;
  /** La app empuja una sesión: al arrancar sin ella o tras el login nativo. */
  recibirSesion(session: BridgeSession): void;
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
        cocoSesion?: { postMessage(message: BridgeMessage): Promise<unknown> };
        /** Sin respuesta (`WKScriptMessageHandler`). */
        cocoEventos?: { postMessage(event: BridgeEvent): void };
      };
    };
    __coco?: WebBridge;
  }
}

/**
 * Cuánto se espera a la app antes de darse por vencidos.
 *
 * La app responde al instante si tiene el token en memoria, y en lo que tarde
 * `/auth/refresh` si no. Diez segundos cubren una red mala; más que eso es
 * una app colgada, y la web no puede quedarse sin pintar nada mientras tanto.
 */
const TIMEOUT_MS = 10_000;

/** Por qué falló el puente. `motivo` es estable; el mensaje, para la bitácora. */
export class BridgeError extends Error {
  constructor(
    readonly reason: 'sin-puente' | 'tiempo' | 'sin-sesion' | 'respuesta',
    message = t('errors.bridge.noSession'),
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

/** Si esta web corre DENTRO de la app del teléfono. Ver «dos señales». */
export function isInNativeApp(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    navigator.userAgent.includes(USER_AGENT_APP) &&
    typeof window.webkit?.messageHandlers?.cocoSesion?.postMessage === 'function'
  );
}

function isBridgeSession(value: unknown): value is BridgeSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Record<string, unknown>;
  return (
    typeof session.access_token === 'string' &&
    typeof session.expires_in === 'number' &&
    typeof session.user === 'object' &&
    session.user !== null
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
export function requestSession(): Promise<BridgeSession> {
  const handler = window.webkit?.messageHandlers?.cocoSesion;
  if (!handler) return Promise.reject(new BridgeError('sin-puente', t('errors.bridge.missing')));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BridgeError('tiempo', t('errors.bridge.timeout'))),
      TIMEOUT_MS,
    );
  });

  const response = Promise.resolve()
    // Dentro del `then` para que un `postMessage` que lance de forma síncrona
    // acabe como rechazo y no como excepción fuera de la promesa.
    .then(() => handler.postMessage({ tipo: 'pedirSesion' }))
    .then(
      (value) => {
        if (!isBridgeSession(value)) {
          throw new BridgeError('respuesta', t('errors.bridge.notASession'));
        }
        return value;
      },
      (cause: unknown) => {
        // `WKScriptMessageHandlerWithReply` rechaza con el texto del error;
        // según la versión de WebKit llega suelto o envuelto en un `Error`.
        const detail =
          cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : undefined;
        throw new BridgeError('sin-sesion', detail);
      },
    );

  return Promise.race([response, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Cuenta algo a la app, sin esperar respuesta.
 *
 * Fuera de la app no hay a quién contárselo y no pasa nada: quien llama ya
 * preguntó `enLaApp()`, y si no lo hizo, tampoco hay que romper la web por un
 * aviso que no tiene destinatario.
 */
export function notifyApp(event: BridgeEvent): void {
  window.webkit?.messageHandlers?.cocoEventos?.postMessage(event);
}
