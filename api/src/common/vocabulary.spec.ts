import {
  BREAKDOWN_LEVEL,
  CERTAINTY,
  CLASSIFICATION_SOURCE,
  english,
  GRANULARITY,
  PERIODICITY,
  spanish,
  SUGGESTION_REASON,
} from './vocabulary';

const TABLES = {
  PERIODICITY,
  BREAKDOWN_LEVEL,
  GRANULARITY,
  CERTAINTY,
  CLASSIFICATION_SOURCE,
  SUGGESTION_REASON,
};

describe('vocabulary', () => {
  it.each(Object.entries(TABLES))('%s goes and comes back word for word', (_name, table) => {
    const words: Readonly<Record<string, string>> = table;
    for (const [es, en] of Object.entries(words)) {
      expect(english(words, es)).toBe(en);
      expect(spanish(words, en)).toBe(es);
    }
  });

  it.each(Object.entries(TABLES))(
    '%s never gives two Spanish words the same English one',
    (_n, t) => {
      const values = Object.values(t as Readonly<Record<string, string>>);
      expect(new Set(values).size).toBe(values.length);
    },
  );

  it('refuses a word it does not know', () => {
    expect(() => spanish(CERTAINTY as Readonly<Record<string, string>>, 'alta')).toThrow();
  });
});
