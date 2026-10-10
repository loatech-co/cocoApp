# J-6e — los tres restos del cierre

Rama `fix/j6e-closing-leftovers`, un PR.

Hecho:

- Plan 7.8: la frase de `FeatureFlags` en iOS queda tachada y marcada como
  descartada (iOS no lee `/auth/me`, el puente no lleva flags, ADR 0015);
  quitada también de la lista de iOS en 8.x.
- Auditoría: `auditChangesV2` (`api/src/presenters/v2/admin.presenter.ts`) lee
  `de`/`a`/`motivo` como `from`/`to`/`reason` y `credenciales_incorrectas` como
  `invalid_credentials`. Es el único lector: la web no pinta `changes` y no hay
  exportaciones que lo lean. Prueba unitaria y e2e con filas de forma vieja.
  Descripción del contrato y cliente regenerados. Plan 8.7: fila nueva con el
  criterio para reescribir las filas viejas (respaldo antes, recuento a cero).
- Variantes `movil:`/`escritorio:` → `mobile:`/`desktop:` en `index.css`, en
  todos los usos, en `eslint.config.js`, `CONTRIBUTING.md` y `rules/web.md`.
  CSS de producción idéntico byte a byte tras sustituir los nombres.
  `lint:spanish` ahora lee los `@custom-variant` de las hojas de estilo
  (comprobado: `movil` falla).

Decisiones: las claves viejas se escriben como datos (`Map`, `Object.fromEntries`)
para no declarar nombres en español.

Pendiente: `--hueco-de-la-barra` y otras propiedades CSS en español no las lee
el lint (solo variantes). Borrado: base `coco_e2e_j6e_test`.
