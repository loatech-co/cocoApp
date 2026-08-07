import { parseOrden, parsePaginacion, PER_PAGE_MAXIMO } from './transactions.sort';

describe('Ordenamiento por lista blanca', () => {
  it('sin parámetro ordena por fecha descendente', () => {
    expect(parseOrden()).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('acepta un campo permitido ascendente', () => {
    expect(parseOrden('amount')).toEqual([{ amount: 'asc' }, { id: 'asc' }]);
  });

  it('el prefijo - lo vuelve descendente', () => {
    expect(parseOrden('-amount')).toEqual([{ amount: 'desc' }, { id: 'desc' }]);
  });

  it('mapea el nombre público al campo real del modelo', () => {
    expect(parseOrden('created_at')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
  });

  it('ignora un campo que no está en la lista blanca', () => {
    expect(parseOrden('userId')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
    expect(parseOrden('password')).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('ignora un intento de inyección en vez de pasarlo al motor', () => {
    expect(parseOrden('date; DROP TABLE transactions')).toEqual([
      { date: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('siempre desempata por id para que la paginación sea estable', () => {
    // Sin este desempate, dos movimientos de la misma fecha podrían alternar
    // de página entre consultas: el usuario vería uno repetido y perdería otro.
    const orden = parseOrden('date');
    expect(orden[orden.length - 1]).toHaveProperty('id');
  });
});

describe('Paginación', () => {
  it('por defecto es la página 1 con 50 por página', () => {
    expect(parsePaginacion()).toEqual({ page: 1, perPage: 50, skip: 0, take: 50 });
  });

  it('calcula el desplazamiento correcto', () => {
    expect(parsePaginacion(3, 25)).toEqual({ page: 3, perPage: 25, skip: 50, take: 25 });
  });

  it('topea per_page para que nadie pida años de historial de una', () => {
    const paginacion = parsePaginacion(1, 100000);
    expect(paginacion.perPage).toBe(PER_PAGE_MAXIMO);
  });

  it('normaliza valores absurdos en vez de reventar', () => {
    expect(parsePaginacion(0, 0)).toEqual({ page: 1, perPage: 1, skip: 0, take: 1 });
    expect(parsePaginacion(-5, -10).page).toBe(1);
  });
});
