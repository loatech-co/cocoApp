# J-6a — instalación y arranque desde un clon limpio

Rama `fix/clean-clone-setup`. Postgres desechable y clon ya borrados. Hallazgos:

- ~~1. Sin `api/.env.test.example` ni paso de base de pruebas~~: plantilla con
  `BOOTSTRAP_ADMIN_EMAIL`; `scripts/setup-local-db.sh` crea roles, bases y `.env`.
- ~~2. `api/.env.migrate.example` en MySQL~~: Postgres, en inglés.
- ~~3. README contra `env.ts` sobre el Supabase de desarrollo~~: no lo hay.
  `npm run dev:auth` = GoTrue falso con estado en `api/.dev-auth.json`;
  `whyNotTouchRealAccounts` deja pasar un `SUPABASE_URL` local (con prueba).
  README «The first user» antes de `seed:local`.
- ~~16. «Fill the `__CAMBIAR__` values»~~: el script escribe `api/.env` local.
- ~~17. «Test» no lista lo de CI~~: depcruise, cobertura, size-limit, Storybook,
  Playwright (Chromium, Ghostscript, `E2E_*`).
- ~~28. ~90 bases `coco_e2e_*_test` viejas~~: `setup-local-db.sh --clean`.

Probado en un clon limpio contra un Postgres desechable (5433, con contraseñas):
API y web en local, alta del primer admin, `seed:local`, reinicio de `dev:auth`
sin perder la cuenta; unitarias, e2e API como `coco_app` 316/316, Playwright 36/36.

Decisiones: contraseñas locales fijas (`local-only-*`), como las `ci-only-*`; un
rol o un `.env` que ya existen no se tocan.

Pendiente:

- `scripts/dev-auth.mjs` importa `e2e/support/gotrue-falso.mjs`: si se renombra
  `e2e/`, mover esa importación.
- De otros pasos: comentarios en español de `api/.env.example` (10), `JWT_SECRET` (18).
