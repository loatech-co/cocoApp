import type { ReactNode } from 'react';

import { Distribucion } from '@/features/transactions/components/cost-distribution';
import { PagosPendientes } from '@/features/transactions/components/pagos-pendientes';
import { Tendencia } from '@/features/transactions/components/tendencia';
import type {
  Category,
  Dashboard,
  DashboardBreakdownLevel,
  PendingPayment,
} from '@/shared/api/generated/model';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent } from '@/shared/ui/atoms/card';

interface PropsDeLaFila {
  datos: Dashboard;
  hayPendientes: boolean;
  ruta: Category[];
  onElegirPago: (pago: PendingPayment) => void;
  onBajar: (id: number) => void;
  onSubir: () => void;
}

/** La fila de la gráfica, los pagos pendientes y la distribución. */
export function DashboardCharts({
  datos,
  hayPendientes,
  ruta,
  onElegirPago,
  onBajar,
  onSubir,
}: PropsDeLaFila) {
  /* La gráfica dice CUÁNDO se gastó y la dona EN QUÉ. Son la misma
      pregunta partida en dos, así que van a la misma altura: una
      debajo de la otra obliga a desplazarse para cruzarlas. */
  /*
    ── Quién manda sobre el alto de esta fila ────────────────────────
    La gráfica. Su lienzo tiene una PROPORCIÓN propia —16:7— así que
    mide por sí mismo, sin preguntarle a nadie, y con un tope para que
    en una pantalla ancha no se estire sin fin. De ahí sale el alto de
    su tarjeta, de ahí el de la fila, y la tarjeta de la dona se estira
    hasta igualarlo.

    Lo que no puede pasar es lo contrario: que la gráfica mida contra
    su tarjeta y la tarjeta contra la gráfica. Eso no es una cadena, es
    un círculo, y el navegador lo resuelve como puede —que fue lo que
    se salió de la página—.

    ── El alto ──────────────────────────────────────────────────────
    UN número —420px— y va en la PISTA de la rejilla, no en la caja.

    Con `h-[380px]` en la caja la pista seguía siendo `auto`: nadie le
    había dicho cuánto mide. Entonces el `h-full` de cada tarjeta no
    tenía contra qué resolverse, así que cada una crecía con su
    contenido —la lista de pendientes son ocho filas, 670px—, la pista
    crecía con ellas y la caja se quedaba en 380. Las tarjetas se
    salían por debajo y pintaban encima de la tabla de movimientos.

    Declarando la PISTA, el alto es un dato desde el principio: las
    tres tarjetas miden 420, su `h-full` resuelve, y lo que no quepa se
    desplaza dentro de la suya.

    El `min-h-0` de cada tarjeta es la otra mitad. Un elemento de
    rejilla tiene `min-height: auto`, que es su mínimo de contenido: sin
    ponerlo en cero, la lista larga vuelve a mandar sobre los 420 y
    estamos donde empezamos.

    ── El ancho de las dos columnas de la derecha ────────────────────
    Las dos MISMAS: pagos pendientes y distribución son dos respuestas
    del mismo tamaño y una más angosta que la otra se lee como si
    importara menos. Se escriben con `repeat(2, …)` para que no puedan
    separarse cuando alguien toque una y se olvide de la otra.

    Nunca menos del 20 % de la fila y nunca más de 30rem —la medida
    que ya tenía la distribución—, con los dos extremos concretos:
    dejarlas en `auto` las haría depender de su contenido, y su
    contenido depende de ellas.
  */
  return (
    <div
      className={cn(
        // `auto-rows` y no `grid-rows`: con la gráfica a todo el ancho
        // hay DOS filas, y las dos miden lo mismo.
        'grid gap-3 sm:gap-5 lg:auto-rows-[420px]',
        /*
          ── La MISMA rejilla que los indicadores de arriba ────────────
          Cuatro columnas, y cada tarjeta ocupa las que le tocan. Esto
          no es una coincidencia bonita: es lo único que hace que los
          cantos de esta fila caigan sobre los de la de arriba, y dos
          filas de tarjetas desalineadas se leen como dos rejillas.

          Y es además la forma correcta de decir "la mitad". Un
          `minmax(50%, …)` mide el 50 % del ANCHO TOTAL, huecos
          incluidos, así que la gráfica salía más ancha que dos
          indicadores juntos: los huecos se descontaban de las otras
          dos. Ocupando dos columnas de cuatro, la gráfica mide dos
          indicadores más el hueco de en medio, que es exactamente la
          mitad de la fila.

          ── Y por qué a 1280 cambia el reparto ────────────────────────
          Porque a 1024 la cuenta no da: si la gráfica se lleva la
          mitad, a la dona y a los pagos pendientes les toca un cuarto
          cada una, y un cuarto de 1100px son 275 —menos de lo que
          necesitan—. Así que ahí no se estrecha ninguna: la gráfica
          pasa a ancho completo y las otras dos bajan debajo, mitad y
          mitad. Es el mismo corte que ya usan los indicadores, que
          hasta 1280 van de dos en dos.
        */
        'lg:grid-cols-2 xl:grid-cols-4',
      )}
    >
      <Comportamiento hayPendientes={hayPendientes}>
        <Tendencia
          puntos={datos.trend}
          granularidad={datos.period.granularity === 'day' ? 'dia' : 'mes'}
        />
      </Comportamiento>

      {hayPendientes && (
        <PagosPendientes
          className="min-h-0"
          pagos={datos.pending}
          // Abre la ficha de «Confirmar pago»: el concepto, el valor
          // esperado y la fecha de vencimiento ya están dichos aquí, así
          // que lo que queda es adjuntar el soporte y confirmar.
          onElegir={onElegirPago}
        />
      )}

      <div className="h-full min-h-0">
        <Distribucion
          filas={datos.byCategory}
          nivel={NOMBRE_DEL_NIVEL[datos.breakdownLevel]}
          padre={datos.breakdownParent}
          totalGastado={datos.range.expense}
          ruta={ruta}
          onBajar={onBajar}
          onSubir={onSubir}
        />
      </div>
    </div>
  );
}

function Comportamiento({
  hayPendientes,
  children,
}: {
  hayPendientes: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        'h-full min-h-0',
        // Con pendientes: toda la fila hasta 1280, y media a partir
        // de ahí. Sin ellos son dos tarjetas, y la dona se queda con
        // una columna —la de un indicador— en vez de con media fila.
        hayPendientes ? 'lg:col-span-2' : 'xl:col-span-3',
      )}
    >
      <CardContent className="flex h-full flex-col p-4 sm:p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">Comportamiento</h2>
        {/*
          `flex-1` con un mínimo, no una proporción fija.

          Con proporción, el alto de la gráfica salía de su ancho —y al
          angostarse su columna, de golpe medía menos que las tarjetas
          de al lado—: la fila la estiraban ellas, la gráfica se
          quedaba con su alto pequeño y aparecía pegada arriba con el
          resto de la tarjeta en blanco.

          Ahora se estira hasta el alto de la fila, sea quien sea el
          que lo fije, y el mínimo evita que se aplaste cuando la fila
          es baja.
        */}
        <div className="min-h-0 flex-1">{children}</div>
      </CardContent>
    </Card>
  );
}

/** The API names the level in English (v2); the screen says it in Spanish. */
const NOMBRE_DEL_NIVEL: Record<DashboardBreakdownLevel, string> = {
  cost_center: 'centro de costos',
  category: 'categoría',
  concept: 'concepto',
};
