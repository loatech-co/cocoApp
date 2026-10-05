import { type Dashboard, type CategorySpend } from '@/shared/api/generated/model';
import { rangoLargo } from '@/shared/lib/fechas';
import { formatCOP } from '@/shared/lib/utils';
import { Etiqueta } from '@/shared/ui/atoms/badge';
import { Card, CardContent } from '@/shared/ui/atoms/card';

/** Los cuatro indicadores del resumen. */
export function DashboardKpis({ datos, alDia }: { datos: Dashboard; alDia: boolean }) {
  /*
      Cuatro indicadores: de a DOS desde el teléfono y de a cuatro en una
      pantalla ancha. En tres columnas, el cuarto se quedaba solo en una
      fila para él.

      De a dos y no de a uno, que es lo que había debajo de 640: cuatro
      tarjetas apiladas son cuatro pantallazos de desplazamiento antes de
      llegar a la gráfica, y las cifras que hay que comparar —lo que hay
      que tener contra lo que se lleva gastado— nunca se veían a la vez.
      En dos columnas caben las cuatro en un golpe de vista.
  */
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
      {/*
        Va PRIMERO, antes de lo gastado, porque se lee antes: cuánto hay
        que tener y después cuánto se lleva gastado.

        En un periodo CERRADO el presupuesto necesario fue exactamente lo
        que costó: ya no es una previsión, es un hecho. Enseñar ahí la
        previsión del mes en curso sería contestar con el dato de otro
        mes, y dejar el hueco vacío haría creer que en 2024 no hubo
        costos fijos.
      */}
      <Kpi
        etiqueta="Presupuesto necesario"
        valor={formatCOP(alDia ? datos.requiredBudget : datos.range.expense)}
        detalle={alDia ? 'Costos fijos de este mes' : 'Lo que costó el periodo'}
      />
      <Kpi
        etiqueta="Gastos del periodo"
        valor={formatCOP(datos.range.expense)}
        // Cuánto fue fijo y cuánto variable. Los nombres son los de los
        // centros de costos, así que si mañana se llaman de otra forma,
        // el indicador lo dice solo.
        desglose={datos.expenseByCostCenter}
        acento="expense"
      />
      {/* Apagada, no escondida: los ingresos existen en el modelo —el
          resumen ya los suma— y quitar la tarjeta haría creer que la
          aplicación no sabe de ellos. Apagada dice que sabrá, y el cero
          se queda porque es el dato de hoy: no hay ingresos
          registrados. Es el mismo trato que la opción «Ingreso» del
          menú de nuevo movimiento. */}
      <Kpi etiqueta="Ingresos del periodo" valor={formatCOP(datos.range.income)} pronto />
      <Kpi
        etiqueta="Movimientos"
        valor={String(datos.range.count)}
        detalle={rangoLargo(datos.period.from, datos.period.to)}
      />
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  detalle,
  desglose,
  acento,
  pronto = false,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  /** En qué se reparte la cifra. Se escribe debajo, con su nombre y su monto. */
  desglose?: CategorySpend[];
  acento?: 'income' | 'expense';
  /**
   * La cifra es real pero la sección todavía no está: se apaga y se rotula.
   *
   * Apagada y no escondida, que es la regla de esta app para lo que va a
   * llegar: quitarla haría creer que la aplicación no sabe de eso. Y el valor
   * se queda a la vista —un indicador sin cifra no es un indicador— solo que
   * sin color de dato, porque pintarlo como los demás diría que ya está vivo.
   */
  pronto?: boolean;
}) {
  return (
    <Card>
      {/*
        ── Sin icono ─────────────────────────────────────────────────────────
        Llevaba un pastel de color con un glifo dentro, y no decía nada que no
        dijera ya el rótulo: una cartera junto a «Presupuesto necesario», un
        recibo junto a «Movimientos». Un icono que repite la palabra que tiene
        al lado no ayuda a encontrar nada; solo le quita 40px de ancho a la
        cifra, que es lo único que se viene a leer aquí.

        Distinto es el icono que sustituye a una palabra —el de un botón sin
        texto— o el que distingue entre cosas del mismo tipo. Ninguno de los
        dos era el caso.
      */}
      {/* 12 de relleno en el teléfono y no 16: con dos tarjetas por fila, cada
          una mide unos 170px, y 16 por lado le quitan a la cifra casi un
          quinto del ancho que le queda. */}
      {/* Apagada con la tinta del tema y no con opacidad: al 60 % el rótulo
          y la etiqueta bajaban a 2,6:1 y 2,3:1. El rótulo, la cifra y la
          etiqueta ya van en `muted-foreground`, que da más de 5:1. */}
      <CardContent className="p-3 sm:p-6">
        <div className="min-w-0">
          {/* Sin mayúsculas sostenidas ni interletraje abierto. Era el
              rótulo en versalitas del panel de control de siempre, y con la
              tipografía del tema —que declara el interletraje en cero— se lee
              como si viniera de otro producto. Un rótulo en minúsculas se lee
              de un golpe; en sostenidas hay que descifrarlo letra a letra. */}
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{etiqueta}</span>
            {/* La misma etiqueta que en el resto de la app, no un rótulo a
                mano: `Etiqueta` ya decide su redondeo, su relleno y su
                tamaño de letra. */}
            {pronto && (
              <Etiqueta tono="apagado" className="shrink-0">
                Pronto
              </Etiqueta>
            )}
          </p>
          <p className={claseDeCifra(pronto, acento)}>{valor}</p>
          {detalle && <p className="mt-1 truncate text-xs text-muted-foreground">{detalle}</p>}

          {/* Envuelve en vez de truncarse: un reparto a medias —"Costos fij…"—
              no dice menos, dice otra cosa. Cada parte se queda entera y se
              pasa a la línea de abajo si la tarjeta es angosta. */}
          {desglose && desglose.length > 0 && <Desglose partes={desglose} />}
        </div>
      </CardContent>
    </Card>
  );
}

// `sm:text-3xl` y no unos 28px a mano: 30 es el escalón que
// sigue a 24 en la escala, y la diferencia con 28 no la nota
// nadie —la de tener una medida fuera de la escala, sí—.
//
// Y 20 en el teléfono, un escalón por debajo de los 24 que tenía.
// Desde que las tarjetas van de a dos, cada una mide media
// pantalla: «$1.234.567» a 24px no cabía y se cortaba, y un
// indicador con la cifra truncada no indica nada.
function claseDeCifra(pronto: boolean, acento: 'income' | 'expense' | undefined): string {
  return (
    'tabular mt-1 truncate text-xl font-semibold leading-tight sm:text-3xl ' +
    (pronto
      ? 'text-muted-foreground'
      : acento === 'income'
        ? 'text-income'
        : acento === 'expense'
          ? 'text-expense'
          : '')
  );
}

/* Envuelve en vez de truncarse: un reparto a medias —"Costos fij…"—
   no dice menos, dice otra cosa. Cada parte se queda entera y se
   pasa a la línea de abajo si la tarjeta es angosta. */
function Desglose({ partes }: { partes: CategorySpend[] }) {
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {partes.map((parte) => (
        <span key={parte.categoryId ?? parte.name} className="whitespace-nowrap">
          {parte.name}{' '}
          <strong className="tabular font-semibold text-foreground">
            {formatCOP(parte.total)}
          </strong>
        </span>
      ))}
    </p>
  );
}
