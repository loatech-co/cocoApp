---
paths:
  - 'api/prisma/**'
  - 'api/src/prisma/**'
  - 'api/src/**/*.repository.ts'
  - 'scripts/*migracion*.sh'
  - 'scripts/cerrar-el-api-de-datos.sql'
  - 'scripts/respaldar.sh'
---

# La base de datos

Los procedimientos están en el [runbook](../../docs/runbook.md#migrations); los
borrados y sus condiciones, en la tabla de paradas de
[CLAUDE.md](../../CLAUDE.md).

**Una migración es aditiva y llega a producción antes que el código que la usa.**

El servidor despliega minutos después del push, y mientras tanto el código
viejo corre contra el esquema nuevo. [ADR 0008](../../docs/adr/0008-expand-and-contract-migrations.md).

**Lo que rompe —renombrar, borrar, cambiar un tipo— va por expandir y contraer.**

Expandir (lo nuevo junto a lo viejo, escribiendo los dos), rellenar y
comprobar fila a fila, mover todos los lectores, desplegar, y solo entonces
contraer, con las condiciones de la tabla de paradas.

**Un nombre de Prisma se cambia con `@map` / `@@map`; el nombre físico no se mueve.**

Renombrar el modelo o el campo no toca el SQL ni rompe el código desplegado;
mover una columna sí. Así se hacen los renombres de 7.2
([rename-plan](../../docs/standards/rename-plan.md)); tablas y columnas
físicas en `snake_case` plural.

**El esquema solo cambia por migración: `scripts/nueva-migracion.sh <verb>_<object>`, nunca un `CREATE TABLE` a mano.**

Lo escrito a mano queda fuera de `schema.prisma`, y el siguiente `diff`
intenta crearlo otra vez. Nombre `YYYYMMDDHHMMSS_<verb>_<object>` en inglés y
en UTC, posterior a todos los existentes.

**A producción solo con `scripts/desplegar-migraciones.sh`, leyendo `migrate status` antes de confirmar.**

Esa confirmación es lo único entre una errata y producción; el script cierra
además la API de datos de Supabase, y sus tres cuentas deben dar `0`
([ADR 0007](../../docs/adr/0007-close-supabase-data-api-by-script.md)): una
tabla nueva nace abierta a la clave pública.

**Toda tabla de un usuario se lee y se escribe dentro de `forUser`, con su política de RLS.**

La API corre como `coco_app`, sin `BYPASSRLS`; una consulta fuera de
`forUser` ve cero filas. Una tabla nueva trae su política en la misma
migración. ([ADR 0010](../../docs/adr/0010-rls-with-application-role.md);
implementación en el PR #31, aún sin activar en producción.)

**Toda tabla nueva lleva `created_at` y `updated_at`; restricciones e índices con nombre normalizado (`uq_`, `fk_`, `idx_`).**

Con el nombre se sabe qué restricción saltó en un error de Postgres sin abrir
el esquema. Las tablas viejas que aún no los tienen se ponen al día en 7.2.

**La idempotencia de lo que entra de fuera va por `external_ref` único.**

Repetir una captura o una carga no duplica nada.
[ADR 0005](../../docs/adr/0005-idempotency-by-external-ref.md).
