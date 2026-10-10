# Tren de integración — #87, #91, #93, #88, #94, #98, #92

**Hecho** (Dev lineal, todo con `merge.sh`, cada despliegue comprobado con `/health` = sha, web 200, `/ready` ok):

| PR  | Rama                                | sha en Dev |
| --- | ----------------------------------- | ---------- |
| #87 | `refactor/web-app-features-english` | `d1a8d169` |
| #91 | `refactor/bridge-english`           | `03842e02` |
| #93 | `refactor/web-routes-english`       | `5f6cb3e9` |
| #88 | `refactor/env-vars-english`         | `77ae49e1` |
| #94 | `docs/claude-md-rules-current`      | `30b5852d` |
| #98 | `fix/backup-app-private`            | `db81513c` |
| #92 | `refactor/db-constraint-names`      | `85e6135e` |

- Conflictos de #91 sobre #87 (`app-shell`, `require-auth` y sus pruebas, línea base de `lint:spanish`): nombres de #87 + puente de #91; línea base regenerada con `--update`. iOS `xcodebuild test` verde sobre #91 y #93.
- #93: el recorrido «the redirect replaces the old address in the history» fallaba en CI (Chromium salta al volver una entrada alcanzada sin gesto; todo `goto()` lo es). Ahora cuenta `history.length` en vez de `goBack()`.
- #94: quitado el alcance `types` de `commitlint.config.js` y de `CONTRIBUTING.md`, y la nota de cobertura de `packages/types`.
- Tras #88: `api.log` sin «deprecated».
- #92: respaldo completo `coco-20261009-185823.tar.age` (restauración local probada: 41 tablas, igual al manifiesto); `deploy-migrations.sh` aplicó solo `20261009120000_…`; `tables_without_rls 0, policies 14, open_grants 0`; `migrate diff` vacío. Recuentos iguales a la referencia antes y después.

**Decisiones**

- #98 (nuevo): el respaldo no incluía el esquema `app_private` (ADR 0024) y su prueba de restauración fallaba en la primera política. Ahora se vuelca y se restaura.

**Pendiente**

- El respaldo `coco-20261009-185546.tar.age` (primer intento, sin `app_private`) sigue en `respaldos/`: no se puede restaurar tal cual. No se borró (lo decide el dueño).
- El hook pre-push de iOS falla en un worktree sin `frontend/dist` construido (la prueba de humo lee la web compilada). #98 se empujó con `LEFTHOOK=0` por eso; CI pasó.
