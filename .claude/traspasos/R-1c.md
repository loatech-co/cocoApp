# Traspaso — R-1c, respaldos completos (rama `feat/full-backups`)

**Hecho**

- `scripts/respaldar.sh` (`npm run respaldar`) rehecho: `public` + `auth` + bucket `soportes`, cifrado con age, a `$COCO_DATA_DIR/respaldos/coco-<fecha>.tar.age`, y restauración de prueba del archivo CIFRADO al final.
- `scripts/respaldo/extraer.mjs`: una sola foto (transacción READ ONLY REPEATABLE READ + `pg_dump --snapshot`) para conteos, lista del bucket, filas de `soportes` y volcado. Baja el bucket con GET y verifica cada objeto contra `soportes.huella`. Escribe `db.dump`, `conteos.tsv`, `sumas.sha256`, `manifest.json`.
- `scripts/restaurar.sh`: sin argumentos, el último respaldo en `coco_restore_test` local, sha256 de los archivos, conteo por tabla de `public` y `auth` contra el manifiesto, y borra la base. `--target` pide el nombre de la base escrito; con producción exige además `--i-know-this-is-production`.
- `docs/runbook.md`, «Backups and restore»: qué lleva, dónde vive, custodia de la clave, cómo restaurar. Retención sin tocar. `knip.jsonc`: `ignoreBinaries: [pg_dump]` (con su motivo).
- **Respaldo probado (2026-10-05 20:10):** `coco-20261005-201026.tar.age`, 32 MB; 41 tablas (27 de auth), 3040 filas; 463 objetos (31 MB), 463 verificados contra la huella, 0 huérfanos; volcado 22 s, bucket 43 s, total 74 s con la prueba; restauración: conteos iguales en las 41 tablas.
- Pruebas negativas: un conteo alterado, un archivo dañado, un destino de producción sin la bandera y una base local sin `_restore_test`: las cuatro fallan con salida ≠ 0.

**Decisiones**

- Rol para `auth`: `postgres` por `DIRECT_URL` (session pooler) tiene SELECT en las 27 tablas de `auth`; no hace falta otro rol.
- Un Supabase como destino: `auth` solo datos (el esquema es de Supabase), `public` con `--clean`. Camino NO ejecutado.
- iCloud: `~/Documents` pertenece al proveedor de iCloud Drive (xattr `com.apple.file-provider-domain-id` = CloudDocs; `FXICloudDriveDesktop=1`) y un `.sql` anterior figura subido. Los dos `.tar.age` nuevos figuraban `ubiquitous` pero aún no subidos a los 10 min: confirmar.
- Las trampas EXIT del bash 3.2 de macOS se comían el código de error: ahora `limpiar()` lo conserva.

**Pendiente (dueño)**

- Clave age provisional en `~/.config/coco/respaldo.key` (600): guardar copia en el gestor de contraseñas o reemplazarla (runbook, «The encryption key»).
- Confirmar que `coco-20261005-201026.tar.age` aparece subido en iCloud.
- Sin probar: la confirmación interactiva de `--target` (no hay tty aquí) y la restauración en un Supabase nuevo.
- La auditoría propone un workflow semanal con aviso de antigüedad >7 días: no está en este paso.

**Borrado**: nada en producción ni en `respaldos/`. Copias en claro de las pruebas negativas, en el scratchpad, borradas. `coco-20261005-200517.tar.age` (primera corrida; su restauración se verificó aparte) queda como candidato de la retención.
