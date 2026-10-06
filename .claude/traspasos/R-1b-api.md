# R-1b-api: arreglos de seguridad en la API

Rama `fix/api-hardening`, PR #47 contra `Dev`. No se integró: el director lo integra con `scripts/merge.sh`.

## Hecho (los 6 puntos, confirmados sin resolver en Dev)

- Splits: la categoría tiene que ser del usuario (`categoriesBelongTo`, 422). `unificar` filtra los splits por `transaction.userId` y las filas de importación por `batch.userId`. El cuadre puro pasó a `transactions.splits.ts` (por el límite de 300 líneas). Va con su e2e en `user-isolation.e2e-spec.ts`.
- Ghostscript: `-dSAFER`, 20 s con SIGKILL y bytes mágicos en `validateUploads` (415).
- IP: `trust proxy` = `TRUST_PROXY_HOPS` (1 por defecto) y un throttler `login-email` (10 cada 15 min, v1 y v2 comparten la clave, el correo va en hash). Sonda `LOG_PROXY_HEADERS` apagada: registra solo la forma de las cabeceras.
- `unhandledRejection` sale con `exit(0)` (`common/process/safety-net.ts`).
- `/health` v1 y v2: `{ status, version }`, leído del `.git` al arrancar (`deploy-version.ts`). Se regeneraron el OpenAPI y el cliente orval.
- `.env.example`: aviso sobre `BOOTSTRAP_ADMIN_EMAIL`, que va vacía.

## Decisiones

- 1 salto, por deducción (no había WebSearch ni ssh): lsnode conecta LiteSpeed con Node por un socket local y LiteSpeed añade la IP a `X-Forwarded-For`. Si hay un CDN delante, son 2.
- La versión se lee de los archivos de `.git`, sin `git` ni un paso de build: no lanza procesos y no hace falta tocar hbuilds.

## Pendiente

- Tras desplegar: poner `LOG_PROXY_HEADERS=true` en `hbuilds/config/.env`, mirar las líneas `proxy_headers` (que `reqIpIsLastForwarded` y `realIpIsLastForwarded` den true), y vaciarla. Comprobar que `/api/v2/health` trae `version`.
- FK compuesta `(user_id, category_id)` en splits: es una migración y le toca al paso de la RLS.
- El limitador vive en memoria y LiteSpeed levanta varios procesos: cada uno lleva su propio cupo.
- Base local `coco_e2e_hard_test`, con dueño `coco_migrate`: se puede borrar.

## Borrado

- Ningún documento de trabajo.
