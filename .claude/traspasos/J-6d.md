# J-6d — comentarios en inglés (hallazgo 10) y `JWT_SECRET` (18)

Dos PR: #114 (fuera de iOS + ADR 0032) y el de iOS.

Hecho:

- ~~10. Comentarios en español~~: `app.module.ts`, `bootstrap.ts` (entero),
  `api/.env.example`, `frontend/index.html` (los textos visibles siguen en
  español), mensaje de gitleaks en `lefthook.yml`; en iOS, todos los
  comentarios y `MARK:` de `Coco`, `CocoTests`, `CocoWidgets`, `project.yml` y
  `CocoTests/.swiftlint.yml`.
- ~~10. Documentación técnica en español~~: ADR 0032 (los documentos que lee el
  dueño pueden ir en español; restringe la decisión 1 de la fase 7). Una línea
  en `CLAUDE.md` apunta a él.
- ~~18. `JWT_SECRET`~~: fuera de `ci.yml`, `env.spec.ts` y `bench-api.mjs`.

Comprobación: flujo de tokens TS idéntico (salvo la línea de `JWT_SECRET`);
Swift y YAML sin comentarios ni espacios, idénticos a `origin/Dev`.

Decisiones: el español citado dentro de un comentario («Por revisar»,
«Registrar gasto», «red») se deja: nombra una cadena real. Un comentario que
nombraba un identificador ya renombrado ahora nombra el actual.

Pendiente: nada. Lo que quedó al cerrar —el `JWT_SECRET` del servidor de los
recorridos, las fuentes desfasadas en los comentarios, la `description` de
`package.json` y el contrato de soportes citado en iOS— lo cerraron J-6c
(`15be0a5`) y `ad3b1b5`; R2-C lo comprobó en `ba73eee`.
