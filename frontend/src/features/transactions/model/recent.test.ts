import { describe, expect, it } from 'vitest';

import { indexTree } from '@coco/receipt-parser';

import { recentConcepts } from './recent';

const index = indexTree([
  {
    id: 1,
    name: 'Centro',
    children: [
      {
        id: 10,
        name: 'Cat A',
        children: [
          { id: 100, name: 'Uno' },
          { id: 101, name: 'Dos' },
        ],
      },
      { id: 11, name: 'Cat B', children: [{ id: 110, name: 'Tres' }] },
    ],
  },
]);

describe('The recent concepts', () => {
  it('are the distinct ones, in order of appearance, up to the max', () => {
    const transactions = [100, 101, 100, 110, 101, 100].map((categoryId) => ({ categoryId }));
    expect(recentConcepts(transactions, index, 5)).toEqual([100, 101, 110]);
    expect(recentConcepts(transactions, index, 2)).toEqual([100, 101]);
  });

  it('ignores the unclassified and what is not a concept', () => {
    // 10 is a category: a transaction classified only that far does not count
    // as «what I usually use».
    const transactions = [
      { categoryId: null },
      { categoryId: 10 },
      { categoryId: 110 },
      { categoryId: 999 },
    ];
    expect(recentConcepts(transactions, index)).toEqual([110]);
  });

  it('with no transactions, nothing', () => {
    expect(recentConcepts([], index)).toEqual([]);
  });

  it('a response that is not a list does not break anything either', () => {
    // The recent ones are a convenience of the search; a server that returns
    // another shape cannot turn the sheet into a blank screen.
    expect(recentConcepts(undefined, index)).toEqual([]);
    expect(recentConcepts(null, index)).toEqual([]);
    expect(recentConcepts({ id: 1 } as unknown as [], index)).toEqual([]);
  });
});
