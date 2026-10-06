import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Block } from '@/shared/ui/atoms/block';

/**
 * A part of a modal, with its name ABOVE and not on the border.
 *
 * They used to be `<fieldset>` with `<legend>`, and the browser draws a
 * `legend` sitting on the border line: the text split the box at the top and
 * ate a chunk of whatever was first inside. The name goes outside, which is
 * also what creates the hierarchy —small label, content below—.
 */
export function Section({
  title,
  isBoxed = true,
  shouldGrow = false,
  children,
}: {
  title: string;
  /** With `false`, the content goes bare: what are already cards need no other. */
  isBoxed?: boolean;
  /**
   * Takes up whatever height is left over in the modal.
   *
   * The modal has a minimum height, so with few fields there is room to
   * spare, and the footer takes it to the bottom with its `mt-auto`. A section
   * that is the target of a gesture —a box where files are dropped— is the
   * only one that size is of any use to, so that gap is its own.
   */
  shouldGrow?: boolean;
  children: ReactNode;
}) {
  return (
    // `gap-3` and not `gap-2`: with thumbnails below, two pixels less made the
    // heading look stuck to the first row, almost sitting on it —which is
    // exactly what was fixed by removing the `legend`s—.
    <section className={cn('flex flex-col gap-3', shouldGrow && 'min-h-0 flex-1')}>
      {/*
        No sustained capitals.

        A word in small caps loses the silhouette that makes it recognizable
        —"Soporte" and "SOPORTE" are not read equally fast— and inside a
        modal, where all the text is short, that shouting heading competes
        with what it titles. The size and the gray already say it is a
        heading.
      */}
      <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
      {isBoxed ? <Block className="flex flex-col gap-3">{children}</Block> : children}
    </section>
  );
}
