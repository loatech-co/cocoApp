import { t } from '@/shared/lib/i18n';
/**
 * Lo que la ficha de un centro o una categoría manda al servidor.
 *
 * Cada nivel guarda lo suyo: lo estático es del CENTRO —una categoría hereda lo
 * que diga el suyo— y el icono es de la categoría, porque en la fila de un
 * centro no se ve.
 */

export interface CategoryFormValues {
  isCostCenter: boolean;
  name: string;
  isStatic: boolean;
  icon: string | null;
}

/** Los cambios al renombrar. */
export function categoryChanges({ isCostCenter, name, isStatic, icon }: CategoryFormValues) {
  return isCostCenter ? { name: name.trim(), isStatic } : { name: name.trim(), icon };
}

/** Lo que se crea. Una categoría cuelga de su padre, si lo hay. */
export function newCategory(
  { isCostCenter, name, isStatic, icon }: CategoryFormValues,
  parentId: number | undefined,
) {
  return {
    name: name.trim(),
    kind: 'expense' as const,
    ...(isCostCenter
      ? { isStatic }
      : {
          ...(parentId === undefined ? {} : { parentId }),
          ...(icon ? { icon } : {}),
        }),
  };
}

/** El título y la línea de ayuda de la ficha. */
export function categoryModalTexts(
  isCostCenter: boolean,
  isEditing: boolean,
): { title: string; help: string } {
  return isCostCenter
    ? {
        title: isEditing
          ? t('centers.categoryModal.editCostCenter')
          : t('centers.categoryModal.newCostCenter'),
        help: t('centers.categoryModal.costCenterHelp'),
      }
    : {
        title: isEditing
          ? t('centers.categoryModal.editCategory')
          : t('centers.categoryModal.newCategory'),
        help: t('centers.categoryModal.categoryHelp'),
      };
}
