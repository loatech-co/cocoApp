import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Accessibility check of the rendered page (D16): axe on the DOM the journey
 * is looking at, failing on `serious` or `critical` violations.
 *
 * The violations that exist today are NOT hidden by switching rules off. They
 * are listed here, ONE list, each with its reason, the way `PERMITIDOS` works
 * in the design-rule tests: an exception that is not written here does not
 * exist, and fixing one means deleting its line.
 */

interface Exception {
  /** The axe rule id. */
  rule: string;
  /** A CSS selector fragment the offending node's target must contain. */
  target: string;
  /** Why it is tolerated today, and what fixes it. */
  reason: string;
}

export const EXCEPCIONES: readonly Exception[] = [];

const BLOCKING = new Set(['serious', 'critical']);

function isException(rule: string, target: string): boolean {
  return EXCEPCIONES.some((e) => e.rule === rule && target.includes(e.target));
}

/** Runs axe on the current page and fails the test on a blocking violation. */
export async function expectAccessible(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

  const blocking = violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .flatMap((v) =>
      v.nodes
        .map((n) => n.target.join(' '))
        .filter((target) => !isException(v.id, target))
        .map((target) => `${v.id} (${v.impact ?? '?'}) at ${target}: ${v.help}`),
    );

  expect(blocking, `axe on ${where}`).toEqual([]);
}
