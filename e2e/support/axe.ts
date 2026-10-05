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
  /** A fragment of the offending node's selector or HTML… */
  match?: string;
  /** …or a selector of an element the node is inside of (or is). */
  inside?: string;
  /** Why it is tolerated today, and what fixes it. */
  reason: string;
}

const EXCEPCIONES: readonly Exception[] = [
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
  ...['aria-required-children', 'aria-required-parent', 'listitem'].map((rule) => ({
    rule,
    inside: '[role="listbox"][aria-label="Concepto"]',
    reason:
      'The concept finder: its popup is a listbox that holds a search box, buttons and ' +
      'another listbox, and every option sits inside an <li>. It needs the combobox ' +
      'pattern: the popup as a group, options as direct children of their list.',
  })),
  {
    rule: 'target-size',
    match: 'Elegir por centro y categoría',
    reason:
      'The text link under the concept field is 16px tall, under the 24px minimum, and ' +
      'sits next to the concept field. It needs a taller hit area.',
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

interface Offender {
  rule: string;
  target: string;
  html: string;
  inside: string[];
}

function isException(o: Offender): boolean {
  return EXCEPCIONES.some(
    (e) =>
      e.rule === o.rule &&
      (e.match === undefined || `${o.target} ${o.html}`.includes(e.match)) &&
      (e.inside === undefined || o.inside.includes(e.inside)),
  );
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

  const offenders: (Offender & { line: string })[] = violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .flatMap((v) =>
      v.nodes.map((n) => ({
        rule: v.id,
        target: n.target.join(' '),
        html: n.html,
        inside: [],
        line: `${v.id} (${v.impact ?? '?'}) at ${n.target.join(' ')} — ${n.html.slice(0, 160)}`,
      })),
    );

  // Which of the containers named by an exception each node sits in.
  const containers = [...new Set(EXCEPCIONES.flatMap((e) => (e.inside ? [e.inside] : [])))];
  for (const o of offenders) {
    o.inside = await page.evaluate(
      ([target, selectors]) => {
        const node = document.querySelector(target);
        return node ? selectors.filter((s) => node.closest(s)) : [];
      },
      [o.target, containers] as const,
    );
  }

  const blocking = offenders.filter((o) => !isException(o)).map((o) => o.line);

  expect(blocking, `axe on ${where}`).toEqual([]);
}
