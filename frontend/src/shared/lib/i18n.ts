import type { TFunction } from 'i18next';

/**
 * The user-facing text of the web (step 7.3, D5).
 *
 * Every string a person reads lives in `src/locales/es.json`, under an English
 * key (`transactions.form.amount`). `t` is typed from that JSON
 * (`i18next.d.ts`): a key that does not exist does not compile.
 *
 * ── Why the catalog loads with a top-level `await` ──────────────────────────
 * i18next, react-i18next and the catalog weigh more than what was left of the
 * 200 kB initial budget (`.size-limit.cjs`). They go in their own chunk, and
 * this module waits for it: ES modules that import this one are not evaluated
 * until the `await` resolves, so no screen (and no module constant built with
 * `t`) ever runs against an empty catalog. ADR 0024 has the numbers.
 *
 * ── Why a module `t` and not `useTranslation()` everywhere ──────────────────
 * A good share of the texts live outside components: option lists, labels
 * built in `model/`, error messages in the API client. One `t` serves all of
 * them; react-i18next is registered (`initReactI18next`) so a component that
 * needs `Trans` —text with an element inside— can have it.
 *
 * Texts that come from the API (`detail` of a problem+json) are shown as they
 * arrive: they are already written for the person and are never looked up here.
 */
const [{ default: i18next }, { initReactI18next }, { default: es }] = await Promise.all([
  import('i18next'),
  import('react-i18next'),
  import('@/locales/es.json'),
]);

await i18next.use(initReactI18next).init({
  lng: 'es',
  resources: { es: { translation: es } },
  // React escapes what it renders; escaping here too would show `&amp;`.
  interpolation: { escapeValue: false },
});

export const t: TFunction = i18next.t.bind(i18next);
