import { EllipsisVertical, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { afterClose } from '@/features/cost-centers/components/close-then';
import { ConceptModal } from '@/features/cost-centers/components/concept-modal';
import { ConfirmDeletion } from '@/features/cost-centers/components/confirm-deletion';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Chip } from '@/shared/ui/atoms/badge';
import { Block } from '@/shared/ui/atoms/block';
import { CategoryIcon } from '@/shared/ui/atoms/icons';
import { Menu, MenuOption } from '@/shared/ui/molecules/menu';

/**
 * Lo que hace de una tarjeta una pieza de la mampostería.
 *
 * ── Por qué `break-inside-avoid` no es opcional ─────────────────────────────
 * Sin él, una tarjeta que no cabe entera al pie de su columna se PARTE: el
 * título y dos conceptos abajo del todo, el resto arriba de la siguiente, y
 * ningún borde que cierre ni que abra. Es la declaración que convierte un
 * texto en columnas en un montón de fichas.
 *
 * ── Y por qué el hueco de abajo es un margen y no el `gap` ──────────────────
 * Porque en un contenedor de columnas `gap` es solo el hueco ENTRE COLUMNAS.
 * Lo que separa una tarjeta de la de debajo no lo pone nadie, y sin margen
 * quedan pegadas. Doce píxeles, los mismos del `gap-3` de al lado, para que la
 * separación se lea igual en los dos sentidos.
 */
const TILE = 'mb-3 break-inside-avoid';

interface CategoryTileProps {
  category: CategoryTree;
  tree: CategoryTree[];
}

export function CategoryTile({ category, tree }: CategoryTileProps) {
  const [isEditing, setIsEditing] = useState<CategoryTree | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const concepts = category.children ?? [];

  return (
    /* `pt` más corto que el resto del relleno: arriba de la tarjeta manda el
       kebab, que es un botón de 36 con un icono de 16 dentro, y esos diez
       píxeles de aire suyo se suman a los del borde. Con el relleno parejo,
       el título quedaba hundido. */
    <Block className={cn('pt-2 sm:p-4 sm:pt-2.5', TILE)}>
      <div className="flex items-center justify-between gap-2">
        <CategoryName category={category} />
        {/* El mismo menú que en el centro: un icono suelto no tiene dónde
            pulsarse —en un teléfono hay que acertarle a 16px— y no se ve como
            algo pulsable hasta que uno lo prueba. */}
        {/*
          El kebab se acerca al canto con margen NEGATIVO, no encogiéndolo.

          Su blanco son 36px de puntero y 42 de dedo, y el icono son 16: los
          diez de aire que quedan alrededor se sumaban a los del borde de la
          tarjeta y el icono acababa a veintiséis píxeles de la esquina,
          flotando. Recortando el botón se arreglaría la vista y se rompería
          el blanco, que es lo que hay que acertar con el pulgar.

          Con el margen en negativo el botón sigue midiendo lo mismo —se puede
          pulsar igual— y lo que se mueve es dónde queda dibujado dentro de
          él. El área táctil se come el relleno de la tarjeta, que es espacio
          muerto de todos modos.
        */}
        <CategoryMenu
          name={category.name}
          onAdd={() => setIsCreating(true)}
          onEdit={() => setIsRenaming(true)}
          onDelete={() => setIsConfirming(true)}
        />
      </div>

      {/*
        Ni caja que los desplace ni alto que rellenar: la tarjeta mide lo que
        tienen ellos.

        Estuvieron dentro de un `overflow-y-auto` con `flex-1`, que era lo que
        sostenía el alto fijo de la rejilla: doce conceptos se desplazaban
        dentro de su tarjeta en vez de costarle un centímetro a las vecinas.
        En mampostería no hace falta pagar ese precio —una tarjeta alta no
        infla a nadie— y desplazar escondía detrás de un gesto justamente lo
        que se viene a leer a esta pantalla.
      */}
      {concepts.length > 0 && <ConceptList concepts={concepts} onEdit={setIsEditing} />}

      <ConfirmDeletion
        category={category}
        level="category"
        tree={tree}
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
      />

      <CategoryModal
        level="category"
        category={isRenaming ? category : null}
        isOpen={isRenaming}
        onClose={() => setIsRenaming(false)}
      />

      <ConceptModal
        isOpen={isEditing !== null}
        concept={isEditing}
        onClose={() => setIsEditing(null)}
      />
      <ConceptModal
        isOpen={isCreating}
        categoryId={category.id}
        onClose={() => setIsCreating(false)}
      />
    </Block>
  );
}

/*
  El icono a la IZQUIERDA del nombre, no encima ni dentro de un pastel.

  Es lo que hace que una rejilla de doce categorías se recorra mirando en
  vez de leyendo: la forma se reconoce antes que la palabra. A la
  izquierda porque es por donde empieza a leerse la fila, y del mismo
  tamaño que el texto —no un adorno grande— porque acompaña al nombre,
  no lo sustituye.

  Una categoría sin icono no deja hueco reservado: `IconoDeCategoria`
  devuelve nada y el nombre arranca donde arrancaba antes. Un hueco
  vacío alineado con los que sí tienen icono se ve como un icono que
  no cargó.
*/
function CategoryName({ category }: { category: CategoryTree }) {
  return (
    <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <CategoryIcon name={category.icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{category.name}</span>
    </h3>
  );
}

function CategoryMenu({
  name,
  onAdd,
  onEdit,
  onDelete,
}: {
  name: string;
  onAdd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu
      label={t('centers.tile.actionsOf', { name })}
      Icon={EllipsisVertical}
      isIconOnly
      variant="ghost"
      boxClassName="-my-1 -mr-1.5 sm:-mr-2"
    >
      {(close) => (
        <>
          {/* Lo PRIMERO del menú: es lo que más se hace con una categoría.
              Eliminar va al final y en rojo, porque es lo que menos. */}
          <MenuOption Icon={Plus} onClick={afterClose(close, onAdd)}>
            {t('centers.tile.addConcept')}
          </MenuOption>

          {/* Renombrar una categoría no existía por ningún camino, igual que en
              el centro: la única salida era borrarlo con sus conceptos
              dentro y volver a escribirlos. */}
          <MenuOption Icon={Pencil} onClick={afterClose(close, onEdit)}>
            {t('common.edit')}
          </MenuOption>
          <MenuOption Icon={Trash2} isDestructive onClick={afterClose(close, onDelete)}>
            {t('common.delete')}
          </MenuOption>
        </>
      )}
    </Menu>
  );
}

function ConceptList({
  concepts,
  onEdit,
}: {
  concepts: CategoryTree[];
  onEdit: (concept: CategoryTree) => void;
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {concepts.map((concept) => (
        <li key={concept.id}>
          {/* Se abren para editar: renombrar y decir si se pagan solos.
                Antes eran texto muerto, y el único modo de corregir un
                nombre mal escrito era borrar el concepto y crearlo de nuevo
                —con lo que los movimientos se quedaban sin clasificar—. */}
          {/* El `Chip` compartido, que trae su forma y su relleno.
                 Escrito a mano era un `bg-card` dentro de una caja `muted`
                 dentro de una tarjeta `card`, y ese escalón va en sentidos
                 contrarios según el tema: el chip se levantaba en claro y se
                 hundía en oscuro. */}
          {/* `max-w-full` y el nombre recortado: en una tarjeta de 17rem,
                un concepto con nombre largo hacía un chip más ancho que su
                tarjeta y se salía por el lado. */}
          <Chip
            onClick={() => onEdit(concept)}
            title={t('centers.tile.editConcept', { name: concept.name })}
            className="max-w-full"
          >
            {concept.isRecurring && (
              <Repeat
                className="size-3 shrink-0 opacity-70"
                aria-label={t('centers.tile.recurring')}
              />
            )}
            <span className="min-w-0 truncate">{concept.name}</span>
          </Chip>
        </li>
      ))}
    </ul>
  );
}
