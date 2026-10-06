# Coco

Libro de caja personal: los movimientos son el centro, y saldos, presupuestos, deudas y metas se derivan de ellos, nunca se guardan. Monolito modular: un proceso NestJS sirve la API y la web, con Postgres, Auth y el bucket de soportes en Supabase. Despliega Hostinger con cada avance de `Dev`.

| Carpeta            | Qué es                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------- |
| `api/`             | NestJS + Prisma; `/api/v2` es el contrato, `/api/v1` está en retirada                   |
| `frontend/`        | React + Vite: `app/` → `features/` → `shared/` (`shared/ui` en diseño atómico)          |
| `packages/`        | `lectura` (leer un documento) y `flags`                                                 |
| `ios/`             | App híbrida SwiftUI + la web; captura desde Wallet, SMS y Atajos                        |
| `e2e/`, `scripts/` | Recorridos de Playwright; operación (`merge.sh`, `respaldar.sh`, `nueva-migracion.sh`…) |

## Comandos

```bash
npm ci && npm run dev                      # instalar y correr api + web (dev:api, dev:web por separado)
npm run typecheck && npm run lint && npx prettier --check . && npx knip && npm run depcruise
npm test && npm run test:e2e --workspace api && npm run e2e   # unitarias, e2e de la API (Postgres local), recorridos
npm run openapi --workspace api && npm run generate:api --workspace frontend   # contrato y cliente
scripts/nueva-migracion.sh <verb>_<object>  # migración local; producción: scripts/desplegar-migraciones.sh
bash scripts/merge.sh [rama]                # la única forma de integrar en Dev (por defecto, la rama actual)
```

## Convenciones (el detalle, en [CONTRIBUTING.md](CONTRIBUTING.md))

- Formato Prettier y ESLint sin avisos — [Formatting](CONTRIBUTING.md#formatting), [Lint](CONTRIBUTING.md#lint).
- Commits convencionales, asunto en minúsculas — [Commit messages](CONTRIBUTING.md#commit-messages).
- Un módulo habla con otro solo por su servicio público — [Architecture](CONTRIBUTING.md#architecture).
- Errores de dominio (`DomainError`), nunca excepciones HTTP en servicios — [Errors](CONTRIBUTING.md#errors).
- Ningún archivo de más de 300 líneas ni función de más de 50 — [Size limits](CONTRIBUTING.md#size-limits).
- Pruebas contra Postgres real, sin mocks de Prisma — [Tests](CONTRIBUTING.md#tests).
- Lo que rompe el contrato es una versión nueva — [API versions](CONTRIBUTING.md#api-versions).
- Lo específico de cada zona: [api](.claude/rules/api.md), [database](.claude/rules/database.md), [web](.claude/rules/web.md) (con las 18 reglas de la interfaz), [ios](.claude/rules/ios.md).

## Reglas que nunca se rompen

- **Nada entra en `Dev` sin PR, CI en verde y `scripts/merge.sh`; nunca `git push` a `Dev` ni a `main`.** `gh` daba por bueno un PR con checks pendientes; `merge.sh` exige todos en verde.
- **Nunca se desarrolla contra producción.** La API se niega a arrancar contra una base remota; los datos reales solo llegan con `scripts/traer-datos-a-local.sh`.
- **Migraciones aditivas y en producción antes que el código; lo que rompe va por expandir y contraer.** El código viejo sigue corriendo minutos sobre el esquema nuevo.
- **Ni secretos, ni datos personales, ni importes** en código, logs, pruebas, commits o traspasos. Son datos financieros reales de personas reales.
- **Código y documentación técnica en inglés; lo que ve el usuario, en español.**
- **Una decisión que el plan no cubre se escribe en un ADR (`docs/adr/`) antes de implementarla.** Si no, la siguiente sesión la deshace sin saber que existía.

## Modo de trabajo

- La sesión principal **dirige**: coordina, lanza y valida; no edita código ni lee archivos grandes.
- Cada paso lo hace un **ejecutor** nuevo (`/paso <id>`, agente `ejecutor-de-paso`), que lee solo su sección del plan y el traspaso anterior, y deja un traspaso de menos de 30 líneas en `.claude/traspasos/` y un informe de menos de 10. Un paso grande se parte, un ejecutor por subpaso.
- Al cerrar, lo que valga de los documentos de trabajo va a un ADR o al runbook, y se borran.
- Memoria: plan + traspasos = dónde va el trabajo; `MEMORY.md` = cómo trabaja el dueño; Engram = decisiones e incidentes de largo plazo.
- Más de 100k de contexto en la sesión principal = alguien se salta este modelo. **Por qué:** la sesión del 4–5 oct gastó el 97 % de sus tokens releyendo ~455k de contexto en cada uno de 1.784 turnos.

## Paradas y borrados (la única tabla; el plan, el runbook y el agente remiten aquí)

| Regla                                                                                                                                                                                                             | Por qué                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La fase 7 (y los pasos R) va sin paradas**, por mandato del dueño (5 oct 2026): se sigue y se anota en `docs/registro-autonomo.md`.                                                                             | Las paradas estaban en cuatro sitios que se contradecían, y cada ejecutor obedecía la versión que le tocaba leer.                                                             |
| **Todo borrado en la base o en el servidor** lleva antes, SIEMPRE, el respaldo completo (`scripts/respaldar.sh`: `public` + `auth` + bucket, cifrado, fuera del portátil) y una restauración probada justo antes. | El plan gratuito de Supabase no recupera a un punto en el tiempo; sin `auth` ni el bucket no vuelven ni usuarios ni soportes; un respaldo nunca restaurado no es un respaldo. |
| **`import_batches`, `import_rows` y `transactions.import_batch_id` no se borran en esta fase.**                                                                                                                   | Falta que el dueño decida si los extractos bancarios siguen en el producto; son la red que más gastos cubriría.                                                               |
| **La v1 se retira tras 1 hora sin usos** (`scripts/ops/v1-usage.mjs`), con la web y iOS ya en la v2.                                                                                                              | Sin clientes propios en la v1, una hora basta; los siete días solo se cumplían si el iPhone pasaba una semana con la firma caducada.                                          |
| **Se para el paso y se avisa** si faltan credenciales o cuentas, si `migrate status` trae pendientes inesperadas, o si producción se rompe sin vuelta atrás (restaurar en producción lo hace el dueño).           | Son bloqueos, no paradas de fase: seguir a ciegas ahí convierte un error en uno irreparable.                                                                                  |

## Dónde está todo

[README](README.md) · [CONTRIBUTING](CONTRIBUTING.md) · [arquitectura](docs/architecture.md) · [ADR](docs/adr/) · [runbook](docs/runbook.md) · [plan](docs/plan-completo.md) · [registro](docs/registro-autonomo.md) · [estándares](docs/standards/) · [iOS](ios/README.md) · traspasos en `.claude/traspasos/`.
