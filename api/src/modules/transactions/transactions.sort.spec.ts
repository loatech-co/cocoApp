import { parseOrder, parsePagination, MAX_PER_PAGE } from './transactions.sort';

describe('Sorting by allowlist', () => {
  it('without a parameter sorts by date, newest first', () => {
    expect(parseOrder()).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('accepts an allowed field, ascending', () => {
    expect(parseOrder('amount')).toEqual([{ amount: 'asc' }, { id: 'asc' }]);
  });

  it('the - prefix makes it descending', () => {
    expect(parseOrder('-amount')).toEqual([{ amount: 'desc' }, { id: 'desc' }]);
  });

  it('maps the public name to the real field of the model', () => {
    expect(parseOrder('created_at')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('ignores a field that is not in the allowlist', () => {
    expect(parseOrder('userId')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
    expect(parseOrder('password')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('ignores an injection attempt instead of passing it to the engine', () => {
    expect(parseOrder('date; DROP TABLE transactions')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('always breaks ties by id so pagination is stable', () => {
    // Without this tie-break, two transactions on the same date could swap
    // pages between queries: the user would see one twice and miss another.
    const order = parseOrder('date');
    expect(order[order.length - 1]).toHaveProperty('id');
  });
});

describe('Pagination', () => {
  it('defaults to page 1 with 50 per page', () => {
    expect(parsePagination()).toEqual({ page: 1, perPage: 50, skip: 0, take: 50 });
  });

  it('computes the right offset', () => {
    expect(parsePagination(3, 25)).toEqual({ page: 3, perPage: 25, skip: 50, take: 25 });
  });

  it('caps per_page so nobody asks for years of history at once', () => {
    const pagination = parsePagination(1, 100000);
    expect(pagination.perPage).toBe(MAX_PER_PAGE);
  });

  it('normalizes absurd values instead of blowing up', () => {
    expect(parsePagination(0, 0)).toEqual({ page: 1, perPage: 1, skip: 0, take: 1 });
    expect(parsePagination(-5, -10).page).toBe(1);
  });
});
