// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TREE } from '@/test-support/transaction-sheet';

import { ClassificationFilter } from './classification-filter';

afterEach(cleanup);

/**
 * In the phone's sheet the rows are a list read with the thumb: 52 high, the
 * label centered, and the arrow that drills in at least 42 wide.
 */
describe('The rows of the classification filter, on the phone', () => {
  it('are 52 high with the label centered, at every level', () => {
    render(<ClassificationFilter tree={TREE} checked={[]} onChange={vi.fn()} />);

    const rows = () => screen.getAllByRole('checkbox').map((box) => box.closest('label')!);
    for (const row of rows()) {
      expect(row.className).toContain('mobile:min-h-[52px]');
      expect(row.className).toContain('items-center');
    }

    const drill = screen.getAllByRole('button', { name: /^Ver lo que hay dentro de/ })[0]!;
    expect(drill.className).toContain('mobile:min-w-[42px]');

    fireEvent.click(drill);
    for (const row of rows()) expect(row.className).toContain('mobile:min-h-[52px]');
  });
});
