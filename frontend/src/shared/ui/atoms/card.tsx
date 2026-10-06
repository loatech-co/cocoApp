import type { ComponentProps } from 'react';

import { cn } from '@/shared/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        // 10px, which is the STANDARD radius of every container in the app: the
        // cards, the dropdowns and the modals. It can be smaller where
        // needed —a checkbox, a chip— but never larger: two neighboring
        // containers with different corners read as two different systems.
        //
        // ── NO border ─────────────────────────────────────────────────────
        // What separates the card from the background is the SURFACE STEP: the
        // card is the material and rests on the well, which goes underneath.
        // That step exists in both themes and draws no line.
        //
        // The border did that job because there used to be no step —the canvas
        // and the card were almost the same color, so a line was needed
        // to say where one ended—. The result was a grid of
        // 1px lines all over the screen, which is the visual signature of an
        // admin panel from ten years ago, and doubled up with the
        // shadow on top.
        //
        // What DOES keep the edge is what floats (rule 9): a
        // dropdown the color of the material, open over a card of the
        // same color, has no other way of saying where it starts.
        //
        // The shadow stays, and it only works in light: it is `--sombra-pegada`,
        // the theme's one for what RESTS on the page. On an almost black well
        // it casts nothing —dark on dark makes no shadow— and there
        // the step is the only thing that separates. In light it adds the half
        // millimeter of lift that the step alone does not give.
        'rounded-lg bg-card text-card-foreground',
        'shadow-[var(--sombra-pegada)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  // Without `tracking-tight`: the theme declares letter spacing as zero and Geist already
  // comes tight on its own. Squeezing it crams the 18px titles; the −0.025em
  // it carried compensated for a looser family that is no longer this one.
  return <h2 className={cn('text-lg font-semibold leading-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
