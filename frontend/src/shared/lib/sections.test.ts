import { describe, expect, it } from 'vitest';

import { SECTIONS, ADMIN_SECTIONS } from '@/shared/lib/sections';

/**
 * Qué ve en el riel quien no es administrador.
 *
 * El riel es presentación, no control de acceso —quien decide de verdad es el
 * RolesGuard de la API—, y por eso esconder algo aquí no protege nada: solo
 * deja de decir que existe. Esconder lo que además es PROPIO de cada cuenta es
 * dejar a esa persona sin forma de llegar a sus cosas.
 */
describe('Las secciones del riel', () => {
  it('Centros de costos está para todo el mundo', () => {
    // Cada cuenta tiene su propio árbol y nace con una plantilla: lo primero
    // que va a querer hacer es ajustarla. Estuvo bajo «Administración», donde
    // quien no era admin no lo veía —aunque `/centros-de-costos` nunca pasó
    // por `RequireAdmin`, así que igual podía abrirlo escribiendo la dirección.
    const paths = SECTIONS.map((s) => s.to);

    expect(paths).toContain('/centros-de-costos');
    expect(ADMIN_SECTIONS.map((s) => s.to)).not.toContain('/centros-de-costos');
  });

  it('y no depende de ninguna preferencia', () => {
    // `requiere` es para lo que puede no existir —las cuentas, que se apagan
    // desde Ajustes—. Un árbol de categorías siempre existe: sin él no hay
    // dónde clasificar un movimiento.
    const costCenters = SECTIONS.find((s) => s.to === '/centros-de-costos');

    expect(costCenters).toBeDefined();
    expect(costCenters?.requires).toBeUndefined();
  });

  it('en Administración solo queda lo que administra a OTRAS personas', () => {
    // Es lo que hace que un administrador lo sea. Lo que administra lo propio
    // —el árbol, los ajustes, la contraseña— no pertenece a ese grupo.
    expect(ADMIN_SECTIONS.map((s) => s.to)).toEqual([
      '/administracion',
      '/administracion/bitacora',
    ]);
  });
});
