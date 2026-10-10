# J-6d — comentarios en inglés (hallazgo 10) y `JWT_SECRET` (18)

Dos PR: #114 (fuera de iOS + ADR 0032) y el de iOS.

Hecho:

- ~~10. Comentarios en español~~: `app.module.ts`, `bootstrap.ts` (entero, no
  solo 29-31), `api/.env.example`, `frontend/index.html` (los textos visibles
  siguen en español), mensaje de gitleaks en `lefthook.yml`; en iOS, todos los
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

Pendiente:

- `e2e/support/servidor.mjs:99` sigue escribiendo `JWT_SECRET`: lo dejé para
  J-6c, que está renombrando `e2e/`.
- `frontend/index.html` dice «Google Sans / Roboto» y `bootstrap.ts`
  «Montserrat y Lora», pero se carga Geist, Instrument Serif y JetBrains Mono:
  los comentarios ya estaban desfasados (traducidos tal cual).
- `package.json` `description` sigue en español.
- `CONTRATO_DE_SOPORTES` sigue citado en los comentarios de iOS mientras
  exista con ese nombre.
