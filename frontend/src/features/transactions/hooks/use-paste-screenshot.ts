import { useState } from 'react';

import { t } from '@/shared/lib/i18n';

/**
 * Gives a name to a pasted screenshot.
 *
 * The clipboard does not hand over names: what arrives is a blob. Without this, all
 * the screenshots would have the same name and in a row of thumbnails there would be no way
 * to tell which is which. With the date and time, the name at least says
 * when it was pasted.
 *
 * The extension comes from the TYPE and not from a name that does not exist: depending on where
 * it is copied from, the clipboard hands over png, jpeg or webp.
 */
function nameScreenshot(content: Blob, type: string): File {
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

  return new File([content], `captura-${stamp}.${extension}`, { type });
}

/**
 * Pasting a screenshot.
 *
 * A screenshot lives in the clipboard and nowhere else: to
 * attach it you had to save it to disk first, find it and drag it.
 * Three steps for something that was just captured.
 *
 * A BUTTON triggers it and not a keyboard shortcut listening on the sheet. A
 * paste that only works with the cursor in the right place is not discovered and
 * fails without saying why; a button is seen, says what it does and can be pressed
 * with a finger on a phone.
 *
 * The clipboard does not always let itself be read —Safari asks, and without HTTPS it does not even
 * exist—, so the failure is told and the usual way out is offered:
 * drag or pick from the device.
 */
export function usePasteScreenshot(onFiles: (files: File[]) => void) {
  const [pasteProblem, setPasteProblem] = useState<string | null>(null);

  async function paste(): Promise<void> {
    setPasteProblem(null);

    try {
      const inClipboard = await navigator.clipboard.read();
      const screenshots: File[] = [];

      for (const element of inClipboard) {
        const type = element.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        screenshots.push(nameScreenshot(await element.getType(type), type));
      }

      if (screenshots.length === 0) {
        setPasteProblem(t('transactions.supports.clipboardEmpty'));
        return;
      }

      onFiles(screenshots);
    } catch {
      setPasteProblem(t('transactions.supports.clipboardDenied'));
    }
  }

  return { paste, pasteProblem };
}
