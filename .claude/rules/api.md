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
escrituras a medias cuando alguien olvida pasarlo. Con la seguridad por filas
(ADR 0010, PR #31 en curso) el repositorio entra por `Database.forUser(userId, tx => …)`
en vez de `PrismaService`, y una prueba lo exige.

**Un módulo usa otro solo por su servicio público, y solo consulta las tablas que son suyas.**

Una regla nueva del dueño de una tabla se saltaba en cada escritura que no
pasaba por él. Lo vigilan `npm run depcruise` y
`scripts/ci/table-ownership.mjs` (su lista `KNOWN` solo encoge).
[ADR 0001](../../docs/adr/0001-modular-monolith.md).

**Servicios, repositorios, tareas y controladores lanzan un `DomainError`, nunca un `XxxException` de Nest.**

`AllExceptionsFilter` es el único sitio que traduce a HTTP, y el formato
`{ error: { code, message, details } }` es contrato. ESLint lo exige.
[Errors](../../CONTRIBUTING.md#errors).

**La v2 es el contrato; la v1 responde igual que siempre y no se toca.**

La v2 no tiene lógica propia: su controlador llama al mismo servicio y traduce
en el borde (`toV2`, DTO de `dto/v2/`), porque dos copias de la lógica se
separan. Lo que rompe el contrato es una versión nueva. Cuándo se retira la
v1: la tabla de paradas de [CLAUDE.md](../../CLAUDE.md).
[API versions](../../CONTRIBUTING.md#api-versions).

**Una ruta o un DTO que cambia regenera `api/openapi.v1.json` y `openapi.v2.json` en el mismo PR** (`npm run openapi --workspace api`).

El CI lo regenera y falla si difiere: la web genera su cliente de ahí.
[API contract](../../CONTRIBUTING.md#api-contract-openapi).

**Toda ruta nueva entra en la prueba de aislamiento de su versión.**

`user-isolation.e2e-spec.ts` (v1) y `user-isolation.v2.e2e-spec.ts` (v2) atacan
cada ruta con otro usuario; una ruta fuera de la lista hace fallar la prueba.

**Las pruebas usan Postgres real y fábricas; ningún mock de Prisma.**

Un mock de Prisma prueba lo que uno cree que hace la base, no lo que hace.
[Tests](../../CONTRIBUTING.md#tests).

**Los logs son JSON estructurado, sin correos, nombres ni importes.**

[Logs](../../CONTRIBUTING.md#logs) · [Secrets](../../CONTRIBUTING.md#secrets).

**Mensajes al usuario en español; identificadores, rutas y literales del contrato v2 en inglés.**

Lo nuevo se escribe en inglés; lo viejo cambia de nombre solo en su paso del
plan (7.2), nunca de paso.
