# Integración de la cola de PR en Dev (5-6 oct 2026)

Todo por `scripts/merge.sh` (fast-forward), con verificación local completa y despliegue comprobado (`/api/v2/health` y `/ready` 200, `stderr` vacío, web 200). Ninguna migración. **Trenes por decisión del dueño** (la regla del plan era un paso por despliegue): iOS #21→#28→#29→#39 entró por su punta con un solo CI; el de documentación quedó en #42, porque #19 ya había entrado.

| PR                 | Dev     | Incidencias y arreglos propios                                                                                                                    |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| #16                | f67ab20 | —                                                                                                                                                 |
| #20                | 379708c | —                                                                                                                                                 |
| #23                | 59c7760 | —                                                                                                                                                 |
| #30                | e33d6d0 | —                                                                                                                                                 |
| #24                | 8610ce6 | Versión remota reescrita                                                                                                                          |
| #32                | d0ed41b | La cobertura de `shared/ui` caía bajo su umbral por las piezas partidas en #20/#23/#30: pruebas de `pdf-canvas`, `pdf-page`, `section` y `bloque` |
| #18                | 2ecefa6 | —                                                                                                                                                 |
| #26                | 4554d6b | `ci.yml`: el e2e pasa a `test:cov`                                                                                                                |
| #33                | 0c08a8b | —                                                                                                                                                 |
| #36                | 167d3f3 | —                                                                                                                                                 |
| #38                | c474069 | —                                                                                                                                                 |
| #19                | ad6f526 | README de #19; «Comprobar un despliegue» (v2) y «Usos de la v1» de #38 al runbook                                                                 |
| #22                | 38749e4 | `/auth/me` con `features` en los contratos v1 (`MeResponse`) y v2 (`Me`); el controlador v2 lee los flags; `flags.tsx` a `shared/api`             |
| #25                | 9fe91c7 | —                                                                                                                                                 |
| #27                | f53895d | `router.tsx`: carga diferida con las rutas nuevas                                                                                                 |
| #34                | c8332eb | `knip`: `pg` deja de ignorarse                                                                                                                    |
| #37                | b995cb0 | `playwright` falló en móvil: el panel flotante de `Menu` no tenía tope de alto y la lista caía fuera de la ventana. Arreglo con prueba            |
| #40                | 837c0bb | Tabla de umbrales a 60/57                                                                                                                         |
| #41                | 89ed351 | `EXCEPCIONES` de axe vacía                                                                                                                        |
| #43                | bcf899e | Flags por `authMe()` y cliente regenerado; pruebas de #40 a la v2; `entrar` por la v2; ADR 0013 y runbook                                         |
| #42                | 4843bc4 | «Decisiones del director (5 oct 2026)»                                                                                                            |
| #39 (+#21 #28 #29) | b0a96d6 | ADR de iOS renumerado a 0021; `ContractsTests` lee `native-contract.ts`                                                                           |

**Pendiente.** `ContractsTests.testBrandMatchesCocoTypes` sigue saltándose en el simulador (no puede leer archivos del repo): hace falta otra vía, por ejemplo copiar el archivo como recurso de la prueba. Un recorrido falló una vez en local (403 en el primer login de admin) y pasó al repetir: posible prueba inestable. Ramas de otros worktrees: se rebasaron como `int/<x>` y se movió su ref con `update-ref`, así que esos worktrees terminados se ven «modificados».
