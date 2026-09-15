import { Check, ChevronDown, Copy, Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * La estructura que debe tener el CSV.
 *
 * ── Por qué es una GUÍA y no un requisito ───────────────────────────────────
 * El parser detecta las columnas por sinónimos, así que un archivo con "Valor"
 * o "Amount" o "Importe" funciona igual. Esto es lo que hay que enseñarle a
 * alguien que empieza de cero — o a la IA que le va a convertir años de
 * recibos.
 */

const COLUMNAS = [
  {
    nombre: 'fecha',
    obligatoria: true,
    formato: 'AAAA-MM-DD o DD/MM/AAAA',
    nota: 'En Colombia 01/08 es el 1 de agosto.',
  },
  {
    nombre: 'monto',
    obligatoria: true,
    formato: 'Solo números',
    nota: 'Negativo para gastos si también hay ingresos.',
  },
  {
    nombre: 'descripcion',
    obligatoria: false,
    formato: 'Texto libre',
    nota: 'El comercio o el concepto.',
  },
  {
    nombre: 'tipo',
    obligatoria: false,
    formato: 'gasto o ingreso',
    nota: 'Si está, manda sobre el signo del monto.',
  },
  {
    nombre: 'categoria',
    obligatoria: false,
    formato: 'Texto libre',
    nota: 'Se propone crearla si no existe.',
  },
] as const;

const PLANTILLA = [
  'fecha,monto,descripcion,tipo,categoria',
  '2026-08-01,45900.50,Exito Poblado,gasto,Mercado',
  '2026-08-03,23500,Rappi,gasto,Domicilios',
  '2026-08-05,2000000,Salario agosto,ingreso,',
  '2026-08-12,38900,Netflix,gasto,Suscripciones',
].join('\n');

/**
 * Prompt para que una IA convierta un histórico suelto en este CSV.
 *
 * Existe porque el caso real no es "escribo un CSV a mano": es "tengo años de
 * recibos en fotos, correos y notas". Pegar esto en cualquier asistente ahorra
 * el trabajo entero, y como el resultado pasa igual por la pantalla de
 * revisión, un error de la IA se corrige antes de tocar nada.
 */
const PROMPT = `Convierte mis movimientos financieros a un CSV con esta estructura EXACTA:

fecha,monto,descripcion,tipo,categoria

Reglas:
- fecha: formato AAAA-MM-DD. Si el original es DD/MM/AAAA, recuerda que el día va primero.
- monto: solo números, con punto como separador decimal y SIN separador de miles.
  Ejemplo: 45900.50 (no "45.900,50" ni "$45.900").
- descripcion: el comercio o concepto, sin números de referencia ni de autorización.
- tipo: la palabra "gasto" o "ingreso".
- categoria: una palabra o dos. Déjala vacía si no estás seguro; es preferible
  a inventar una.

Importante:
- Una fila por movimiento. No agrupes ni sumes nada.
- No inventes datos que no estén en el original. Si un dato falta, deja la celda vacía.
- Si un monto es ambiguo, déjalo tal cual y no adivines.
- Devuelve SOLO el CSV, sin explicaciones ni bloques de código.

Mis movimientos son:
[pega aquí tus recibos, extractos o notas]`;

export function GuiaCsv() {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-secondary/30">
      <button
        type="button"
        onClick={() => setAbierta((valor) => !valor)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <FileSpreadsheet className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-medium">¿Vas a importar un CSV?</span>
          <span className="block text-xs text-muted-foreground">
            Cómo estructurarlo, una plantilla, y un prompt para que una IA lo prepare por ti.
          </span>
        </span>
        <ChevronDown
          className={cn('size-4 shrink-0 transition-transform', abierta && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {abierta && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <Columnas />
          <Plantilla />
          <PromptParaIa />
        </div>
      )}
    </div>
  );
}

function Columnas() {
  return (
    <div>
      <h3 className="text-sm font-medium">Las columnas</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Solo <strong>fecha</strong> y <strong>monto</strong> son obligatorias. Los nombres no
        tienen que ser exactos: se reconocen sinónimos como Valor, Importe, Amount, Concepto o
        Date.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2 pr-4 font-medium">Columna</th>
              <th className="pb-2 pr-4 font-medium">Formato</th>
              <th className="pb-2 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            {COLUMNAS.map((columna) => (
              <tr key={columna.nombre} className="border-t border-border/60">
                <td className="py-2 pr-4 font-mono whitespace-nowrap">
                  {columna.nombre}
                  {columna.obligatoria && (
                    <span className="ml-1.5 text-warning" title="Obligatoria">
                      *
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                  {columna.formato}
                </td>
                <td className="py-2 text-muted-foreground">{columna.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Plantilla() {
  return (
    <div>
      <h3 className="text-sm font-medium">Un ejemplo</h3>
      <pre className="mt-2 overflow-x-auto rounded-md bg-background p-3 font-mono text-xs">
        {PLANTILLA}
      </pre>
      <Button variant="outline" size="sm" className="mt-2" onClick={descargarPlantilla}>
        <Download aria-hidden="true" />
        Descargar plantilla
      </Button>
    </div>
  );
}

function PromptParaIa() {
  const [copiado, setCopiado] = useState(false);

  function copiar(): void {
    void navigator.clipboard.writeText(PROMPT).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div>
      <h3 className="text-sm font-medium">¿Tienes años de recibos sueltos?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Copia este texto, pégalo en cualquier asistente de IA junto con tus recibos, y te
        devolverá el CSV listo. Lo que salga pasa igual por la revisión, así que un error suyo lo
        corriges antes de que toque nada.
      </p>

      <pre className="mt-2 max-h-48 overflow-y-auto rounded-md bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {PROMPT}
      </pre>

      <Button variant="outline" size="sm" className="mt-2" onClick={copiar}>
        {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {copiado ? 'Copiado' : 'Copiar el prompt'}
      </Button>
    </div>
  );
}

/**
 * Descarga la plantilla como archivo.
 *
 * Lleva la marca de orden de bytes al principio: sin ella, Excel abre el CSV
 * como Windows-1252 y las tildes del ejemplo salen rotas — precisamente el
 * problema que el lector tiene que resolver al importar.
 */
function descargarPlantilla(): void {
  const contenido = new Blob(['﻿' + PLANTILLA], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(contenido);

  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'plantilla-coco.csv';
  enlace.click();

  URL.revokeObjectURL(url);
}
