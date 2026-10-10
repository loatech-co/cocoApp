/**
 * The stable codes of the API errors (RFC 9457, `application/problem+json`).
 *
 * The retired v1 told its errors apart by the HTTP status and a Spanish
 * sentence, so a client that wanted to react to one rule ("the splits do not
 * add up") had to compare text. v2 sends a `code` per rule: English, snake_case, and never
 * renamed once published (iOS and the web switch on it). The sentence for the
 * person stays in `detail`, in Spanish, and may change freely.
 *
 * Each entry is the status the code goes out with and its `title`: a short
 * summary of the KIND of problem, the same for every occurrence (RFC 9457
 * §3.1.4). The first block is the fallback per status; the rest are the
 * business rules.
 *
 * The `type` URI is `PROBLEM_TYPE_BASE + code`. It identifies the problem; it
 * does not have to resolve.
 */
export const PROBLEM_TYPE_BASE = 'https://dev-cocoapp.viteri.me/problems/';

export const PROBLEMS = {
  // ── Fallbacks, one per kind of failure ─────────────────────────────────────
  bad_request: { status: 400, title: 'Solicitud incorrecta' },
  invalid_fields: { status: 400, title: 'Hay campos inválidos' },
  invalid_id: { status: 400, title: 'Identificador inválido' },
  unauthenticated: { status: 401, title: 'Hace falta iniciar sesión' },
  forbidden: { status: 403, title: 'Sin permiso' },
  not_found: { status: 404, title: 'No existe' },
  conflict: { status: 409, title: 'Choca con lo que ya hay' },
  duplicate: { status: 409, title: 'Ya existe' },
  constraint_violation: { status: 409, title: 'Rompería una relación' },
  payload_too_large: { status: 413, title: 'Demasiado grande' },
  unsupported_media_type: { status: 415, title: 'Formato no admitido' },
  validation_failed: { status: 422, title: 'No cumple una regla' },
  check_violation: { status: 422, title: 'No cumple una regla de la base de datos' },
  rate_limited: { status: 429, title: 'Demasiados intentos' },
  internal_error: { status: 500, title: 'Error interno' },
  service_unavailable: { status: 503, title: 'Servicio no disponible' },

  // ── Session and accounts of the app ────────────────────────────────────────
  invalid_credentials: { status: 401, title: 'Credenciales incorrectas' },
  invalid_token: { status: 401, title: 'Token inválido o expirado' },
  session_expired: { status: 401, title: 'La sesión expiró' },
  session_revoked: { status: 401, title: 'La sesión ya no es válida' },
  wrong_current_password: { status: 401, title: 'Contraseña actual incorrecta' },
  account_not_enabled: { status: 403, title: 'Cuenta no habilitada' },
  account_pending_approval: { status: 403, title: 'Cuenta pendiente de aprobación' },
  account_suspended: { status: 403, title: 'Cuenta suspendida' },
  credentials_not_managed: { status: 403, title: 'Credenciales no gestionadas' },
  real_accounts_protected: { status: 403, title: 'Cuentas reales protegidas' },
  weak_password: { status: 422, title: 'Contraseña débil' },
  identity_provider_failed: { status: 500, title: 'Falló el servicio de identidad' },

  // ── Administration ─────────────────────────────────────────────────────────
  user_already_active: { status: 400, title: 'La cuenta ya está activa' },
  cannot_target_self: { status: 400, title: 'No se puede sobre uno mismo' },
  last_active_admin: { status: 400, title: 'Último administrador activo' },
  password_reset_not_managed: { status: 422, title: 'Sin credenciales que restablecer' },

  // ── Transactions ───────────────────────────────────────────────────────────
  splits_unbalanced: { status: 422, title: 'El desglose no cuadra' },
  amount_breaks_splits: { status: 422, title: 'El monto descuadra el desglose' },
  transfer_same_account: { status: 422, title: 'Misma cuenta de origen y destino' },
  transfer_leg_locked: { status: 422, title: 'Una transferencia no cambia de forma' },
  account_not_owned: { status: 422, title: 'Cuenta ajena o inexistente' },
  category_not_owned: { status: 422, title: 'Categoría ajena o inexistente' },

  // ── Accounts ───────────────────────────────────────────────────────────────
  account_has_transactions: { status: 409, title: 'La cuenta tiene movimientos' },
  credit_fields_on_non_credit: { status: 400, title: 'Campos solo de crédito' },

  // ── Cost centers, categories and concepts ──────────────────────────────────
  category_cycle: { status: 422, title: 'Ciclo en el árbol' },
  category_too_deep: { status: 422, title: 'Demasiados niveles' },
  reassignment_required: { status: 409, title: 'Hay que decir a dónde pasan' },
  reassignment_target_inside: { status: 409, title: 'Destino dentro de lo que se borra' },
  template_requires_empty: { status: 409, title: 'La plantilla pide una cuenta vacía' },
  multi_payment_requires_concept: { status: 422, title: '«Varios pagos» es de un concepto' },
  multi_payment_requires_recurring: { status: 422, title: '«Varios pagos» pide recurrencia' },
  multi_payment_excludes_auto_paid: {
    status: 422,
    title: '«Varios pagos» y pago automático se excluyen',
  },
  merge_into_itself: { status: 422, title: 'Unificar consigo mismo' },
  merge_requires_concepts: { status: 422, title: 'Solo se unifican conceptos' },
  merge_source_has_children: { status: 422, title: 'El concepto tiene hijas' },

  // ── Interpretation and capture ─────────────────────────────────────────────
  interpretation_needs_text: { status: 422, title: 'Falta el texto' },
  concept_archived: { status: 422, title: 'Concepto archivado' },
  cost_center_cannot_classify: { status: 422, title: 'Un centro de costos no clasifica' },

  // ── Receipts ───────────────────────────────────────────────────────────────
  no_files: { status: 400, title: 'No llegó ningún archivo' },
  file_type_not_allowed: { status: 415, title: 'Tipo de archivo no admitido' },
  file_content_mismatch: { status: 415, title: 'El contenido no es lo que dice' },
  file_too_large: { status: 413, title: 'Archivo demasiado grande' },
  image_format_unsupported: { status: 415, title: 'Formato de imagen no admitido' },
  image_processing_unavailable: { status: 503, title: 'Sin recursos para la imagen' },
  receipt_file_missing: { status: 404, title: 'Falta el archivo del soporte' },

  // ── Health ─────────────────────────────────────────────────────────────────
  database_unavailable: { status: 503, title: 'La base de datos no responde' },
} as const satisfies Record<string, { status: number; title: string }>;

export type ProblemCode = keyof typeof PROBLEMS;

/** The `type` URI of a code. */
export function problemType(code: ProblemCode): string {
  return `${PROBLEM_TYPE_BASE}${code}`;
}
