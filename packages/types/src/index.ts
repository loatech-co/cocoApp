/**
 * Tipos compartidos entre el frontend (React) y la API (NestJS).
 *
 * Son el espejo del modelo de datos: cuando cambia `schema.prisma`, este
 * paquete se actualiza en el MISMO commit, para que backend y frontend nunca
 * se desincronicen.
 *
 * Regla de dinero: los montos viajan por la API como STRING decimal, no como
 * `number`. `number` en JavaScript es un flotante IEEE-754 y no puede
 * representar exactamente 0.10 ni 0.01; sumar cientos de movimientos acumula
 * error y produce saldos que "no cuadran" por centavos — justo el síntoma que
 * destruye la confianza en una app de finanzas. El servidor opera con
 * Prisma.Decimal y serializa a string; el cliente formatea para mostrar y
 * nunca hace aritmética de dinero con el valor crudo.
 */

// ─── Alias semánticos ────────────────────────────────────────────────────────

/** Monto en COP como string decimal con 2 decimales. Ej.: "89900.00" */
export type DecimalString = string;

/** Fecha de negocio en ISO-8601 sin hora. Ej.: "2026-08-05" */
export type DateOnlyString = string;

/** Instante en ISO-8601 UTC. Ej.: "2026-08-05T14:22:10Z" */
export type DateTimeString = string;

/** Los IDs viajan como number: son BIGINT en la base, pero muy por debajo del
 *  límite seguro de JavaScript (2^53) en cualquier escenario realista. */
export type Id = number;

// ─── Enums (espejo de las columnas ENUM) ─────────────────────────────────────

export const ACCOUNT_TYPES = ['cash', 'debit', 'credit', 'bank', 'savings', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_KINDS = ['expense', 'income', 'transfer'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ['cleared', 'pending'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// ─── Envelope de la API ──────────────────────────────────────────────────────

/** Toda respuesta exitosa. La arma el TransformInterceptor global. */
export interface ApiResponse<TData, TMeta = Record<string, unknown>> {
  data: TData;
  meta: TMeta;
}

/** Metadatos de paginación. */
export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
}

export type PaginatedResponse<TItem> = ApiResponse<TItem[], PaginationMeta>;

/** Detalle de un error de validación, campo a campo. */
export interface ApiErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

/** Toda respuesta de error. La arma el AllExceptionsFilter global.
 *  `code` es un identificador estable para el cliente; `message` es texto
 *  legible en español. En producción nunca lleva stack trace ni SQL. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
  };
}

// ─── Entidades ───────────────────────────────────────────────────────────────

export interface User {
  id: Id;
  uuid: string;
  email: string;
  display_name: string | null;
  created_at: DateTimeString;
}

export interface Account {
  id: Id;
  name: string;
  type: AccountType;
  currency: 'COP';
  institution: string | null;
  last4: string | null;
  credit_limit: DecimalString | null;
  cutoff_day: number | null;
  payment_day: number | null;
  opening_balance: DecimalString;
  is_archived: boolean;
  /** Saldo DERIVADO de los movimientos. Nunca se almacena. */
  balance: DecimalString;
  /** Incluye los movimientos `pending`. */
  balance_projected: DecimalString;
  /** Solo en tarjetas: `credit_limit − saldo adeudado`. */
  available_credit: DecimalString | null;
  created_at: DateTimeString;
}

export interface Category {
  id: Id;
  name: string;
  parent_id: Id | null;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  sort_order: number;
  is_archived: boolean;
  children?: Category[];
}

export interface Tag {
  id: Id;
  name: string;
  color: string | null;
}

export interface TransactionSplit {
  id: Id;
  category_id: Id | null;
  amount: DecimalString;
  note: string | null;
}

export interface Transaction {
  id: Id;
  uuid: string;
  account_id: Id;
  date: DateOnlyString;
  /** Siempre positivo. El signo económico lo da `type`. */
  amount: DecimalString;
  type: TransactionType;
  category_id: Id | null;
  description: string | null;
  merchant: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  transfer_direction: 'out' | 'in' | null;
  external_ref: string | null;
  status: TransactionStatus;
  tags: string[];
  splits: TransactionSplit[];
  created_at: DateTimeString;
}

export interface SpendingByCategory {
  category_id: Id | null;
  name: string;
  color: string | null;
  icon: string | null;
  total: DecimalString;
  count: number;
}

export interface Dashboard {
  period: { month: string; start: DateOnlyString; end: DateOnlyString };
  accounts: Account[];
  totals: {
    assets: DecimalString;
    debts: DecimalString;
    net_worth: DecimalString;
  };
  month: {
    income: DecimalString;
    expense: DecimalString;
    net: DecimalString;
  };
  by_category: SpendingByCategory[];
}

export interface UserPreference {
  pref_key: string;
  pref_value: unknown;
}

// ─── Healthcheck ─────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok';
  db: 'ok';
  user_id: Id;
}
