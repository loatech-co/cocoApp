---
paths:
  - 'api/**'
  - 'packages/**'
---

# La API

El detalle de cada regla está en [CONTRIBUTING.md](../../CONTRIBUTING.md);
aquí va la regla y el porqué corto. Lo de la base, en
[database.md](database.md).

**`controller` → `service` → `repository`, uno por recurso en `api/src/modules/<x>/`; el controlador no tiene lógica.**

Así cada capa se prueba sola y el HTTP no se cuela en el dominio.
[Architecture](../../CONTRIBUTING.md#architecture).

**Solo un `*.repository.ts` habla con la base; una unidad de trabajo es UN método del repositorio que abre su propia transacción.**

Un servicio que pasa un cliente de transacción de mano en mano acaba con
escrituras a medias cuando alguien olvida pasarlo. Con la seguridad por filas,
activa en producción ([ADR 0024](../../docs/adr/0024-rls-active-in-production.md)),
el repositorio entra por `Database.forUser(userId, tx => …)` en vez de
`PrismaService`, y `database.rule.spec.ts` lo exige.

**Un módulo usa otro solo por su servicio público, y solo consulta las tablas que son suyas.**

Una regla nueva del dueño de una tabla se saltaba en cada escritura que no
pasaba por él. Lo vigilan `npm run depcruise` y
`scripts/ci/table-ownership.mjs` (su lista `KNOWN` solo encoge).
[ADR 0001](../../docs/adr/0001-modular-monolith.md).

**Servicios, repositorios, tareas y controladores lanzan un `DomainError`, nunca un `XxxException` de Nest.**

`AllExceptionsFilter` es el único sitio que traduce a HTTP, y el formato
`application/problem+json` con su `code` (de `problem-codes.ts`) es contrato.
ESLint lo exige.
[Errors](../../CONTRIBUTING.md#errors).

**`/api/v2` es el único contrato; la v1 se retiró en 7.10 y todo lo que cuelga de `/api/v1` da 404.**

Un servicio por módulo y un presentador por versión (`presenters/v2/`, DTO de
`dto/v2/`, ADR 0023): dos copias de la lógica se separan. Lo que rompe el
contrato es una versión nueva, y la vieja se retira según la tabla de paradas
de [CLAUDE.md](../../CLAUDE.md).
[API versions](../../CONTRIBUTING.md#api-versions).

**Una ruta o un DTO que cambia regenera `api/openapi.v2.json` en el mismo PR** (`npm run openapi --workspace api`).

El CI lo regenera y falla si difiere: la web genera su cliente de ahí.
[API contract](../../CONTRIBUTING.md#api-contract-openapi).

**Un campo que puede faltar lleva `@IfPresent()`; `@IsOptional()` solo si `null`
significa algo** (quitar la categoría, el presupuesto, el icono), y entonces el
tipo dice `| null`. `@IsOptional()` deja pasar `null` sin validar: `date: null`
llegaba a 1970 y `amount: null` a un 500 (ronda 3, A2).

**Toda ruta nueva entra en la prueba de aislamiento.**

`user-isolation.e2e-spec.ts` ataca cada ruta con otro usuario; una ruta fuera
de la lista, o fuera de `/api/v2/`, hace fallar la prueba.

**Las pruebas usan Postgres real y fábricas; ningún mock de Prisma.**

Un mock de Prisma prueba lo que uno cree que hace la base, no lo que hace.
[Tests](../../CONTRIBUTING.md#tests).

**Los logs son JSON estructurado, sin correos, nombres ni importes.**

[Logs](../../CONTRIBUTING.md#logs) · [Secrets](../../CONTRIBUTING.md#secrets).

**Mensajes al usuario en español; identificadores, rutas, literales del contrato y variables de entorno en inglés.**

Lo nuevo se escribe en inglés; lo viejo cambia de nombre solo en su paso del
plan (7.2), nunca de paso. Una variable de entorno renombrada se lee también
por su nombre viejo (`RENAMED_ENV`) hasta contraer, porque el `.env` del
servidor no se despliega con el código
([runbook](../../docs/runbook.md#environment-variables-renamed-to-english-72-r3)).
