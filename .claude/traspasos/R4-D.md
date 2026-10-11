# R4-D — privacidad y documentación de la ronda 4 (cierre J)

**Hecho**

- D8: `api/supabase/.temp/` (estado del `supabase link`, con el ref del
  proyecto de desarrollo y el id de la organización de Supabase) sale del
  índice (`git rm --cached`) y entra en el `.gitignore` raíz. Nada del repo
  (scripts, docs, CI) lo usaba; `.prettierignore` ya lo ignoraba.
- D9: decisión del director registrada en `docs/registro-autonomo.md` (§7) y en
  `coco-datos/auditorias/filter-repo-pendientes.md`: el nombre de la
  organización de GitHub NO se reescribe (identificador público); el ref y el
  id de la organización de Supabase sí, desde el gestor de secretos (no se
  escriben en ningún archivo).
- D10: `J-5.md` recortado a 28 líneas (`R3-S.md` lo recorta otro ejecutor).

**Pendiente**

- Paso de reescritura (filter-repo): el historial sigue teniendo el ref y el
  id de la organización de Supabase en `linked-project.json`.

**Verificación:** typecheck, lint, prettier, knip e instalación limpia. Sin
suites e2e: solo docs y configuración.

**Borrado:** el clon `cocoApp-work/r4-d`.
