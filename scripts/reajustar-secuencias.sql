-- Pone cada secuencia de Postgres por encima del id más alto que ya existe.
--
-- Hace falta porque los INSERT de la migración traen el id explícito. La
-- secuencia, que nunca se usó, sigue en 1: el próximo insert de la aplicación
-- pediría el id 1 y chocaría con una fila que ya está. En MySQL el
-- AUTO_INCREMENT se reajusta solo al insertar un id mayor; en Postgres no.
--
-- Se recorre el catálogo en vez de una lista escrita a mano: las tablas puente
-- (transaction_tags) no tienen id ni secuencia, y pedirles MAX(id) es un error.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT s.relname AS secuencia, t.relname AS tabla, a.attname AS columna
    FROM pg_class s
    JOIN pg_depend d    ON d.objid = s.oid
                       AND d.classid = 'pg_class'::regclass
                       AND d.refclassid = 'pg_class'::regclass
    JOIN pg_class t     ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    JOIN pg_namespace n ON n.oid = s.relnamespace
    WHERE s.relkind = 'S' AND n.nspname = 'public'
  LOOP
    EXECUTE format(
      'SELECT setval(%L, GREATEST(COALESCE((SELECT MAX(%I) FROM public.%I), 0), 1))',
      r.secuencia, r.columna, r.tabla);
  END LOOP;
END $$;
