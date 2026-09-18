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

/**
 * Lo que devuelve la lista de movimientos, además de la paginación.
 *
 * Las sumas son del FILTRO ENTERO, no de la página que se está viendo. El pie
 * de la tabla tiene que responder "cuánto suma lo que estoy mirando", y si
 * sumara solo las cincuenta filas de la página diría otra cosa cada vez que se
 * pasa de página.
 */
export interface TransactionsMeta extends PaginationMeta {
  sum_expense: DecimalString;
  sum_income: DecimalString;
}

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

// ─── Autenticación ───────────────────────────────────────────────────────────

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * `pending` es el estado inicial de toda cuenta: nadie entra sin que un
 * administrador la apruebe. Es el filtro contra registros no deseados.
 */
export const USER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Lo único que la API cuenta de un usuario. Jamás incluye el hash. */
export interface PerfilPublico {
  id: Id;
  email: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: DateTimeString;
}

/**
 * Respuesta de login y de refresh.
 *
 * El refresh token NO aparece aquí a propósito: viaja solo en una cookie
 * httpOnly, donde ningún JavaScript —ni un XSS— puede leerlo. El access token
 * sí viene en el cuerpo porque el cliente lo guarda en memoria y lo adjunta a
 * cada llamada.
 */
export interface SesionResponse {
  access_token: string;
  /** Segundos de vida del access token. Corto (900) para acotar un robo. */
  expires_in: number;
  user: PerfilPublico;
}

export interface RegistroResponse {
  pending_approval: boolean;
  message: string;
}

/** Acciones que quedan en la bitácora. Espejo de `AccionAuditada` en la API. */
export type AuditAction =
  | 'auth.register'
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.logout_all'
  | 'auth.token_reuse_detected'
  | 'auth.password_changed'
  | 'admin.user_approved'
  | 'admin.user_rejected'
  | 'admin.user_suspended'
  | 'admin.user_reactivated'
  | 'admin.password_reset'
  | 'admin.role_changed';

export interface AuditEntry {
  id: Id;
  action: AuditAction;
  entity: string;
  entity_id: Id | null;
  user: { email: string; name: string | null } | null;
  changes: Record<string, unknown> | null;
  ip: string | null;
  created_at: DateTimeString;
}

// ─── Importación (M4) ────────────────────────────────────────────────────────

export const IMPORT_STATUSES = ['draft', 'committed', 'discarded'] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/**
 * `duplicate` es una SOSPECHA, no un veredicto: dos cafés de $5.000 el mismo
 * día en el mismo sitio son dos movimientos reales. El sistema lo señala y la
 * persona decide.
 */
export const IMPORT_ROW_STATUSES = ['pending', 'accepted', 'duplicate', 'skipped'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export const IMPORT_SOURCES = ['image', 'pdf', 'csv', 'manual'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export interface ImportRow {
  id: Id;
  /** Orden en el documento original. */
  position: number;
  date: DateOnlyString;
  amount: DecimalString;
  type: TransactionType;
  description: string | null;
  status: ImportRowStatus;
  /** Sugerencia de T1. Es una sugerencia: se puede cambiar o quitar. */
  category_id: Id | null;
  /** 0–100. Cuánto fiarse de la sugerencia. */
  confidence: number | null;
  /** A qué movimiento ya existente se parece, si se sospecha repetición. */
  duplicate_of_id: Id | null;
}

export interface ImportBatch {
  id: Id;
  uuid: string;
  account_id: Id;
  source: ImportSource;
  status: ImportStatus;
  /** Nombre del archivo, para reconocer el lote. NUNCA su contenido. */
  label: string | null;
  ocr_provider: string | null;
  committed_at: DateTimeString | null;
  created_at: DateTimeString;
  counts: Record<ImportRowStatus, number>;
  /** Solo en el detalle: el listado de lotes no arrastra todas las filas. */
  rows?: ImportRow[];
}

// ─── Categorización automática (T1) ──────────────────────────────────────────

/** Por qué se sugirió. La interfaz lo muestra: "porque siempre lo clasificas así". */
export type MotivoDeSugerencia = 'historial' | 'regla' | 'regla-sembrada';

export interface SugerenciaDeCategoria {
  category_id: Id;
  confidence: number;
  reason: MotivoDeSugerencia;
}

// ─── Entidades ───────────────────────────────────────────────────────────────

export interface User {
  id: Id;
  uuid: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  status: UserStatus;
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
  /**
   * ── Recurrencia ─────────────────────────────────────────────────────────
   * Vive en la categoría y no en el movimiento porque lo que se repite es el
   * CONCEPTO —"el alquiler"— y no el pago de un mes concreto. Solo tiene
   * sentido en los conceptos: un centro de costos no se paga.
   */
  recurrente: boolean;
  periodicidad: Periodicidad | null;
  /** Día del mes en que se debe pagar. Los meses cortos se recortan. */
  dia_de_pago: number | null;
  /**
   * El mes de referencia del ciclo, 1–12. Solo cuando la periodicidad no es
   * mensual: "cada tres meses" no dice CUÁLES, y este dato los fija.
   */
  mes_de_pago: number | null;
  /**
   * ── Estático ────────────────────────────────────────────────────────────
   * Lo que cuelga de un centro de costos estático no se reclasifica: ni desde
   * la tabla de movimientos ni desde el modal de un movimiento. Para la
   * estructura que no se improvisa —el alquiler no cambia de categoría un
   * martes—, y para que un clic distraído en una tabla larga no mueva plata
   * de sitio sin que nadie lo note.
   *
   * La salida es hacer el centro dinámico en Centros de costos: un acto
   * deliberado, en otra pantalla. Solo se lee del CENTRO; una categoría o un
   * concepto heredan lo que diga el suyo.
   */
  estatico: boolean;
  /**
   * ── Palabras clave ──────────────────────────────────────────────────────
   * Lo que hay que encontrar en un soporte para saber que es de este concepto:
   * la razón social del acreedor, su NIT, el nombre con el que sale en la
   * factura. Se buscan en el texto que se saca del recibo —el embebido del PDF
   * o el del reconocimiento— y también en el nombre del archivo.
   *
   * Solo significan algo en un CONCEPTO: un centro de costos y una categoría son
   * sumas, y no aparecen en ninguna factura.
   *
   * Se guardan tal como se escribieron; quitar tildes y bajar a minúsculas es
   * cosa de la comparación.
   */
  /**
   * ── Presupuesto ─────────────────────────────────────────────────────────
   * Lo que se espera que cueste este concepto cada vez que toca. Puesto,
   * MANDA: la previsión del mes es este número y no el promedio de lo que
   * costó antes.
   *
   * Para lo que se sabe y no se estima —un alquiler con contrato, una
   * mensualidad—, donde promediar los tres meses anteriores da una cifra peor
   * que el dato y encima cambia sola de un mes a otro. Vacío se sigue
   * promediando, que es lo correcto para lo que varía de verdad.
   *
   * Solo significa algo en un CONCEPTO recurrente.
   */
  presupuesto: DecimalString | null;
  /**
   * ── Pago automático ─────────────────────────────────────────────────────
   * El concepto no espera a que nadie lo registre: al llegar su día de pago,
   * el movimiento se crea solo y deja de estar pendiente. Solo desde el mes en
   * que se enciende hacia adelante.
   *
   * Solo significa algo en un CONCEPTO recurrente.
   */
  pago_automatico: boolean;
  palabras_clave: string[];
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
  /**
   * El primer día del mes AL QUE PERTENECE el gasto, que no siempre es el del
   * pago: la factura de marzo se paga el 6 de abril y sigue siendo de marzo.
   */
  period: DateOnlyString;
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

/** Un punto de la línea de tendencia. */
export interface TrendPoint {
  /** `2025-03-14` con granularidad diaria, `2025-03` con mensual. */
  bucket: string;
  expense: DecimalString;
  income: DecimalString;
  net: DecimalString;
  /** Cuántos movimientos hay detrás del punto. */
  count: number;
}

/** Cada cuánto vuelve un pago recurrente. */
export const PERIODICIDADES = ['mensual', 'bimestral', 'trimestral', 'semestral', 'anual'] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number];

/** Un pago que se espera este mes y todavía no aparece. */
export interface PagoPendiente {
  category_id: Id;
  name: string;
  /** El camino hasta él: "Costos fijos · Vivienda". */
  path: string;
  periodicidad: Periodicidad;
  due_date: DateOnlyString;
  /**
   * Lo que se espera que cueste: el promedio de los meses CON pago dentro de
   * los tres anteriores. `null` si nunca se ha pagado.
   */
  expected_amount: DecimalString | null;
  /**
   * El centro de costos del que cuelga: por él se filtra la lista.
   *
   * El `id` además del nombre porque el nombre es lo que se lee y el id lo que
   * se compara: renombrar un centro no debería desmarcar nada.
   */
  centro_id: Id;
  centro: string;
}

/**
 * Los tres niveles del modelo, de arriba abajo.
 *
 * El de en medio se llamó «grupo» y ahora se llama CATEGORÍA, que es como lo
 * nombra quien usa la aplicación. Aquí está el único sitio donde se escriben:
 * lo que se enseña en pantalla sale de esta lista, no de una palabra repetida
 * por veinte archivos.
 */
export const NIVELES_DE_CATEGORIA = ['centro de costos', 'categoría', 'concepto'] as const;
export type NivelDeCategoria = (typeof NIVELES_DE_CATEGORIA)[number];

export interface Dashboard {
  period: { from: DateOnlyString; to: DateOnlyString; granularity: 'dia' | 'mes' };
  accounts: Account[];
  totals: {
    assets: DecimalString;
    debts: DecimalString;
    net_worth: DecimalString;
  };
  /** Del RANGO filtrado. */
  range: {
    income: DecimalString;
    expense: DecimalString;
    net: DecimalString;
    count: number;
  };
  by_category: SpendingByCategory[];
  /**
   * El gasto del rango repartido por CENTRO DE COSTOS, siempre en el nivel de
   * arriba aunque `by_category` haya bajado: cuánto fue fijo y cuánto variable.
   */
  expense_by_center: SpendingByCategory[];
  /** Qué nivel está desglosando `by_category`. */
  breakdown_level: NivelDeCategoria;
  /**
   * De quién son las filas del desglose. `null` en el nivel más alto, donde
   * las filas son los centros de costos y no cuelgan de nadie.
   */
  breakdown_parent: { id: Id; name: string } | null;
  /**
   * Lo que hace falta este mes para los costos fijos: la suma de todos los
   * conceptos recurrentes que vencen en el mes, pagados o no. Del mes en
   * curso, no del rango filtrado.
   */
  required_budget: DecimalString;
  /** Lo que se espera pagar este mes y todavía no aparece. */
  pending: PagoPendiente[];
  trend: TrendPoint[];
}

/**
 * El soporte de un movimiento: el recibo que prueba que ese pago existió.
 *
 * Es la FICHA, no el archivo. El binario se pide a un endpoint autenticado que
 * comprueba de quién es antes de entregarlo; aquí no hay ninguna URL que
 * funcione por sí sola, y esa es la idea.
 */
export interface Soporte {
  id: Id;
  /** 1..N: el "1 de 3" del nombre del archivo, el orden en que se miran. */
  orden: number;
  nombre_archivo: string;
  mime_type: string;
  tamano: number;
  /** Si el binario está de verdad en el almacén. */
  disponible: boolean;
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
