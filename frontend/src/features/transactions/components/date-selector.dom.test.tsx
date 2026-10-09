// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from '@/shared/ui/atoms/input';

import { DateSelector } from './date-selector';

/**
 * The date is typed, and what is typed is understood.
 *
 * Opening the calendar to set March 3 of last year is four arrow
 * clicks before you start looking. Whoever has the receipt in front of them already knows the
 * date, so the short path is typing it —and having the app understand it however
 * each person writes it, which is different from forcing a format.
 */
afterEach(cleanup);

const dateField = () => screen.getByPlaceholderText<HTMLInputElement>(/septiembre/i);

function type(text: string, onSelect = vi.fn()) {
  render(<DateSelector value="2026-04-04" onSelect={onSelect} />);
  const field = dateField();
  fireEvent.change(field, { target: { value: text } });
  fireEvent.blur(field);
  return onSelect;
}

describe('The date field that is typed', () => {
  it.each([
    ['19 de septiembre 2026', '2026-09-19'],
    ['19 de septiembre de 2026', '2026-09-19'],
    ['sep 10 2026', '2026-09-10'],
    ['10 sep 2026', '2026-09-10'],
    ['10/09/2026', '2026-09-10'],
    ['10-09-2026', '2026-09-10'],
    ['2026-09-10', '2026-09-10'],
  ])('understands «%s»', (typed, iso) => {
    expect(type(typed)).toHaveBeenCalledWith(iso);
  });

  it('what is not understood goes back to the last valid date', () => {
    // Keeping a text that is not a date would leave the field saying one
    // thing and the form saving another.
    const onSelect = type('el martes pasado');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('emptying it does not delete the date by accident either', () => {
    const onSelect = type('   ');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('normalizes even if the SAME date is typed another way', () => {
    // Here `onSelect` does not fire —the value does not change—, so if the field
    // did not rewrite itself, it would keep the typed «04/04/2026».
    const onSelect = type('04/04/2026');

    expect(onSelect).not.toHaveBeenCalled();
    expect(dateField().value).toBe('4 de abril de 2026');
  });

  it('Enter confirms without submitting the form', () => {
    const onSelect = vi.fn();
    const onSubmit = vi.fn((e: React.SubmitEvent) => e.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <DateSelector value="2026-04-04" onSelect={onSelect} />
      </form>,
    );

    const field = dateField();
    fireEvent.change(field, { target: { value: '10/09/2026' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalledWith('2026-09-10');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

/*
  The hooks the floating label of `Field` needs, in the date
  selector. They lived in `shared/ui/atoms/field.test.tsx`; they are here because the
  selector belongs to the transactions feature and `shared` does not import from a
  feature.
*/
describe('The date selector inside a field', () => {
  it('the date selector says the same, and its icon goes at the end with no arrow', () => {
    const { container } = render(<DateSelector value="2026-04-04" onSelect={() => {}} />);

    /*
      The date selector IS TYPED, so the label floats the way
      the label of any text field floats: `:placeholder-shown`. For that
      rule to hook, two things are needed —a declared placeholder and a
      value inside—, and that is why both are checked and not the class that paints.
    */
    const field = container.querySelector('input:not([type="hidden"])');
    expect(field?.getAttribute('placeholder')).toBeTruthy();
    expect((field as HTMLInputElement | null)?.value).toBe('4 de abril de 2026');

    // And the value travels in ISO for the form, not as it is typed.
    expect(container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe(
      '2026-04-04',
    );
    // The calendar is the signal that this opens a calendar, which is the
    // role of the arrow in a dropdown: with both, there were two icons
    // saying the same thing, one on each side of the value.
    expect(container.querySelector('.lucide-calendar-days')).not.toBeNull();
    expect(container.querySelector('.lucide-chevron-down')).toBeNull();
  });

  it('the value of a date selector starts where its label starts', () => {
    /*
      This broke and looked like a step: the label 12px from the edge and
      the value at 20.

      The cause is order, not value: `cva` emits base, variant and size in
      that order, so the size's `px-5` beats any `px-3` written in
      the variant. The call has to set it, which is the last thing `cn` sees.

      It is compared against the `Input`, which is the neighbor it has to
      line up with, and not against a literal `'px-3'`: if some day the padding of
      the fields changes, this test keeps measuring what matters.
    */
    const textField = render(<Input />);
    const fieldPadding = (textField.container.querySelector('input')?.className ?? '')
      .split(/\s+/)
      .filter((c) => c.startsWith('px-'));
    expect(fieldPadding).toHaveLength(1);

    cleanup();

    // The field's BOX, which is the one with the padding. The button inside is
    // the calendar's, and that one indents itself.
    const date = render(<DateSelector value="2026-04-04" onSelect={() => {}} />);
    const box = date.container.querySelector('input:not([type="hidden"])')?.parentElement;
    const datePadding = (box?.className ?? '').split(/\s+/).filter((c) => c.startsWith('px-'));

    expect(datePadding, 'the date selector indents like a text field').toEqual(fieldPadding);
  });
});
