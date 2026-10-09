import { t } from '@/shared/lib/i18n';
/**
 * What the form of a cost center or a category sends to the server.
 *
 * Each level saves its own: the static flag belongs to the COST CENTER —a category inherits
 * whatever its own says— and the icon belongs to the category, because in the row of a
 * cost center it is not shown.
 */

export interface CategoryFormValues {
  isCostCenter: boolean;
  name: string;
  isStatic: boolean;
  icon: string | null;
}

/** The changes when renaming. */
export function categoryChanges({ isCostCenter, name, isStatic, icon }: CategoryFormValues) {
  return isCostCenter ? { name: name.trim(), isStatic } : { name: name.trim(), icon };
}

/** What gets created. A category hangs from its parent, if there is one. */
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

/** The title and the help line of the form. */
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
