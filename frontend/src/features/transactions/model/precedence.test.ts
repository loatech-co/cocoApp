import { describe, expect, it } from 'vitest';

import { UNCLASSIFIED, apply, type Proposal } from './precedence';

/**
 * «A lower source never replaces a higher one nor the manual
 * choice.» It is the plan's test, word for word.
 */
const manual: Proposal = { categoryId: 1, origin: 'manual' };
const history: Proposal = { categoryId: 2, origin: 'history' };
const words: Proposal = { categoryId: 3, origin: 'keywords' };
const dictionary: Proposal = { categoryId: 4, origin: 'dictionary' };

describe('Precedence of the sources', () => {
  it('over nothing, anyone proposes', () => {
    expect(apply(UNCLASSIFIED, dictionary)).toEqual(dictionary);
    expect(apply(UNCLASSIFIED, history)).toEqual(history);
  });

  it('nothing automatic touches what was picked by hand', () => {
    expect(apply(manual, history)).toEqual(manual);
    expect(apply(manual, words)).toEqual(manual);
    expect(apply(manual, dictionary)).toEqual(manual);
  });

  it('and a choice by hand overrides whatever there is', () => {
    expect(apply(history, manual)).toEqual(manual);
    // Removing too: emptying by hand is a decision, not a gap.
    const empty = { categoryId: undefined, origin: 'manual' as const };
    expect(apply(history, empty)).toEqual(empty);
    expect(apply(empty, dictionary)).toEqual(empty);
  });

  it('the history corrects the keywords and the dictionary, not the other way around', () => {
    expect(apply(words, history)).toEqual(history);
    expect(apply(dictionary, history)).toEqual(history);
    expect(apply(history, words)).toEqual(history);
    expect(apply(history, dictionary)).toEqual(history);
  });

  it('the keywords correct the dictionary, not the other way around', () => {
    expect(apply(dictionary, words)).toEqual(words);
    expect(apply(words, dictionary)).toEqual(words);
  });

  it('a source can change its mind about itself', () => {
    // The history that suggests something else as typing goes on is still the
    // history: if it could not replace itself, the first suggestion would stay
    // stuck even though the description already said something else.
    const otherHistory: Proposal = { categoryId: 9, origin: 'history' };
    expect(apply(history, otherHistory)).toEqual(otherHistory);
  });
});
