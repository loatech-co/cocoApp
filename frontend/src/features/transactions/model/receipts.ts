import { t } from '@/shared/lib/i18n';

/**
 * Why a receipt is not being shown. Two reasons, and they are not the same.
 *
 * ── `ausente` ───────────────────────────────────────────────────────────────
 * The server looked at the disk and the file is not there. It is final: retrying
 * will not bring it. It happens because the database and the storage are two
 * different places —the records live in Postgres, the same for every environment,
 * and the files on disk, which is not—, so a receipt imported on one
 * machine and not synced to the other shows up in the list and is not there.
 *
 * ── `sin-cargar` ────────────────────────────────────────────────────────────
 * The download failed and we know nothing more: a 500 from the server, an expired
 * session, the network cutting out halfway. The file may be
 * perfectly fine. It is transient, so it carries a retry.
 *
 * They were together and answered the same —«no está en el servidor»— to a
 * receipt that was there. It is the same mistake as the 415 that swallowed
 * resource exhaustion: taking as final what was only a failure.
 */
export type ReceiptFailure = 'ausente' | 'sin-cargar';

/**
 * The text of the confirmation to delete a receipt, written once.
 *
 * It is asked from two places —a transaction's gallery and the full-screen
 * lightbox— and it was written in both. It is the same question about
 * the same thing: written twice, the day one changes only one changes.
 *
 * It says the transaction is not deleted for the same reason the transaction's one says
 * the concept is not touched: what is being deleted is seen INSIDE the other,
 * so the trash can seems to point at the container.
 */
export const DELETE_RECEIPT = t('transactions.supports.deleteWarning');
