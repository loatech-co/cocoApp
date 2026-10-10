/**
 * Every closed set of values that crosses the service boundary, in the words
 * the domain and the wire speak.
 *
 * Until step J-6c each set was a table from the Spanish word the database or
 * `@coco/receipt-parser` used to the English one. Neither speaks Spanish any
 * more: the Postgres enums map their values in Prisma (`@map`) and the parser
 * returns English, so what is left is one type per set.
 */

export type Periodicity = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';

export type BreakdownLevel = 'cost_center' | 'category' | 'concept';

export type Granularity = 'day' | 'month';

export type Certainty = 'high' | 'medium' | 'none';

export type ClassificationSource = 'history' | 'keywords' | 'signature' | 'dictionary';

export type SuggestionReason = 'history' | 'rule' | 'seeded_rule';
