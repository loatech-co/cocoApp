import { parseOrder, parsePagination, MAX_PER_PAGE } from './transactions.sort';

describe('Ordenamiento por lista blanca', () => {
  it('sin parámetro ordena por fecha descendente', () => {
    expect(parseOrder()).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('acepta un campo permitido ascendente', () => {
    expect(parseOrder('amount')).toEqual([{ amount: 'asc' }, { id: 'asc' }]);
  });

  it('el prefijo - lo vuelve descendente', () => {
    expect(parseOrder('-amount')).toEqual([{ amount: 'desc' }, { id: 'desc' }]);
  });

  it('mapea el nombre público al campo real del modelo', () => {
    expect(parseOrder('created_at')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('ignora un campo que no está en la lista blanca', () => {
    expect(parseOrder('userId')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
    expect(parseOrder('password')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('ignora un intento de inyección en vez de pasarlo al motor', () => {
    expect(parseOrder('date; DROP TABLE transactions')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('siempre desempata por id para que la paginación sea estable', () => {
    // Sin este desempate, dos movimientos de la misma fecha podrían alternar
    // de página entre consultas: el usuario vería uno repetido y perdería otro.
    const order = parseOrder('date');
    expect(order[order.length - 1]).toHaveProperty('id');
  });
});

describe('Paginación', () => {
  it('por defecto es la página 1 con 50 por página', () => {
    expect(parsePagination()).toEqual({ page: 1, perPage: 50, skip: 0, take: 50 });
  });

  it('calcula el desplazamiento correcto', () => {
    expect(parsePagination(3, 25)).toEqual({ page: 3, perPage: 25, skip: 50, take: 25 });
  });

  it('topea per_page para que nadie pida años de historial de una', () => {
    const pagination = parsePagination(1, 100000);
    expect(pagination.perPage).toBe(MAX_PER_PAGE);
  });

  it('normaliza valores absurdos en vez de reventar', () => {
    expect(parsePagination(0, 0)).toEqual({ page: 1, perPage: 1, skip: 0, take: 1 });
    expect(parsePagination(-5, -10).page).toBe(1);
  });
});
