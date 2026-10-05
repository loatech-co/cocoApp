import type { MovementSheetState } from '@/features/transactions/hooks/use-movement-form';
import { rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { nombreDelOrigen } from '@/features/transactions/model/precedencia';
import { Campo } from '@/shared/ui/atoms/campo';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { Combo } from '@/shared/ui/organisms/combo';
import type { Category } from '@coco/types';

import { BuscadorDeConcepto } from './buscador-de-concepto';

interface ClassificationProps {
  ficha: MovementSheetState;
  arbol: Category[];
  /** El centro GUARDADO es estático: ni el buscador ni la cascada se mueven. */
  estatico: boolean;
  crearDentro: (nombre: string, padreId: number | undefined) => Promise<void>;
  creando: boolean;
}

/** Lo que el buscador dice debajo: de dónde salió lo que hay puesto. */
function searchHelp(ficha: MovementSheetState): string | undefined {
  const { clasificacion, categoryId, candidatosDelRecibo } = ficha;
  if (clasificacion.origen && clasificacion.origen !== 'manual' && categoryId !== undefined) {
    return `${nombreDelOrigen(clasificacion.origen).replace(/^\w/, (c) => c.toUpperCase())}. Puedes cambiarlo.`;
  }
  return candidatosDelRecibo.length > 0 && clasificacion.origen !== 'manual'
    ? 'El recibo apunta a varios conceptos: elige uno en el buscador.'
    : undefined;
}

/**
 * ── Un solo buscador para clasificar ────────────────────────────────────────
 * Se escribe «d1» y aparece «Mercado · Alimentación › Costos variables»: un
 * clic y los tres niveles quedan puestos. La cascada de centro, categoría y
 * concepto sigue ahí, detrás del enlace de abajo, para quien quiera ir nivel a
 * nivel; pero ya no es la puerta.
 *
 * Lo que el buscador dice debajo —«sugerido por tu historial»— es la regla de
 * no guardar nunca una clasificación sugerida sin que la persona la vea.
 *
 * ── Los tres se bloquean si el centro GUARDADO es estático ──────────────────
 * Esta regla estaba y se perdió al rediseñar la ficha: los desplegables
 * pasaron a bloquearse solo por dependencia —«elige antes un centro»— y el
 * estático dejó de contar, así que un movimiento de Costos fijos se podía
 * reclasificar desde aquí aunque la tabla no lo permitiera. La misma plata se
 * movía o no según por dónde se entrara.
 *
 * Lo que protege un centro estático es su estructura. Borrar el movimiento sí
 * se puede —eso es el registro, no la estructura—; moverlo de concepto, no.
 */
export function MovementClassification({
  ficha,
  arbol,
  estatico,
  crearDentro,
  creando,
  recientes,
}: ClassificationProps & { recientes: readonly number[] }) {
  return (
    <>
      <BuscadorDeConcepto
        id="mov-concepto"
        arbol={arbol}
        valor={ficha.categoryId}
        deshabilitado={estatico}
        onElegir={(id) => ficha.proponer({ categoryId: id, origen: 'manual' })}
        onCrearConcepto={(nombre, categoriaId) => void crearDentro(nombre, categoriaId)}
        creando={creando}
        recientes={recientes}
        candidatos={ficha.candidatosDelRecibo}
        ayuda={searchHelp(ficha)}
      />

      {!estatico && (
        <div className="-mt-2 flex self-start">
          <TextButton tono="tenue" onClick={() => ficha.setCascadaVisible((v) => !v)}>
            {ficha.cascadaVisible ? 'Ocultar centro y categoría' : 'Elegir por centro y categoría'}
          </TextButton>
        </div>
      )}

      {(ficha.cascadaVisible || estatico) && (
        <ClassificationCascade
          ficha={ficha}
          arbol={arbol}
          estatico={estatico}
          crearDentro={crearDentro}
          creando={creando}
        />
      )}
    </>
  );
}

/**
 * La cascada de siempre: de qué centro, de qué categoría, qué concepto.
 *
 * El centro no ofrece crear: un centro es la estructura de arriba y se define
 * tres veces en la vida de una cuenta.
 */
function ClassificationCascade(props: ClassificationProps) {
  const { ficha, arbol, estatico, crearDentro, creando } = props;
  const { centro, categoria, concepto } = rutaSeleccionada(arbol, ficha.categoryId);
  const elegir = (id?: number): void => ficha.proponer({ categoryId: id, origen: 'manual' });

  return (
    <>
      <CostCenterField centro={centro} arbol={arbol} estatico={estatico} onElegir={elegir} />

      <Campo etiqueta="Categoría" id="mov-categoria">
        <Combo
          id="mov-categoria"
          etiqueta="Categoría"
          valor={categoria ? String(categoria.id) : ''}
          opciones={(centro?.children ?? []).map((g) => ({
            valor: String(g.id),
            etiqueta: g.name,
          }))}
          deshabilitado={estatico || !centro}
          vacio={centro ? 'Sin elegir' : 'Elige antes un centro de costos'}
          creando={creando}
          onCambiar={(v) => elegir(v === '' ? centro?.id : Number(v))}
          onCrear={(nombre) => void crearDentro(nombre, centro?.id)}
        />
      </Campo>

      <Campo etiqueta="Concepto" id="mov-concepto-cascada">
        <Combo
          id="mov-concepto-cascada"
          etiqueta="Concepto"
          valor={concepto ? String(concepto.id) : ''}
          opciones={(categoria?.children ?? []).map((c) => ({
            valor: String(c.id),
            etiqueta: c.name,
          }))}
          deshabilitado={estatico || !categoria}
          vacio={categoria ? 'Sin elegir' : 'Elige antes una categoría'}
          creando={creando}
          onCambiar={(v) => elegir(v === '' ? categoria?.id : Number(v))}
          onCrear={(nombre) => void crearDentro(nombre, categoria?.id)}
        />
      </Campo>
    </>
  );
}

/** El centro de costos. No ofrece crear: es la estructura de arriba. */
function CostCenterField({
  centro,
  arbol,
  estatico,
  onElegir,
}: {
  centro: Category | undefined;
  arbol: Category[];
  estatico: boolean;
  onElegir: (id?: number) => void;
}) {
  return (
    <Campo etiqueta="Centro de costos" id="mov-centro">
      <Combo
        id="mov-centro"
        etiqueta="Centro de costos"
        valor={centro ? String(centro.id) : ''}
        opciones={arbol.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
        deshabilitado={estatico}
        onCambiar={(v) => onElegir(v === '' ? undefined : Number(v))}
      />
    </Campo>
  );
}
