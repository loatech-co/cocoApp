# R3-B — respaldos y restauración de la ronda 3

Rama `fix/r3-backups`, integrada con `merge.sh`. ADR 0033; runbook al día.

- B1: `extract.mjs` vuelca solo con `--no-owner`: el respaldo lleva GRANT y
  REVOKE. `restore.sh` restaura los objetos sin privilegios y aplica aparte
  las entradas `ACL` de `public` y `app_private` por
  `scripts/restore/filter-privileges.mjs` (solo grantees que existen en el
  destino o PUBLIC; el resto se lista y se omite: local no tiene
  `service_role`). `auth` sin privilegios; `DEFAULT ACL` fuera (son del rol
  dueño y de la migración RLS). Al final comprueba `coco_app` (sin DELETE en
  `users`, UPDATE en 3 columnas, `audit_log` sin UPDATE/DELETE, nada en
  `_prisma_migrations`, y los grants debidos); un volcado viejo restaura los
  datos y falla ahí (probado).
- B2: el trap de `restore.sh` borra la base local también al fallar.
- B3: `soportes` tras `transactions` en `pull-data-to-local.sh`.
- B4: `backup.sh` prueba sobre `.partial` y solo al pasar renombra; si falla,
  el trap lo borra (probado: no queda archivo).
- B6: destino Supabase NO soportado: `restore.sh` lo rechaza (se fue
  `--i-know-this-is-production`); el runbook guarda la receta manual, nunca
  ensayada. Motivo: `auth.schema_migrations`, bucket manual y cero ensayos.

Ensayo local (`coco_r3b_src_test`, claves y `.env` propios, bucket vacío):
40 entradas ACL en el volcado, restauración verificada; rol temporal con
grants borrado antes de otra restauración → 14 sentencias omitidas, exit 0.
Pendiente: el primer `npm run backup` real es la primera corrida del filtro
sobre un volcado de Supabase (ADR 0033, consecuencias). Borrado: bases
`coco_e2e_r3b_test`, `coco_r3b_src_test`, `coco_r3b_restore_test`, el rol
`r3b_fake_role`, claves y datos de ensayo, y el clon de trabajo.
