import { t } from '@/shared/lib/i18n';

/**
 * Por qué no se está viendo un soporte. Dos motivos, y no son el mismo.
 *
 * ── `ausente` ───────────────────────────────────────────────────────────────
 * El servidor miró el disco y el archivo no está. Es definitivo: reintentar
 * no lo va a traer. Pasa porque la base y el almacén son dos sitios
 * distintos —las fichas viven en Postgres, el mismo para todos los entornos,
 * y los archivos en disco, que no lo es—, así que un soporte importado en una
 * máquina y no sincronizado a la otra sale en la lista y no está.
 *
 * ── `sin-cargar` ────────────────────────────────────────────────────────────
 * La descarga falló y no sabemos más: un 500 del servidor, la sesión
 * caducada, la red que se cortó a mitad. El archivo puede estar
 * perfectamente. Es pasajero, así que lleva un reintento.
 *
 * Estaban juntos y contestaban lo mismo —«no está en el servidor»— a un
 * soporte que sí estaba. Es el mismo error que el 415 que se comía los
 * agotamientos de recursos: dar por definitivo lo que solo era un fallo.
 */
export type FalloDeSoporte = 'ausente' | 'sin-cargar';

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
export const BORRAR_UN_SOPORTE = t('transactions.supports.deleteWarning');
