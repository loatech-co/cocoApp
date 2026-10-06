import { NEW_ACCOUNT_TEMPLATE, type TemplateNode } from './categories.template';
import { MAX_DEPTH } from '../../common/categories/categories.tree';

/**
 * La plantilla con la que nace una cuenta.
 *
 * Es un archivo que se edita a mano, y lo que se escribe mal aquí no falla
 * escribiéndolo: falla al crear la cuenta de alguien, con el registro ya hecho
 * y el usuario ya creado en Supabase. Para entonces no hay forma limpia de
 * reintentar. Por eso estas comprobaciones corren sobre el dato, no sobre la
 * función que lo copia.
 */
function walk(
  nodes: readonly TemplateNode[],
  visit: (node: TemplateNode, level: number) => void,
  level = 1,
): void {
  for (const node of nodes) {
    visit(node, level);
    if (node.children) walk(node.children, visit, level + 1);
  }
}

describe('La plantilla de una cuenta nueva', () => {
  it('no se pasa de los tres niveles que admite el árbol', () => {
    let deepest = 0;
    walk(NEW_ACCOUNT_TEMPLATE, (_, level) => {
      deepest = Math.max(deepest, level);
    });

    // Un cuarto nivel lo rechaza el servicio al crear la categoría, así que la
    // cuenta nacería a medias: con los centros puestos y la rama de más, no.
    expect(deepest).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('llega hasta las categorías y no hasta los conceptos', () => {
    // El tercer nivel son compromisos de una persona concreta —el colegio de
    // su hija, quién le arrienda, qué día paga—, y copiarlos a cada cuenta
    // nueva sería repartir información privada. Si algún día entra, que entre
    // por una decisión y no por un descuido: esta prueba obliga a borrarla.
    let deepest = 0;
    walk(NEW_ACCOUNT_TEMPLATE, (_, level) => {
      deepest = Math.max(deepest, level);
    });

    expect(deepest).toBe(2);
  });

  it('solo el primer nivel declara si es estático', () => {
    // `estatico` se lee del CENTRO: puesto en una categoría no hace nada, y
    // quien lo escribiera ahí creería haber protegido algo que no está
    // protegido.
    const offenders: string[] = [];
    walk(NEW_ACCOUNT_TEMPLATE, (node, level) => {
      if (level > 1 && node.isStatic !== undefined) offenders.push(node.name);
    });

    expect(offenders).toEqual([]);
  });

  it('ningún nombre está vacío ni repetido entre hermanos', () => {
    const duplicates: string[] = [];

    const check = (nodes: readonly TemplateNode[]): void => {
      const seen = new Set<string>();
      for (const node of nodes) {
        expect(node.name.trim()).not.toBe('');
        // Dos hermanos con el mismo nombre son indistinguibles en el
        // desplegable de un movimiento: no hay forma de saber cuál se eligió.
        if (seen.has(node.name)) duplicates.push(node.name);
        seen.add(node.name);
        if (node.children) check(node.children);
      }
    };

    check(NEW_ACCOUNT_TEMPLATE);
    expect(duplicates).toEqual([]);
  });

  it('todo centro de costos trae al menos una categoría', () => {
    // Un centro vacío no es un punto de partida: es un sitio donde no se puede
    // clasificar nada hasta que alguien le cree algo dentro.
    for (const costCenter of NEW_ACCOUNT_TEMPLATE) {
      expect(costCenter.children?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
