import { Plus, ScanText } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  conceptAlreadyUsing,
  cleanKeyword,
  splitKeywords,
  rejectionReason,
} from '@/features/cost-centers/model/keywords';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Chip } from '@/shared/ui/atoms/badge';
import { Field } from '@/shared/ui/atoms/field';
import { FieldAction, Input } from '@/shared/ui/atoms/input';

interface KeywordFieldsProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** To warn if another word is already set on another concept. */
  tree?: readonly Category[];
  /** The concept being edited, so it does not warn about itself. */
  conceptId?: Category['id'] | undefined;
  className?: string;
}

/**
 * The words that make a receipt be recognized on its own.
 *
 * ── What it solves ──────────────────────────────────────────────────────────
 * When a receipt is attached, the transaction's form reads it and fills in the amount,
 * the date and the concept. It does so with a signature catalog that came out of 443
 * real receipts, and that is why it knows how to recognize the creditors of whoever
 * brought them: the first receipt from a real estate agency that is not in there is not recognized,
 * and until today the only way out was to open the code.
 *
 * Here one writes what THAT receipt says —«Comfandi», the NIT— and the next one
 * comes in classified. What is typed beats the catalog: see `TYPED_TEXT_PRIORITY`.
 *
 * ── Why on the concept and not on a rules screen ────────────────────────────
 * Because the moment one knows which word recognizes a receipt is the
 * moment one has it in front of them, and the place where it is said what each thing is
 * already exists: Centros de costos. A separate «reading rules» screen
 * would be a second map to keep in agreement with the first.
 *
 * ── Why they are typed and shown as chips ───────────────────────────────────
 * Because they are a short list of short things. In a text field with commas
 * —which is the other way— one cannot see where one ends and the next begins, and removing
 * the middle one is editing a string by hand.
 */
export function KeywordsFields({
  value,
  onChange,
  tree,
  conceptId,
  className,
}: KeywordFieldsProps) {
  const { draft, setDraft, notice, setNotice, add, onKeyDown, remove } = useKeywordInput(
    value,
    onChange,
  );

  const inOtherConcept = value
    .map((keyword) => ({ keyword, other: conceptAlreadyUsing(tree ?? [], keyword, conceptId) }))
    .find((par) => par.other !== undefined);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Field
        label={t('centers.keywords.label')}
        id="concepto-palabras-clave"
        description={t('centers.keywords.help')}
      >
        <Input
          id="concepto-palabras-clave"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (notice) setNotice(null);
          }}
          onKeyDown={onKeyDown}
          // What is typed and not confirmed goes in anyway when leaving the field: otherwise,
          // typing the word and pressing «Guardar» loses it silently, and
          // nobody rereads a list to check that what they just
          // typed is there.
          onBlur={add}
          placeholder={t('centers.keywords.placeholder')}
          icon={ScanText}
          actions={[<AddKeywordButton key="añadir" draft={draft} onClick={add} />]}
        />
      </Field>

      {value.length > 0 && <KeywordChips value={value} onRemove={remove} />}

      {/*
        The two warnings, in gray and not in red.

        Neither is an error: one says that a word did not go in and why, and the
        other that it is already set on another concept —which is allowed, and sometimes
        is what one wants—. Red is for what went wrong.
      */}
      {notice && <p className="text-xs leading-relaxed text-muted-foreground">{notice}</p>}

      {!notice && inOtherConcept?.other && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('centers.keywords.sharedMiddle', { word: inOtherConcept.keyword })}
          <strong className="font-medium text-foreground">{inOtherConcept.other.name}</strong>
          {t('centers.keywords.sharedAfter')}
        </p>
      )}
    </div>
  );
}

function KeywordChips({
  value,
  onRemove,
}: {
  value: string[];
  onRemove: (keyword: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {value.map((keyword) => (
        <li key={keyword}>
          {/* The name opens nothing: it can only be removed. That is why it goes without
              `onClick`, and the chip paints it as text instead of as a
              button that would do nothing. */}
          <Chip
            onRemove={() => onRemove(keyword)}
            removeLabel={t('centers.keywords.remove', { word: keyword })}
            className="max-w-full"
          >
            {keyword}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

/** What is being typed, the warning about what did not go in, and the gestures that add and remove. */
function useKeywordInput(value: string[], onChange: (next: string[]) => void) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Adds whatever is typed. Returns what could not go in, to leave it in
   * the box: deleting what someone just typed without saying why is the
   * fastest way to make them stop typing.
   */
  function add(): void {
    const candidates = splitKeywords(draft);
    if (candidates.length === 0) {
      setDraft('');
      return;
    }

    const current = [...value];
    const rejected: string[] = [];
    let firstNotice: string | null = null;

    for (const candidate of candidates) {
      const problem = rejectionReason(candidate, current);
      if (problem) {
        firstNotice ??= problem;
        rejected.push(candidate);
        continue;
      }
      current.push(cleanKeyword(candidate));
    }

    if (current.length !== value.length) onChange(current);
    setDraft(rejected.join(', '));
    setNotice(firstNotice);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    /*
      Enter adds, and does NOT submit the form.

      Without the `preventDefault`, typing a word and pressing Enter —which is the
      gesture a list is written with— saved the concept with the
      word half-typed and closed the form.
    */
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
      return;
    }

    // Backspace with the box empty removes the last one: it is how a
    // list of chips is corrected everywhere, and it saves aiming at a 16px cross.
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
      setNotice(null);
    }
  }

  function remove(keyword: string): void {
    onChange(value.filter((kept) => kept !== keyword));
    setNotice(null);
  }

  return { draft, setDraft, notice, setNotice, add, onKeyDown, remove };
}

function AddKeywordButton({ draft, onClick }: { draft: string; onClick: () => void }) {
  return (
    // Enter already does it, but on a phone the keyboard does not always show an
    // Enter and this is the only place where one sees that the box does not hold a
    // sentence but a list.
    <FieldAction
      Icon={Plus}
      label={t('centers.keywords.add')}
      hint={t('centers.keywords.addHint')}
      onClick={onClick}
      disabled={cleanKeyword(draft) === ''}
    />
  );
}
