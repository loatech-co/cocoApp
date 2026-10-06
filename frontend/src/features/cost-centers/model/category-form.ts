import { t } from '@/shared/lib/i18n';
/**
 * Lo que la ficha de un centro o una categoría manda al servidor.
 *
 * Cada nivel guarda lo suyo: lo estático es del CENTRO —una categoría hereda lo
 * que diga el suyo— y el icono es de la categoría, porque en la fila de un
 * centro no se ve.
 */

export interface CategoryFormValues {
  esCentro: boolean;
  nombre: string;
  estatico: boolean;
  icono: string | null;
}

/** Los cambios al renombrar. */
export function categoryChanges({ esCentro, nombre, estatico, icono }: CategoryFormValues) {
  return esCentro
    ? { name: nombre.trim(), isStatic: estatico }
    : { name: nombre.trim(), icon: icono };
}

/** Lo que se crea. Una categoría cuelga de su padre, si lo hay. */
export function newCategory(
  { esCentro, nombre, estatico, icono }: CategoryFormValues,
  padreId: number | undefined,
) {
  return {
    name: nombre.trim(),
    kind: 'expense' as const,
    ...(esCentro
      ? { isStatic: estatico }
      : {
          ...(padreId === undefined ? {} : { parentId: padreId }),
          ...(icono ? { icon: icono } : {}),
        }),
  };
}

/** El título y la línea de ayuda de la ficha. */
export function categoryModalTexts(
  esCentro: boolean,
  editando: boolean,
): { titulo: string; ayuda: string } {
  return esCentro
    ? {
        titulo: editando
          ? t('centers.categoryModal.editCostCenter')
          : t('centers.categoryModal.newCostCenter'),
        ayuda: t('centers.categoryModal.costCenterHelp'),
      }
    : {
        titulo: editando
          ? t('centers.categoryModal.editCategory')
          : t('centers.categoryModal.newCategory'),
        ayuda: t('centers.categoryModal.categoryHelp'),
      };
}
