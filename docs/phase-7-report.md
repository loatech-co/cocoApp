# Informe de cierre de la fase 7: estándares y mantenibilidad

Fecha: 9 oct 2026. Contrastado contra `Dev` en `50b7d08` y con la revisión
independiente de J-6 (clon limpio, producción en solo lectura). El detalle de
cada paso está en [`registro-autonomo.md`](registro-autonomo.md), § 6; la
lista del senior, punto por punto, en el
[plan](plan-completo.md#lista-de-verificación-del-senior); los hallazgos de la
auditoría de 7.1, en [`standards/audit-closing.md`](standards/audit-closing.md).

## Lo hecho

- **Nombres en inglés** en código, rutas, contrato y pruebas (7.2, en dos
  carriles y más de treinta pasos). La base conserva sus nombres detrás de
  `@map` ([ADR 0026](adr/0026-database-names-stay-behind-prisma-map.md)) y
  `lint:spanish` impide que entren nombres nuevos en español.
- **Textos de usuario** en el catálogo de la web
  ([ADR 0011](adr/0011-i18next-no-literal-string.md)) y en
  `Localizable.xcstrings` en iOS, con pruebas que fallan si aparece un
  literal visible.
- **Arquitectura:** solo los repositorios hablan con Prisma, errores de
  dominio con problem+json, `/api/v2` en inglés y la v1 retirada; la web en
  `app → features → shared`, con `dependency-cruiser` vigilándolo; Prisma 7;
  cliente generado desde OpenAPI.
- **Calidad y CI:** una sola configuración de ESLint, Prettier, `knip`,
  TypeScript estricto en todos los paquetes; `ci.yml` por áreas, seguridad
  (gitleaks y auditoría), presupuestos de rendimiento, e2e sobre Postgres y
  recorridos de Playwright con axe. `scripts/merge.sh` es la única puerta a
  `Dev` y espera a todas las ejecuciones.
- **Pruebas:** API 503 unitarias y 316 e2e (cobertura 96,75 % / 87,75 %),
  web 821 (72,19 % / 68,37 %), iOS 250, recorridos 36 en escritorio y móvil.
- **Seguridad y operación:** RLS activa en producción con el rol `coco_app`
  ([ADR 0024](adr/0024-rls-active-in-production.md)), el alta de usuarios
  acotada ([ADR 0027](adr/0027-app-role-creates-only-pending-users-or-the-first-admin.md)),
  logs JSON sin datos personales, `/health` y `/ready`, respaldo completo
  cifrado con restauración probada, feature flags con caducidad.
- **Documentación:** README, arquitectura, 31 ADR, runbook, CONTRIBUTING,
  README de iOS; `CLAUDE.md` de 64 líneas con reglas por zona.
- **Modo de trabajo:** director y un ejecutor por paso. Los 67 traspasos de
  la fase se destilaron en el runbook («Owner actions») y en el plan (8.7 y
  8.8), y se borraron.

## Lo que pasa a la fase 8

Todo está escrito en el plan, Parte 4. Lo principal:

- **La contracción de 7.10** (8.7): variables de entorno viejas, rutas web
  en español y soportes en el disco del servidor, cada uno con su criterio de
  cuándo y con respaldo y restauración probada antes de borrar.
- **Lo que quedó de los nombres:** 76 nombres de archivo en español (sobre
  todo `e2e/`), los comentarios de iOS y los mensajes de la API fuera de un
  catálogo.
- `created_at` en cuatro tablas y `timestamptz` (8.4), por expandir y
  contraer.
- Flags en iOS, el árbol de desarrollo de `npm audit` (Jest 29) y lo demás de
  8.8.
- Los hallazgos de instalación y de código de la revisión de J-6 que no se
  cierren en sus pasos.

## Decisiones del dueño

Tomadas durante la fase:

- La fase 7 va **sin paradas** y se anota en el registro (5 oct).
- Una versión de la API se retira tras **una hora** sin usos con todos los
  clientes en la nueva (6 oct); la v1 salió ese día.
- **`Dev` sigue siendo la rama que despliega** hasta que el dueño cambie
  hPanel ([ADR 0009](adr/0009-trunk-based-with-dev-as-deploy-branch.md)).
- Las tablas **`import_*` no se borran** en esta fase
  ([ADR 0031](adr/0031-import-tables-stay-until-the-owner-decides.md)).
- Ningún respaldo se borra en la fase 7; la retención queda como propuesta.
- iOS en CI solo donde cambia iOS, por la cuota de macOS
  ([ADR 0030](adr/0030-ios-ci-not-on-every-push.md)).

Pendientes de él, con su procedimiento en el runbook, «Owner actions»:
rotar las claves, aplicar en producción la migración de J-5, crear el token
de release-please ([ADR 0028](adr/0028-release-please-waits-for-the-owner.md)),
el presupuesto de Actions en 0 USD, cambiar hPanel a `main`, guardar la clave
de los respaldos, aprobar la retención, y decidir sobre los extractos y sobre
cómo comparte iOS la lectura de documentos.
