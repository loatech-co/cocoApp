import { Sparkles, TriangleAlert } from 'lucide-react';

import { t } from '@/shared/lib/i18n';

/**
 * What the receipt did NOT say.
 *
 * Same place and same shape as `WhatWasRead` —it is the other answer to the same
 * question— and the tone of what is pending, not the error one: nothing broke, there is
 * work to do by hand.
 */
export function CouldNotRead({ text }: { text: string }) {
  return (
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

/**
 * The notice that there is data read by the machine.
 *
 * ── Why the accent and not amber ────────────────────────────────────────────
 * Because nothing bad has happened. Amber in this app is for what is
 * PENDING —a payment coming due, an unclassified transaction— and an intense
 * orange on top of a form that just filled itself in reads as an
 * error, when what happened was a hit. The accent calls without alarming.
 *
 * ── The only still thing that uses `accent` ─────────────────────────────────
 * In the rest of the app `accent` is the surface of what RESPONDS: the
 * option under the cursor, the pointed row, the toggled-on button. This notice does not
 * respond to anything and it still uses it, on purpose: it is the closest thing this
 * theme has to a highlight that calls without alarming, and putting it in `info` —which is what
 * its tone would call for— would leave it like any other note, when
 * this is the only place where the app asks for a review of what it
 * just wrote itself.
 *
 * With the token, the theme guarantees the contrast: very light green on almost
 * white, very dark green with mint text on almost black.
 *
 * ── Why a single sentence ───────────────────────────────────────────────────
 * Because the detail of why it was classified that way does not change what has to be
 * done, which is looking at the fields. Telling it all took three lines and
 * pushed down exactly what it was asking to review.
 */
export function WhatWasRead() {
  return (
    /*
      ── `min-h-16`: half again as tall ────────────────────────────────────────
      It measured its line plus its padding, 44px, and with that it was a strip the
      eye skips to go to the fields. It is the first thing to read in
      this column —it says that what is below was written by a machine and has to be
      checked—, so it has to weigh like something and not like an edge.

      And it is a MINIMUM and not more padding because in a half-width
      column the sentence falls on two lines, and two lines with the top
      and bottom padding measure exactly these 64: the notice looks the same whether the
      sentence fits on one or two, instead of jumping when the width changes.
    */
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground">
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      {t('transactions.reading.verifyNotice')}
    </p>
  );
}
