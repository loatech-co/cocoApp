# R-1a — cuota de GitHub Actions (borrado: nada)

**Medido** (sin scope `user`, el endpoint de facturación da 404; cálculo desde los
172 runs de octubre, cada job redondeado al minuto, 0 en macOS): **1.324 min
facturables** de 2.000 (66 %). Push a `Dev`: 243 (ci 235 + release 8). `security`
en PR: 425. `ci` en PR: 567. `journeys`: 40.

**Hecho**

- `ci`: fuera el push a `Dev`; `paths-ignore` docs/.claude/md; pruebas una vez
  (`npm test --workspace packages`; front en cobertura, api en `test:cov`);
  Storybook solo si cambian `shared/ui`, `.storybook`, deps o `ci.yml`;
  commitlint pasa a `hygiene`.
- `hygiene.yml` nuevo, en TODO PR, un job (<1 min): gitleaks del rango del PR,
  commitlint, prettier de lo cambiado. Es el check que tiene un PR solo de docs.
- `security`: solo semanal y manual (historia completa + audit). `journeys`:
  `paths-ignore`. Todas las acciones fijadas por SHA (mismos SHA que v4/v5).
- Alertas de Dependabot activadas (PUT 204). Secret scanning: 422 «not available
  for this repository» (privado, plan gratuito); queda gitleaks.
- Sin `.gitleaksignore`: los 15 últimos `security` pasan con la historia entera.
- Runbook: «GitHub Actions minutes». CONTRIBUTING: 5 líneas (su regla obliga).

**Estimado por PR integrado** (antes → después): API/web 28 → 12; iOS 28 → 12
(no hay job macOS); docs 28 → 1. Mes al ritmo actual: ~1.300 → ~550.

**Pendiente**

- Tope de gasto en 0 USD: lo pone el dueño en Settings > Billing (no hay API).
- `ios/**` en `paths-ignore` de `ci`/`journeys` (iOS solo pagaría `hygiene`).
