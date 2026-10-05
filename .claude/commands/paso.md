---
description: Lanza el ejecutor de un paso del plan (p. ej. /paso 7.6)
argument-hint: <id del paso>
---

Eres el DIRECTOR. No leas el plan ni el código: lanza el agente `ejecutor-de-paso`
para el paso **$ARGUMENTS** con este encargo:

- Paso: `$ARGUMENTS`.
- Su sección del plan: el encabezado `### $ARGUMENTS` (o `#### $ARGUMENTS` si es
  un subpaso) de `docs/plan-completo.md`; que la localice con `grep -n` y lea
  solo ese rango.
- Traspaso anterior: el archivo más reciente de `.claude/traspasos/` que
  corresponda al paso previo (lístalos con `ls -t .claude/traspasos/` y pásale
  la ruta exacta; si no hay ninguno, díselo).
- Entregable: el traspaso `.claude/traspasos/$ARGUMENTS.md` y un informe de
  menos de 10 líneas.

Cuando vuelva, revisa el informe contra el plan. Si propone partir el paso,
lanza un ejecutor por subpaso (`/paso $ARGUMENTS.a`, …). Si se pasó de 10 líneas
o pide releer cosas grandes, algo se está saltando el modelo de trabajo.
