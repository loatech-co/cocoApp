// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { formatCOP, formatMoney } from '@/shared/lib/format';

import { Amount, Balance } from './amount';

afterEach(cleanup);

// A neutral sample: these tests are about the sign and the color, not the figure.
const AMOUNT = '1';

describe('Amount', () => {
  it('reads an expense with a minus sign, its color and a spoken label', () => {
    const { container } = render(<Amount amount={AMOUNT} />);

    const root = container.firstElementChild!;
    expect(root.className).toContain('text-expense');
    expect(root.textContent).toBe(`Gasto: −${formatMoney(AMOUNT, 'COP')}`);
    expect(root.querySelector('.sr-only')?.textContent).toBe('Gasto: ');
  });

  it('reads an income with a plus sign', () => {
    const { container } = render(<Amount amount={AMOUNT} direction="in" />);

    expect(container.textContent).toBe(`Ingreso: +${formatMoney(AMOUNT, 'COP')}`);
    expect(container.firstElementChild!.className).toContain('text-income');
  });

  it('reads a transfer without a sign, in the muted color', () => {
    const { container } = render(<Amount amount={AMOUNT} direction="transfer" currency="USD" />);

    expect(container.textContent).toBe(`Transferencia: ${formatMoney(AMOUNT, 'USD')}`);
    expect(container.firstElementChild!.className).toContain('text-muted-foreground');
  });

  it('drops the icon, never the sign, when asked for text only', () => {
    const { container, rerender } = render(<Amount amount={AMOUNT} />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<Amount amount={AMOUNT} isTextOnly />);

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain('−');
  });
});

describe('Balance', () => {
  it('marks a negative balance with the pending color, not with red', () => {
    const { container } = render(<Balance amount="-1" />);

    const balance = container.firstElementChild!;
    expect(balance.className).toContain('text-warning');
    expect(balance.className).not.toContain('destructive');
    expect(balance.textContent).toBe(formatCOP('-1'));
  });

  it('leaves a positive or unreadable balance in the normal color', () => {
    const { container, rerender } = render(<Balance amount={AMOUNT} />);
    expect(container.firstElementChild!.className).not.toContain('text-warning');

    rerender(<Balance amount="n/a" />);
    expect(container.firstElementChild!.className).not.toContain('text-warning');
  });
});
