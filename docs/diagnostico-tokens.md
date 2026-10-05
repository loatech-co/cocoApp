# Diagnóstico de consumo de tokens (sesión del 4–5 de octubre de 2026)

Medido sobre las transcripciones de la sesión (`~/.claude/projects/…/3c811414….jsonl`,
16 MB, y los 22 subagentes), con el campo `usage` de cada turno del modelo.

## Cifras

| Qué                                                                              | Valor                                 |
| -------------------------------------------------------------------------------- | ------------------------------------- |
| Turnos del hilo principal                                                        | **1 784**                             |
| Tokens de salida (lo que escribió el modelo)                                     | 4,6 M                                 |
| Tokens de contexto releídos desde caché por turno, sumados                       | **811 M** (≈ 455 k por turno)         |
| Tokens de contexto escritos en caché                                             | 21 M                                  |
| Subagentes (22: 6 del panel de diseño, 7 implementadores, 9 de fases anteriores) | 84 M releídos + 12 M escritos         |
| Resultados de herramientas en el hilo principal                                  | 1,2 MB en 905 `Bash`; el mayor, 27 KB |

**Lo que de verdad cuesta no es lo que se escribe: es el contexto que cada turno
vuelve a leer.** 811 M de los ≈ 840 M del hilo principal son relectura de un
contexto largo, turno tras turno. La salida (4,6 M) y los resultados de
herramientas (1,2 MB en total) son pequeños a su lado.

## Operaciones que más consumen, causa y corrección

| Operación                                                                                                                                                                      | Consumo estimado                                                                                | Causa                                                                                                                                                   | Corrección aplicada                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Número de turnos con un contexto largo** (1 784 turnos × ≈ 455 k)                                                                                                            | ≈ 811 M (97 % del total)                                                                        | Cada llamada a una herramienta es un turno que relee todo el contexto; con un contexto de cientos de miles de tokens, 900 `Bash` cuestan 900 relecturas | Agrupar llamadas independientes en un mismo turno; esperar con UNA llamada larga (pausa de varios minutos) en vez de sondear; delegar lo largo a un agente con encargo acotado, que arranca con contexto pequeño |
| **Panel de diseño de la fase 5** (3 propuestas + 2 jueces + síntesis)                                                                                                          | ≈ 30 M de contexto, 6 agentes, 1,0 MB de transcripción cada propuesta                           | Seis agentes leyendo el mismo repo para una sola decisión                                                                                               | Anotado como el tipo de operación que no se repite: **un agente por tarea**. Donde haga falta una decisión de diseño, una sola propuesta revisada por un solo juez                                               |
| **Lecturas de archivos grandes enteros** (`app-shell.tsx` 429 líneas, `auth.controller.ts`, `supabase-auth.service.ts`, `plan-completo.md` 878 líneas, `registro-autonomo.md`) | 20–27 KB por lectura; releídos tras cada compactación                                           | Leer el archivo completo «por si acaso» y volverlo a leer al perder el contexto                                                                         | `grep` antes de leer y `sed -n` por rangos; lo que se necesita de un archivo grande se anota en una línea en vez de releerlo                                                                                     |
| **Agentes implementadores de iOS** (4–7 M de contexto cada uno, 43–58 turnos)                                                                                                  | ≈ 25 M                                                                                          | Cada uno compila y prueba en el simulador varias veces (`xcodebuild` tarda minutos y escupe cientos de líneas)                                          | Salida filtrada con `grep -E "error:                                                                                                                                                                             | Executed | TEST"`; una sola corrida completa al final; `-only-testing` mientras se trabaja |
| **Salidas de pruebas y builds**                                                                                                                                                | 10–27 KB cada una cuando no se filtran                                                          | Reporteros verbosos                                                                                                                                     | `--silent`, `tail`, `sort -u`; `git diff --stat` antes de cualquier diff                                                                                                                                         |
| **Instrucciones y skills al inicio**                                                                                                                                           | ≈ 25 k por sesión (CLAUDE.md global + del proyecto + reglas + listado de skills y herramientas) | Fijo por sesión; se relee en cada turno como parte del contexto                                                                                         | No se toca (es lo que mantiene las reglas); lo que sí se evita es sumarle lecturas redundantes encima                                                                                                            |
| **Engram**                                                                                                                                                                     | 1 llamada de contexto (8 KB) y 1 resumen por compactación                                       | Bajo                                                                                                                                                    | Se escribe condensado: decisiones y estado                                                                                                                                                                       |

## Reglas que quedan en vigor (del plan, confirmadas con las cifras)

1. Un turno, varias llamadas: todo lo que no dependa de otra cosa va en la misma
   respuesta.
2. Esperar es UNA llamada larga, no diez sondas.
3. `grep` → rango → nota; un archivo grande se lee una vez por tarea.
4. Pruebas dirigidas al trabajar; la suite completa una vez antes de cada PR.
5. Un agente por tarea con encargo y entregable cortos; nunca un panel de
   agentes releyendo el repo para una misma decisión.
6. Salidas filtradas siempre (`tail`, `grep`, `--silent`, `--stat`).

Lo que no se recorta: pruebas, typecheck y lint antes de integrar, verificación
de despliegues, registro e informes.
