import type { ReactNode } from 'react';

import type { CandidatoDelRecibo } from '@/features/transactions/model/movement-form';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { CreateOption, Opcion } from '@/shared/ui/organisms/combo';
import { rutaLegible, type EntradaDelIndice } from '@coco/lectura';

/** El paso de elegir en qué categoría va el concepto que se va a crear. */
export function CategoriaParaNuevo({
  nombreNuevo,
  categorias,
  onVolver,
  onCrearEn,
}: {
  nombreNuevo: string;
  categorias: EntradaDelIndice[];
  onVolver: () => void;
  onCrearEn: (categoria: EntradaDelIndice) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">¿En qué categoría va «{nombreNuevo}»?</span>
        <TextButton tono="realce" onClick={onVolver}>
          Volver
        </TextButton>
      </div>
      <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Categorías">
        {categorias.map((c) => (
          <li key={String(c.id)}>
            <Opcion elegida={false} onClick={() => onCrearEn(c)}>
              <Fila entrada={c} />
            </Opcion>
          </li>
        ))}
        {categorias.length === 0 && (
          <li className="px-2.5 py-2 text-sm text-muted-foreground">Ninguna categoría coincide.</li>
        )}
      </ul>
    </>
  );
}

export interface PropsDeResultados {
  busca: string;
  resultados: EntradaDelIndice[];
  recientes: EntradaDelIndice[];
  candidatos: readonly CandidatoDelRecibo[];
  elegida: EntradaDelIndice | undefined;
  puedeCrear: boolean;
  creando: boolean;
  onElegir: (e: EntradaDelIndice | undefined) => void;
  onElegirCandidato: (c: CandidatoDelRecibo) => void;
  onPedirCategoria: () => void;
}

/** Lo que se ofrece al buscar: lo del recibo, lo reciente o lo que coincide, y crear. */
export function ResultadosDelBuscador(props: PropsDeResultados) {
  const { busca, resultados, elegida, puedeCrear, onElegir } = props;
  const buscando = busca.trim() !== '';

  return (
    <>
      <ul className="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Resultados">
        {elegida && (
          <li>
            <Opcion elegida={false} onClick={() => onElegir(undefined)}>
              <span className="text-muted-foreground">Quitar</span>
            </Opcion>
          </li>
        )}

        {!buscando && <SinBuscar {...props} />}

        {buscando &&
          resultados.map((r) => (
            <li key={String(r.id)}>
              <Opcion elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
                <Fila entrada={r} />
              </Opcion>
            </li>
          ))}

        {buscando && resultados.length === 0 && !puedeCrear && (
          <li className="px-2.5 py-2 text-sm text-muted-foreground">Nada coincide.</li>
        )}
      </ul>

      {buscando && puedeCrear && (
        <CrearConcepto
          busca={busca}
          creando={props.creando}
          sinResultados={resultados.length === 0}
          onPedirCategoria={props.onPedirCategoria}
        />
      )}
    </>
  );
}

/** Con la caja en blanco: lo que dejó el recibo, o lo usado últimamente. */
function SinBuscar({
  candidatos,
  recientes,
  elegida,
  onElegir,
  onElegirCandidato,
}: PropsDeResultados) {
  return (
    <>
      {candidatos.length > 0 && (
        <>
          <Titulo>Del recibo</Titulo>
          {candidatos.map((c) => (
            <li key={c.id}>
              <Opcion
                elegida={elegida !== undefined && String(elegida.id) === String(c.id)}
                onClick={() => onElegirCandidato(c)}
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{c.nombre}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.ruta}</span>
                </span>
              </Opcion>
            </li>
          ))}
        </>
      )}

      {candidatos.length === 0 && recientes.length > 0 && (
        <>
          <Titulo>Recientes</Titulo>
          {recientes.map((r) => (
            <li key={String(r.id)}>
              <Opcion elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
                <Fila entrada={r} />
              </Opcion>
            </li>
          ))}
        </>
      )}

      {candidatos.length === 0 && recientes.length === 0 && !elegida && (
        <li className="px-2.5 py-2 text-sm text-muted-foreground">Escribe para buscar.</li>
      )}
    </>
  );
}

function CrearConcepto({
  busca,
  creando,
  sinResultados,
  onPedirCategoria,
}: {
  busca: string;
  creando: boolean;
  sinResultados: boolean;
  onPedirCategoria: () => void;
}) {
  return (
    <CreateOption creando={creando} conIntro={sinResultados} onCrear={onPedirCategoria}>
      Crear concepto «{busca.trim()}»
    </CreateOption>
  );
}

/** Nombre y camino. Una categoría se marca para que no se confunda con un concepto. */
function Fila({ entrada }: { entrada: EntradaDelIndice }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{entrada.nombre}</span>
      {entrada.ruta.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{rutaLegible(entrada)}</span>
      )}
      {entrada.nivel === 'categoria' && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">categoría</span>
      )}
    </span>
  );
}

function Titulo({ children }: { children: ReactNode }) {
  return <li className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">{children}</li>;
}
