// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Logo, CompactLogo } from './logo';

afterEach(cleanup);

describe('Logo', () => {
  it('is an image named after the app by default', () => {
    render(<Logo />);

    expect(screen.getByRole('img', { name: 'Coco' })).toBeTruthy();
  });

  it('takes the name the caller gives it', () => {
    render(<Logo title="Coco, inicio" />);

    expect(screen.getByRole('img', { name: 'Coco, inicio' })).toBeTruthy();
  });
});

describe('LogoCompacto', () => {
  it('is an image named after the app', () => {
    render(<CompactLogo className="size-8" />);

    expect(screen.getByRole('img', { name: 'Coco' }).getAttribute('class')).toBe('size-8');
  });
});
