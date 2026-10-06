import { EllipsisVertical, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useUpdateCategory } from '@/features/cost-centers/api/categories';
import { AddCategory } from '@/features/cost-centers/components/add-category';
import { CategoryModal } from '@/features/cost-centers/components/category-modal';
import { CategoryTile } from '@/features/cost-centers/components/category-tile';
import { afterClose } from '@/features/cost-centers/components/close-then';
import { ConfirmDeletion } from '@/features/cost-centers/components/confirm-deletion';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';
import { CollapsibleHeader } from '@/shared/ui/atoms/collapsible-header';
import { Menu, MenuOption } from '@/shared/ui/molecules/menu';

interface CostCenterCardProps {
  costCenter: CategoryTree;
  tree: CategoryTree[];
}

/** Un centro de costos: su fila de cabecera y, desplegadas, sus categorías. */
export function CostCenterCard({ costCenter, tree }: CostCenterCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card>
      <CardContent className="p-0">
        {/*
          El resaltado va en la FILA, no en el botón.

          Puesto en el botón, se detenía justo antes del kebab —que está fuera
          de él para que pulsarlo no despliegue el centro— y dejaba un trozo sin
          iluminar. Y como el botón es rectangular, sus esquinas cuadradas
          asomaban por encima de las redondeadas de la tarjeta.
        */}
        <div
          className={cn(
            'flex items-center gap-2 pr-3 transition-colors hover:bg-muted sm:pr-4',
            'rounded-t-lg',
            // Cerrado, la fila ES la tarjeta: se redondea también por abajo.
            !isExpanded && 'rounded-b-lg',
          )}
        >
          <ExpandToggle
            costCenter={costCenter}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((wasExpanded) => !wasExpanded)}
          />

          {/* Fuera del botón que despliega: dentro, pulsarlo abriría el centro
              además de abrir el menú, porque el clic llega a los dos. */}
          <CostCenterMenu
            costCenter={costCenter}
            onEdit={() => setIsEditing(true)}
            onDelete={() => setIsConfirming(true)}
          />
        </div>

        <ConfirmDeletion
          category={costCenter}
          level="costCenter"
          tree={tree}
          isOpen={isConfirming}
          onClose={() => setIsConfirming(false)}
        />

        <CategoryModal
          level="costCenter"
          category={isEditing ? costCenter : null}
          isOpen={isEditing}
          onClose={() => setIsEditing(false)}
        />

        {isExpanded && <CostCenterBody costCenter={costCenter} tree={tree} />}
      </CardContent>
    </Card>
  );
}

function ExpandToggle({
  costCenter,
  isExpanded,
  onToggle,
}: {
  costCenter: CategoryTree;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const categories = costCenter.children ?? [];
  const concepts = categories.reduce((n, g) => n + (g.children?.length ?? 0), 0);

  return (
    <CollapsibleHeader isOpen={isExpanded} onToggle={onToggle}>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          {/* `text-lg` y no `text-xl`: el nombre de un centro es el
              título de una tarjeta, y a 20px competía con el título de
              la pantalla, que mide 24. */}
          <span className="truncate text-lg font-semibold">{costCenter.name}</span>
          {/* El candado y no la palabra "estático": es un estado del
              centro, y en una lista se reconoce antes por su forma que
              leyendo una etiqueta en cada fila. */}
          {costCenter.isStatic && (
            <Lock
              className="size-4 shrink-0 text-muted-foreground"
              aria-label={t('centers.card.static')}
            />
          )}
        </span>
        <span className="block text-xs text-muted-foreground">
          {t('centers.card.categoriesCount', {
            categories: categories.length,
            concepts,
          })}
        </span>
      </span>
    </CollapsibleHeader>
  );
}

function CostCenterMenu({
  costCenter,
  onEdit,
  onDelete,
}: {
  costCenter: CategoryTree;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateCategory();

  return (
    <Menu
      label={t('centers.card.actionsOf', { name: costCenter.name })}
      Icon={EllipsisVertical}
      isIconOnly
      variant="ghost"
    >
      {(close) => (
        <>
          {/* Renombrar. No existía por ningún camino: un centro con el
              nombre mal escrito había que borrarlo entero —con sus
              categorías y sus conceptos— y volver a armarlo. */}
          <MenuOption Icon={Pencil} onClick={afterClose(close, onEdit)}>
            {t('common.edit')}
          </MenuOption>

          {/* Poder cambiarlo después, no solo al crearlo: los centros que
              ya existían nacieron antes de que esto existiera. Se queda
              aquí además de en la ficha porque es de un solo golpe. */}
          <MenuOption
            Icon={costCenter.isStatic ? LockOpen : Lock}
            onClick={afterClose(close, () =>
              update.mutate({ id: costCenter.id, changes: { isStatic: !costCenter.isStatic } }),
            )}
          >
            {costCenter.isStatic ? t('centers.card.makeDynamic') : t('centers.card.makeStatic')}
          </MenuOption>
          <MenuOption Icon={Trash2} isDestructive onClick={afterClose(close, onDelete)}>
            {t('common.delete')}
          </MenuOption>
        </>
      )}
    </Menu>
  );
}

function CostCenterBody({ costCenter, tree }: { costCenter: CategoryTree; tree: CategoryTree[] }) {
  const categories = costCenter.children ?? [];

  /* El hueco para el siguiente categoría. Se declara aquí porque va en dos sitios
     —dentro de las columnas cuando hay categorías, suelto cuando no— y son el
     mismo botón con los mismos textos: escrito dos veces, cambiar uno y
     olvidar el otro es cuestión de tiempo. */
  const gap = <AddCategory parentId={costCenter.id} isAlone={categories.length === 0} />;

  return (
    <div className="border-t border-border p-3 sm:p-4">
      {/*
        ── Mampostería, no rejilla ─────────────────────────────────────
        Las categorías eran filas apiladas, y una fila de ancho completo con
        cuatro chips dentro deja tres cuartas partes de su renglón en
        blanco: en un centro con seis categorías había que recorrer media
        pantalla de vacío para leerlos. En columnas se ven todos de un
        vistazo, que es lo que se viene a hacer a esta pantalla.

        Pero una REJILLA alinea por FILAS, y de ahí no se sale bien: o
        estira todas las tarjetas al alto de la más alta —y una categoría con
        doce conceptos infla a los otros cuatro de su fila—, o cada una
        mide lo suyo y cada fila termina en un escalón distinto. Lo que
        había era la tercera salida: alto fijo y desplazar los conceptos
        que no cupieran. Esa esconde detrás de un gesto justamente lo
        que se viene a leer.

        La mampostería no tiene filas. Cada tarjeta se coloca debajo de
        la anterior de SU columna, así que mide exactamente lo que tiene
        dentro: ninguna infla a nadie, no hay nada que desplazar y no
        queda hueco entre una y la siguiente.

        ── Columnas CSS, y no la mampostería de la rejilla ─────────────
        `grid-template-rows: masonry` sigue detrás de una bandera en un
        solo navegador. Las columnas múltiples hacen esto mismo, sin una
        línea de JavaScript, en todos.

        Lo que cambia con ellas es el ORDEN: se lee hacia abajo por
        columnas, no de izquierda a derecha. Para un listado de categorías
        —donde se busca un nombre, no el sitio n-ésimo— es el recorrido
        de una lista, repetido al lado.

        ── El tope de columnas ─────────────────────────────────────────
        1 en un teléfono, 2 desde una tableta, 3 en un portátil pequeño,
        4 en uno grande y 5 a partir de un monitor.

        Un ancho mínimo —`minmax(17rem, 1fr)`, que es lo que hubo— no
        tiene techo: en un monitor de 27 pulgadas salían OCHO tarjetas de
        288px en una fila, una pared de fichas estrechas donde no se
        distingue una de otra. Lo que hace falta no es «no más pequeñas
        de esto» sino «no más de estas por fila»: lo que se rompe al
        crecer la pantalla no es el tamaño de la tarjeta, es cuántas
        caben antes de que la fila deje de leerse.

        Y el ancho de una tarjeta es el de su columna, así que no depende
        de cuántas haya: dos categorías se ven del mismo tamaño que doce.
      */}
      {categories.length > 0 && (
        /* Sin margen negativo que compense el `mb-3` de la última
           tarjeta de cada columna.

           Es lo que se hace siempre en una mampostería de columnas, y
           aquí no vale: el margen del final de una columna se descarta
           cuando la columna termina en un CORTE, pero se conserva cuando
           termina el contenido. Cuál de las dos cosas pasa en la columna
           más alta —que es la que fija el alto del bloque— depende de
           cuántas tarjetas haya y de qué mida cada una, así que un
           `-mb-3` acierta con unos datos y se come doce píxeles del
           relleno de la tarjeta con otros.

           Con el hueco de «Agregar categoría» cerrando el bloque, abajo del
           todo no hay ningún margen que compensar: el relleno de la
           tarjeta es el que dice que sea, siempre. */
        <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {categories.map((category) => (
            <CategoryTile key={category.id} category={category} tree={tree} />
          ))}
        </div>
      )}

      {/*
        El hueco de la siguiente categoría va FUERA de las columnas, a todo el
        ancho y debajo de todo.

        Dentro era una pieza más de la mampostería, y ahí no funciona: la
        mampostería termina en un borde irregular —cada columna acaba
        donde acaba su última tarjeta— así que el hueco caía al pie de
        una columna cualquiera, a una altura que cambia cada vez que se
        agrega un concepto. Un sitio que se mueve es un sitio que hay que
        buscar.

        A todo el ancho y al final está siempre donde termina de leerse
        el centro, y remata el borde irregular con una línea recta.
      */}
      {gap}
    </div>
  );
}
