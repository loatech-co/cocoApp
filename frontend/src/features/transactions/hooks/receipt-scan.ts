import { leerSoporte } from '@/features/transactions/api/leer-soporte';
import { unreadNotice, proposalFromReading } from '@/features/transactions/model/movement-form';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';

import type { MovementSheetState } from './use-movement-form';

/**
 * Lo que dura como mínimo el paso de lectura de un soporte.
 *
 * ── Por qué se espera a propósito ───────────────────────────────────────────
 * Porque la lectura no siempre tarda lo mismo: un PDF con su texto dentro se
 * resuelve en medio segundo y una foto pasa por el OCR y tarda diez. Con la
 * espera atada al trabajo, la misma acción daba dos resultados distintos —un
 * parpadeo o una espera larga— y el parpadeo es el peor de los dos: la banda
 * no alcanza a cruzar el documento, la barra salta de 0 a nada, y lo que se
 * ve es un temblor entre dos pantallas del que no queda claro si se leyó
 * algo. Con un piso, leer un soporte siempre se ve igual.
 *
 * ── Por qué cuatro segundos ─────────────────────────────────────────────────
 * La banda cruza en 1,8s (`barre`, en `index.css`). Cuatro segundos son dos
 * pasadas completas y un respiro: se ve el barrido entero, se ve que vuelve a
 * empezar —que es lo que dice «sigue trabajando»— y da tiempo a leer de qué
 * documento se trata, que es el dato que hace falta si lo que sale no cuadra.
 *
 * Y es un MÍNIMO, no una pausa que se suma: si la lectura tarda más, no se
 * espera nada.
 */
const LECTURA_MINIMA_MS = 4000;

/** Espera lo que falte para que la lectura haya durado `LECTURA_MINIMA_MS`. */
async function waitForReadingFloor(empezo: number): Promise<void> {
  const falta = LECTURA_MINIMA_MS - (Date.now() - empezo);
  if (falta > 0) {
    await new Promise<void>((sigue) => {
      setTimeout(sigue, falta);
    });
  }
}

/**
 * Lee el recibo y rellena lo que sepa.
 *
 * Rellena, no decide: lo leído entra en los mismos campos que se escribirían a
 * mano, y la persona confirma con el mismo botón de siempre. Un recibo mal
 * leído que se guarda solo es peor que no leerlo, porque nadie vuelve a mirar
 * lo que ya quedó registrado.
 */
export function makeReceiptScan(ficha: MovementSheetState, arbol: Category[] | undefined) {
  return async function escanear(archivo: File): Promise<void> {
    ficha.setPaso('leyendo');
    ficha.setError(null);
    ficha.setPendientes([archivo]);
    const empezo = Date.now();

    try {
      const { lectura: leida, texto } = await leerSoporte(archivo, {
        periodo: ficha.date.slice(0, 7),
        // El árbol y las palabras clave ya no viajan: los tiene el servidor,
        // que es quien interpreta ahora.
        onProgreso: ficha.setProgresoDeLectura,
      });
      // Se guarda con el movimiento: es la única forma de saber después por
      // qué se clasificó como se clasificó, y de reinterpretarlo.
      ficha.setTextoLeido(texto);

      const aviso = unreadNotice(leida, texto);
      ficha.setLectura(aviso === null ? leida : null);
      ficha.setSinLeer(aviso);

      if (leida.valor !== null) ficha.setAmount(String(leida.valor));
      if (leida.fecha) ficha.setDate(leida.fecha);
      if (leida.concepto) ficha.setDescription(leida.concepto);

      // Pasa por `proponer`: si ya había algo elegido a mano, no se toca nada.
      const propuesta = proposalFromReading(leida, arbol ?? []);
      if (propuesta) {
        ficha.setHuboSugerencia(true);
        const { categoryId, origen, candidatos } = propuesta;
        if (categoryId !== undefined) ficha.proponer({ categoryId, origen });
        if (candidatos) ficha.setCandidatosDelRecibo(candidatos);
      }
    } catch (e) {
      ficha.setError(e instanceof Error ? e.message : t('transactions.reading.fileReadFailed'));
    } finally {
      // El piso de la espera, salga bien o mal. También cuando falla: un
      // mensaje de error que aparece de un fogonazo se lee como un fallo de
      // la ficha y no como el resultado de haber intentado leer el archivo.
      await waitForReadingFloor(empezo);
      ficha.setProgresoDeLectura(null);
      ficha.setPaso('formulario');
    }
  };
}
