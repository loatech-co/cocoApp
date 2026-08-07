import { sonIguales, sumar, toMoney, type Money } from './money';

export interface ResultadoDeCuadre {
  cuadra: boolean;
  suma: Money;
  /** `suma − amount`. Positivo: los splits se pasan. Negativo: faltan. */
  diferencia: Money;
}

/**
 * Verifica la invariante de los splits: su suma debe igualar EXACTAMENTE el
 * monto de la transacción.
 *
 * Se compara con `Prisma.Decimal.equals`, no con `===` (compararía referencias)
 * ni con `Math.abs(a - b) < epsilon` (un epsilon en dinero es una licencia para
 * perder centavos). En una app financiera "casi igual" no existe.
 *
 * La `diferencia` se devuelve para que la UI pueda ofrecer "ajustar al
 * restante" en vez de solo decir que está mal.
 */
export function verificarCuadreDeSplits(
  amountCabecera: Money,
  montosDeSplits: readonly Money[],
): ResultadoDeCuadre {
  const suma = toMoney(sumar(montosDeSplits));
  const cabecera = toMoney(amountCabecera);

  return {
    cuadra: sonIguales(suma, cabecera),
    suma,
    diferencia: toMoney(suma.minus(cabecera)),
  };
}
