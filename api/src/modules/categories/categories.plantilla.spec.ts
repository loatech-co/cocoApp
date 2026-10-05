import { PLANTILLA_DE_CUENTA_NUEVA, type NodoDePlantilla } from './categories.plantilla';
import { PROFUNDIDAD_MAXIMA } from '../../common/categories/categories.tree';

/**
 * La plantilla con la que nace una cuenta.
 *
 * Es un archivo que se edita a mano, y lo que se escribe mal aquí no falla
 * escribiéndolo: falla al crear la cuenta de alguien, con el registro ya hecho
 * y el usuario ya creado en Supabase. Para entonces no hay forma limpia de
 * reintentar. Por eso estas comprobaciones corren sobre el dato, no sobre la
 * función que lo copia.
 */
function recorrer(
  nodos: readonly NodoDePlantilla[],
  visitar: (nodo: NodoDePlantilla, nivel: number) => void,
  nivel = 1,
): void {
  for (const nodo of nodos) {
    visitar(nodo, nivel);
    if (nodo.children) recorrer(nodo.children, visitar, nivel + 1);
  }
}

describe('La plantilla de una cuenta nueva', () => {
  it('no se pasa de los tres niveles que admite el árbol', () => {
    let masHondo = 0;
    recorrer(PLANTILLA_DE_CUENTA_NUEVA, (_, nivel) => {
      masHondo = Math.max(masHondo, nivel);
    });

    // Un cuarto nivel lo rechaza el servicio al crear la categoría, así que la
    // cuenta nacería a medias: con los centros puestos y la rama de más, no.
    expect(masHondo).toBeLessThanOrEqual(PROFUNDIDAD_MAXIMA);
  });

  it('llega hasta las categorías y no hasta los conceptos', () => {
    // El tercer nivel son compromisos de una persona concreta —el colegio de
    // su hija, quién le arrienda, qué día paga—, y copiarlos a cada cuenta
    // nueva sería repartir información privada. Si algún día entra, que entre
    // por una decisión y no por un descuido: esta prueba obliga a borrarla.
    let masHondo = 0;
    recorrer(PLANTILLA_DE_CUENTA_NUEVA, (_, nivel) => {
      masHondo = Math.max(masHondo, nivel);
    });

    expect(masHondo).toBe(2);
  });

  it('solo el primer nivel declara si es estático', () => {
    // `estatico` se lee del CENTRO: puesto en una categoría no hace nada, y
    // quien lo escribiera ahí creería haber protegido algo que no está
    // protegido.
    const culpables: string[] = [];
    recorrer(PLANTILLA_DE_CUENTA_NUEVA, (nodo, nivel) => {
      if (nivel > 1 && nodo.estatico !== undefined) culpables.push(nodo.name);
    });

    expect(culpables).toEqual([]);
  });

  it('ningún nombre está vacío ni repetido entre hermanos', () => {
    const repetidos: string[] = [];

    const revisar = (nodos: readonly NodoDePlantilla[]): void => {
      const vistos = new Set<string>();
      for (const nodo of nodos) {
        expect(nodo.name.trim()).not.toBe('');
        // Dos hermanos con el mismo nombre son indistinguibles en el
        // desplegable de un movimiento: no hay forma de saber cuál se eligió.
        if (vistos.has(nodo.name)) repetidos.push(nodo.name);
        vistos.add(nodo.name);
        if (nodo.children) revisar(nodo.children);
      }
    };

    revisar(PLANTILLA_DE_CUENTA_NUEVA);
    expect(repetidos).toEqual([]);
  });

  it('todo centro de costos trae al menos una categoría', () => {
    // Un centro vacío no es un punto de partida: es un sitio donde no se puede
    // clasificar nada hasta que alguien le cree algo dentro.
    for (const centro of PLANTILLA_DE_CUENTA_NUEVA) {
      expect(centro.children?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
