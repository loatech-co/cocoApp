import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * Se importa SOLO el módulo Auth de Firebase, no el SDK completo: el resto
 * (Firestore, Storage, Analytics) no se usa y sumaría peso al bundle sin
 * aportar nada.
 *
 * Estas claves son públicas por diseño y viajan en el bundle. Lo que protege
 * los datos no es ocultarlas, sino que el backend verifique criptográficamente
 * el ID token en cada petición. El service account (la parte secreta) vive solo
 * en api/.env y jamás toca el frontend.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/**
 * Si falta configuración, la app no revienta con un stack ilegible: muestra una
 * pantalla que dice exactamente qué hacer. Un fallo de setup debe leerse como
 * una instrucción, no como un crash.
 */
export const firebaseConfigurado = Object.values(config).every(
  (valor) => typeof valor === 'string' && valor.length > 0 && !valor.includes('__CAMBIAR__'),
);

export const firebaseApp: FirebaseApp = initializeApp(
  firebaseConfigurado
    ? (config as Required<typeof config>)
    : { apiKey: 'sin-configurar', projectId: 'sin-configurar', appId: 'sin-configurar' },
);

export const auth: Auth = getAuth(firebaseApp);
