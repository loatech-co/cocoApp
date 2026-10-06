# Traspaso — R-ctx, el contexto de los agentes (7.14 adelantado)

Rama `docs/agent-context` desde `Dev` `b6227f4`. Solo documentación, sin código. PR abierto, **sin integrar** (lo integra el director).

**Hecho**

- `CLAUDE.md` en 64 líneas: qué es, comandos, convenciones con enlace a CONTRIBUTING, reglas que nunca se rompen, modo de trabajo condensado, la **tabla única de paradas y borrados** y dónde está todo.
- Las 18 reglas de la interfaz, íntegras con sus porqués, en `.claude/rules/web.md`, cada una con su «**Regla:**» de una línea, rutas corregidas a `shared/ui/…` y `features/…`, índice de 18 (antes decía 17 y estaba desfasado desde la 12). Se quitó la tabla «ruta vieja → nueva», ya sin objeto.
- Nuevas `.claude/rules/api.md`, `database.md` e `ios.md`, con `paths` en el frontmatter (Claude Code 2.1.92 lo admite; `web.md` ya lo usaba).
- Paradas: el agente, el runbook (6 sitios) y el plan (modo de ejecución, fase 6, decisiones de 7, 7.1, 7.6, 7.10) remiten a `CLAUDE.md`.
- Plan: lista del senior rehecha en tabla con estado y evidencia (contrastada contra `Dev`), y bloque I en «Añadidos del dueño».

**Decisiones**

- Además de las cuatro reglas que pidió el director, la tabla de paradas lleva una quinta fila: los bloqueos (faltan credenciales, `migrate status` con pendientes inesperadas, producción rota sin vuelta atrás; restaurar en producción lo hace el dueño). No son paradas de fase, pero ahí seguir a ciegas no tiene arreglo.
- El reparto del bloque I (I.1 a I.4) es mío: el director lo puede corregir.

**Pendiente (fuera de mi alcance)**

- Siguen diciendo «siete días» para la v1: `CONTRIBUTING.md` § API versions y el ADR 0008. Hace falta un ADR que lo sustituya o editar CONTRIBUTING.
- `README.md:115` y los comentarios «CLAUDE.md rule 15» (`e2e/recorridos/*.spec.ts`, `cabecera-de-pagina.test.ts`) apuntan ahora a `.claude/rules/web.md`.
- ADR pendientes que señala la lista del senior: release-please sin token, cobertura web 60/57, tablas `import_*`, iOS sin CI automático.
- `respaldar.sh` con `auth` y el bucket llega con #48; hasta entonces la condición de borrado no se puede cumplir.

**Borrado:** nada.
