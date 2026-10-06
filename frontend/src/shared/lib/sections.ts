import { LayoutDashboard, ScrollText, ShieldCheck, Tags, UserCog, Wallet } from 'lucide-react';
import { type ComponentType } from 'react';

import { t } from '@/shared/lib/i18n';

/*
  Las secciones de la aplicación: la lista de lo que existe y a dónde lleva.

  Viven en `shared` y no en el armazón porque Mi cuenta (una feature) ofrece
  en el teléfono las de administración, y una feature no importa de `app/`.
  Lo que decide cuáles VE cada quien —`useSecciones`— sí es del armazón.
*/

export interface Section {
  to: string;
  label: string;
  Icon: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean;
    fill?: string;
    fillOpacity?: number;
    strokeWidth?: number;
  }>;
  exact: boolean;
  /** Preferencia que debe estar activa para que la sección exista. */
  requires?: 'cuentas';
}

/**
 * Secciones implementadas. El resto (Presupuestos, Fijos, Deudas, Reportes) se
 * añaden en su fase: mostrar enlaces muertos es peor que no mostrarlos.
 *
 * `requiere` marca las que dependen de una preferencia. Se declara aquí, en la
 * propia lista, para que el ORDEN del menú sea el orden de este arreglo y nada
 * más — insertar una sección condicional por posición se rompe en silencio en
 * cuanto alguien reordena.
 */
/**
 * El inicio, con nombre propio.
 *
 * La barra de abajo del teléfono lo nombra por separado —es su primer hueco, y
 * los otros cuatro no son secciones sino cosas que se hacen—, así que la
 * sección tiene que poder citarse sin entrar por el índice de un arreglo, que
 * se rompe en silencio en cuanto alguien reordena la lista.
 */
export const DASHBOARD: Section = {
  to: '/',
  label: t('shell.sections.dashboard'),
  Icon: LayoutDashboard,
  exact: true,
};

export const SECTIONS: readonly Section[] = [
  DASHBOARD,
  // Para quien no lleva cuentas, este enlace no existe. Ni oculto con CSS ni
  // deshabilitado: ausente.
  {
    to: '/cuentas',
    label: t('shell.sections.accounts'),
    Icon: Wallet,
    exact: false,
    requires: 'cuentas',
  },
  /*
    ── Centros de costos es de TODOS, no de administración ──────────────────
    Estuvo bajo «Administración», con este argumento: se configura una vez y
    casi no se toca, así que no es una sección del día a día.

    El argumento se cayó cuando los centros de costos pasaron a ser de cada
    cuenta. Antes parecían estructura compartida —algo que alguien deja puesto
    para los demás—; ahora cada cuenta tiene la suya, nace con una plantilla y
    lo primero que va a querer hacer es ajustarla: renombrar lo que no le
    sirve, agregar sus conceptos. Esconderlo a quien no es admin dejaba a esa
    persona sin ninguna forma de llegar a su propio árbol desde el riel.

    Y nunca estuvo protegido de verdad: `/centros-de-costos` no pasa por
    `RequireAdmin`, así que cualquiera podía abrirlo escribiendo la dirección.
    Lo único que hacía el menú era no decir que existía.

    Va el último de los tres porque sigue siendo lo que menos se visita: se
    entra a mirar el resumen, no a ordenar la taxonomía.
  */
  { to: '/centros-de-costos', label: t('shell.sections.costCenters'), Icon: Tags, exact: false },
];

/**
 * Solo para administradores.
 *
 * No se muestran ocultos con CSS ni "deshabilitados": si no eres admin, estos
 * enlaces no existen en el DOM. Aun así, quien decide de verdad es el
 * RolesGuard del backend — esto es presentación, no control de acceso.
 *
 * Quedan las dos que administran a OTRAS personas, que es lo que hace que un
 * administrador lo sea. Lo que administra lo propio no pertenece aquí.
 */
export const ADMIN_SECTIONS: readonly Section[] = [
  // 'Usuarios', no 'Cuentas': en esta misma barra 'Cuentas' ya significa
  // tarjetas y ahorros. Dos cosas distintas con el mismo nombre a diez píxeles
  // de distancia.
  { to: '/administracion', label: t('shell.sections.users'), Icon: ShieldCheck, exact: true },
  {
    to: '/administracion/bitacora',
    label: t('shell.sections.auditLog'),
    Icon: ScrollText,
    exact: false,
  },
];

/** Mi cuenta no es una sección del riel, pero sí una página que existe. */
export const MY_ACCOUNT: Section = {
  to: '/mi-cuenta',
  label: t('shell.account.myAccount'),
  Icon: UserCog,
  exact: true,
};
