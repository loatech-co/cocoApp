// `class-validator` decorators read metadata, and `reflect-metadata` is what
// turns them on. In the app Nest loads it at startup; there is no Nest here.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MAX_KEYWORDS, UpdateCategoryDto } from './category.dto';
import { mergeKeywords } from '../keywords';

/**
 * Keywords, at the door.
 *
 * The screen no longer lets anyone type a repeated or an empty one, but the
 * screen is not the only caller of this API. What is checked here is what
 * happens when something arrives that the screen would not have sent.
 */
async function asReceived(words: unknown): Promise<{ dto: UpdateCategoryDto; errors: string[] }> {
  const dto = plainToInstance(UpdateCategoryDto, { palabras_clave: words });
  const errors = await validate(dto);
  return { dto, errors: errors.flatMap((e) => Object.values(e.constraints ?? {})) };
}

describe('palabras_clave', () => {
  it('trims, squeezes the spaces and drops the empty ones', async () => {
    const { dto, errors } = await asReceived(['  Celsia ', '', '   ', 'Gases  de  Occidente']);

    expect(errors).toEqual([]);
    expect(dto.palabras_clave).toEqual(['Celsia', 'Gases de Occidente']);
  });

  it('drops repeats regardless of accents and case', async () => {
    // Keeping both would make the classifier score twice for a single
    // match.
    const { dto } = await asReceived(['Energía', 'ENERGIA', 'energia ']);

    expect(dto.palabras_clave).toEqual(['Energía']);
  });

  it('an empty list deletes them all, and is not the same as sending nothing', async () => {
    const empty = await asReceived([]);
    expect(empty.errors).toEqual([]);
    expect(empty.dto.palabras_clave).toEqual([]);

    const withoutField = plainToInstance(UpdateCategoryDto, {});
    expect(withoutField.palabras_clave).toBeUndefined();
  });

  it('rejects what is not a list of strings', async () => {
    expect((await asReceived('Celsia')).errors.join(' ')).toContain('array');
    expect((await asReceived([1, 2])).errors.join(' ')).toContain('string');
  });

  it('rejects an endless list and an endless word', async () => {
    const tooMany = Array.from({ length: MAX_KEYWORDS + 1 }, (_, i) => `palabra${i}`);
    expect((await asReceived(tooMany)).errors.join(' ')).toContain(String(MAX_KEYWORDS));

    expect((await asReceived(['x'.repeat(61)])).errors.join(' ')).toContain('60');
  });
});

describe('unir', () => {
  it('merges two lists without repeats, keeping the order they came in', () => {
    // It is what happens when merging two concepts: the kept one's go first
    // and the removed one's are appended. The form has to keep showing the
    // list as it was written, not a reordered one.
    expect(mergeKeywords(['Celsia', 'EPSA'], ['celsia', '805027653'])).toEqual([
      'Celsia',
      'EPSA',
      '805027653',
    ]);
  });

  it('copes with empty lists on either side', () => {
    expect(mergeKeywords([], [])).toEqual([]);
    expect(mergeKeywords(['Celsia'], [])).toEqual(['Celsia']);
  });
});
