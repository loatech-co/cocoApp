-- Cierra el API de datos de Supabase sobre el esquema `public`.
--
-- Se aplica con:
--   npm run sql:supabase -- "$(cat scripts/cerrar-el-api-de-datos.sql)"
--
-- Es idempotente: se puede volver a ejecutar cuantas veces haga falta, y hay
-- que hacerlo después de cada migración que añada una tabla.
--
-- ── Qué problema resuelve ───────────────────────────────────────────────────
-- Supabase no es solo un Postgres alojado: además publica todo el esquema
-- `public` como API REST en https://<ref>.supabase.co/rest/v1/, y le concede a
-- los roles `anon` y `authenticated` permiso sobre cada tabla que se crea.
--
-- Lo único que separa esa puerta del contenido es la seguridad por filas. Sin
-- ella, cualquiera que tenga la clave `anon` del proyecto puede leer la base
-- entera —y vaciarla— sin pasar por la API de Coco. Y la clave `anon` NO es un
-- secreto: el modelo de Supabase la reparte a los navegadores a propósito, y
-- da por supuesto que lo que protege es la seguridad por filas.
--
-- El asesor del panel lo reportó como CRÍTICO en las catorce tablas, y tenía
-- razón: `anon` tenía SELECT, INSERT, UPDATE, DELETE y TRUNCATE en todas,
-- incluidas `users` y `audit_log`.
--
-- ── Por qué no rompe nada ───────────────────────────────────────────────────
-- Porque Coco nunca usa esa puerta. El frontend no lleva cliente de Supabase
-- ni clave —habla solo con su propia API, por `/api/v2`— y la API entra por
-- cable con Prisma, como el rol `postgres`, que es DUEÑO de las catorce tablas
-- y además tiene `rolbypassrls`. Una política que no existe no le afecta: el
-- dueño de una tabla se salta la seguridad por filas mientras no se declare
-- FORCE, y aquí no se declara.
--
-- ── Por qué no es una migración de Prisma ───────────────────────────────────
-- Porque las migraciones se aplican también contra el Postgres local, donde
-- los roles `anon` y `authenticated` no existen: el REVOKE fallaría y dejaría
-- el entorno de desarrollo sin poder migrar. Esto es configuración del
-- alojamiento, no estructura de la base, y por eso vive aquí.

-- ── 1. Seguridad por filas en todo lo que haya, sin una sola política ───────
-- Sin política no pasa nadie. Se recorre `pg_tables` en vez de escribir las
-- catorce a mano para que una tabla nueva no se quede fuera por olvido el día
-- que alguien vuelva a ejecutar esto.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ── 2. Y que no tengan ni permiso que ejercer ───────────────────────────────
-- La seguridad por filas ya bastaría. Esto es la segunda cerradura: si algún
-- día alguien añade una política pensando en otra cosa, los permisos no están
-- puestos y la puerta sigue cerrada.
--
-- `service_role` se queda como está: solo se puede usar con la clave secreta
-- del proyecto —que no sale de aquí— y se salta la seguridad por filas igual.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ── 3. Para que las tablas FUTURAS tampoco nazcan abiertas ──────────────────
-- Los permisos de arriba los concede Supabase con un ALTER DEFAULT PRIVILEGES
-- a nombre de `postgres`. Sin desactivarlo, la próxima migración crearía una
-- tabla con los mismos permisos que se acaban de quitar.
--
-- Ojo: esto NO activa la seguridad por filas en las tablas nuevas. Eso no se
-- puede dejar automático, así que la parte 1 hay que volver a ejecutarla
-- después de cada migración que añada una tabla.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ── Comprobación ────────────────────────────────────────────────────────────
-- `tablas_sin_seguridad` y `permisos_abiertos` tienen que salir en cero. Desde
-- el paso 7.11-b `politicas` sale en 14, y todas son `TO coco_app`: el rol con
-- el que entra la API (ADR 0019). Ninguna nombra a `anon` ni a `authenticated`,
-- así que para ellos sigue sin haber política, igual que antes.
SELECT
  count(*) FILTER (WHERE NOT rowsecurity) AS tablas_sin_seguridad,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS politicas,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')) AS permisos_abiertos
FROM pg_tables
WHERE schemaname = 'public';
