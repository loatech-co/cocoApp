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
  /** A fragment of the offending node's selector or HTML. */
  match: string;
  /** Why it is tolerated today, and what fixes it. */
  reason: string;
}

export const EXCEPCIONES: readonly Exception[] = [
  {
    rule: 'color-contrast',
    match: '.opacity-60',
    reason:
      'The summary card of a feature that is not there yet (Ingresos, «Pronto») is dimmed ' +
      'with opacity-60: 2.56:1. Dim it with the muted tokens instead of opacity.',
  },
  {
    rule: 'color-contrast',
    match: 'Pronto</span>',
    reason:
      'The «Pronto» tag is muted-foreground on the muted surface: 2.33:1. The tag needs ' +
      'a foreground declared for that surface (CLAUDE.md rule 5).',
  },
  {
    rule: 'link-in-text-block',
    match: 'href="/registro"',
    reason:
      '«Solicitar acceso» on the sign-in screen is told apart from its sentence only by ' +
      'colour (1.95:1) until hovered. It needs its underline at rest.',
  },
];

const BLOCKING = new Set(['serious', 'critical']);

function isException(rule: string, node: string): boolean {
  return EXCEPCIONES.some((e) => e.rule === rule && node.includes(e.match));
}

/** Runs axe on the current page and fails the test on a blocking violation. */
export async function expectAccessible(page: Page, where: string): Promise<void> {
  // Axe reads colours as they are NOW: a sheet still fading in reports every
  // label as low contrast. Wait until no animation is running.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();

  const blocking = violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .flatMap((v) =>
      v.nodes
        .filter((n) => !isException(v.id, `${n.target.join(' ')} ${n.html}`))
        .map(
          (n) =>
            `${v.id} (${v.impact ?? '?'}) at ${n.target.join(' ')} — ${n.html.slice(0, 160)} — ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(30, 200)}`,
        ),
    );

  expect(blocking, `axe on ${where}`).toEqual([]);
}
