import type es from '@/locales/es.json';

/**
 * The catalog's shape is the type of `t`'s keys: `t('nope')` does not compile,
 * and neither does an interpolation the text does not ask for.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof es };
  }
}
