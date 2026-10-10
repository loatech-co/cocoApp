# R2-B — idioma y privacidad en el código

**Hecho**

- #21: el nombre y el apellido del dueño salieron de código, pruebas, comentarios y docs
  (nombres ficticios: «Ana», «Mariana Prueba»). Ampliado: el dominio de producción queda solo
  en configuración (`ios/project.yml`, su `project.pbxproj` generado y `PROBLEM_TYPE_BASE`).
  Las pruebas importan la constante; los fixtures de web e iOS usan hosts `.invalid`; el
  último recurso de iOS es `http://localhost:3000`; el runbook lee el dominio de `project.yml`.
- Valores internos en inglés (fallos de soporte, estados de cámara, pasos de la ficha, alta).
- Mensajes para el desarrollador, aserciones, `XCTSkip` y logs de iOS en inglés; comentarios
  de configuración en inglés; «7.10» → «contraction (plan 8.7)».
- Anclas `#settings`/`#security`; las viejas se traducen (`currentAccountHash`), con prueba
  unitaria y Playwright.
- N10: `validation-messages.ts` traduce los mensajes por defecto de class-validator; prueba
  unitaria (cubre cada decorador que usa la API) y e2e en `POST /auth/register`.

**Pendiente**

- `.claude/settings.json` lleva una ruta absoluta con el usuario local: es configuración de
  permisos, la cambia el dueño.
- El historial público sigue teniendo el nombre y el dominio: reescritura aparte.
- `ios/README.md` y otros docs en español quedan para el ejecutor de documentación.

**Decisiones**: un mensaje se traduce solo si ES el valor por defecto en inglés; el propio de un decorador
pasa intacto.

**Borrado**: la base `coco_e2e_r2b_test` y la de Playwright; `api/.env.test` local.
