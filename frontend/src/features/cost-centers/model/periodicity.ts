import { CategoryPeriodicity } from '@/shared/api/generated/model';

/** How often a recurring concept comes back. The values are the API's (v2). */
export type Periodicity = NonNullable<CategoryPeriodicity>;

/** In the order the selector offers them: from the most to the least frequent. */
export const PERIODICITIES = Object.values(CategoryPeriodicity);
