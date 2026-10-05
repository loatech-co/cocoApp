/** Los órdenes que la API acepta. Lo que no esté aquí, no existe. */
export const ORDENES = [
  { valor: '-date', etiqueta: 'Más recientes' },
  { valor: 'date', etiqueta: 'Más antiguos' },
  { valor: '-amount', etiqueta: 'Mayor valor' },
  { valor: 'amount', etiqueta: 'Menor valor' },
  { valor: 'merchant', etiqueta: 'Concepto A–Z' },
] as const;

export type Orden = (typeof ORDENES)[number]['valor'];
