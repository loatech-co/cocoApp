import { useId, type ReactNode } from 'react';

import type { CandidatoDelRecibo } from '@/features/transactions/model/movement-form';
import { t } from '@/shared/lib/i18n';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { CreateOption, Opcion } from '@/shared/ui/organisms/combo';
import { readablePath, type IndexEntry } from '@coco/receipt-parser';

/** El paso de elegir en qué categoría va el concepto que se va a crear. */
export function CategoriaParaNuevo({
  nombreNuevo,
  categorias,
  onVolver,
  onCrearEn,
}: {
  nombreNuevo: string;
  categorias: IndexEntry[];
  onVolver: () => void;
  onCrearEn: (categoria: IndexEntry) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3 pt-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {t('transactions.conceptSearch.whichCategory', { name: nombreNuevo })}
        </span>
        <TextButton tono="realce" onClick={onVolver}>
          {t('transactions.conceptSearch.back')}
        </TextButton>
      </div>
      {categorias.length === 0 ? (
        <Vacio>{t('transactions.conceptSearch.noCategory')}</Vacio>
      ) : (
        <div
          className={LISTA}
          role="listbox"
          aria-label={t('transactions.conceptSearch.categories')}
        >
          {categorias.map((c) => (
            <Opcion key={String(c.id)} elegida={false} onClick={() => onCrearEn(c)}>
              <Fila entrada={c} />
            </Opcion>
          ))}
        </div>
      )}
    </>
  );
}

export interface PropsDeResultados {
  busca: string;
  resultados: IndexEntry[];
  recientes: IndexEntry[];
  candidatos: readonly CandidatoDelRecibo[];
  elegida: IndexEntry | undefined;
  puedeCrear: boolean;
  creando: boolean;
  onElegir: (e: IndexEntry | undefined) => void;
  onElegirCandidato: (c: CandidatoDelRecibo) => void;
  onPedirCategoria: () => void;
}

/** Lo que se ofrece al buscar: lo del recibo, lo reciente o lo que coincide, y crear. */
export function ResultadosDelBuscador(props: PropsDeResultados) {
  const { busca, resultados, elegida, puedeCrear, onElegir } = props;
  const buscando = busca.trim() !== '';

  return (
    <>
      {hayOpciones(props) ? (
        <div className={LISTA} role="listbox" aria-label={t('transactions.conceptSearch.results')}>
          {elegida && (
            <Opcion elegida={false} onClick={() => onElegir(undefined)}>
              <span className="text-muted-foreground">
                {t('transactions.conceptSearch.remove')}
              </span>
            </Opcion>
          )}

          {!buscando && <SinBuscar {...props} />}

          {buscando &&
            resultados.map((r) => (
              <Opcion key={String(r.id)} elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
                <Fila entrada={r} />
              </Opcion>
            ))}
        </div>
      ) : (
        !(buscando && puedeCrear) && (
          <Vacio>
            {buscando
              ? t('transactions.conceptSearch.nothingMatches')
              : t('transactions.conceptSearch.typeToSearch')}
          </Vacio>
        )
      )}

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
        <Grupo titulo={t('transactions.conceptSearch.fromReceipt')}>
          {candidatos.map((c) => (
            <Opcion
              key={c.id}
              elegida={elegida !== undefined && String(elegida.id) === String(c.id)}
              onClick={() => onElegirCandidato(c)}
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate">{c.nombre}</span>
                <span className="truncate text-xs text-muted-foreground">{c.ruta}</span>
              </span>
            </Opcion>
          ))}
        </Grupo>
      )}

      {candidatos.length === 0 && recientes.length > 0 && (
        <Grupo titulo={t('transactions.conceptSearch.recent')}>
          {recientes.map((r) => (
            <Opcion key={String(r.id)} elegida={elegida?.id === r.id} onClick={() => onElegir(r)}>
              <Fila entrada={r} />
            </Opcion>
          ))}
        </Grupo>
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
      {t('transactions.conceptSearch.createConcept', { name: busca.trim() })}
    </CreateOption>
  );
}

/** Nombre y camino. Una categoría se marca para que no se confunda con un concepto. */
function Fila({ entrada }: { entrada: IndexEntry }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{entrada.name}</span>
      {entrada.path.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{readablePath(entrada)}</span>
      )}
      {entrada.level === 'categoria' && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {t('transactions.conceptSearch.category')}
        </span>
      )}
    </span>
  );
}

/*
  ── La forma de la lista: opciones, y nada más ────────────────────────────────
  Una `listbox` solo puede contener opciones o grupos de opciones. Eran un
  `<ul>` con cada opción dentro de un `<li>` —un lector de pantalla encontraba
  «elemento de lista» entre la lista y la opción—, y con los rótulos y el
  «Nada coincide» como filas más. Ahora las opciones cuelgan directamente de
  la lista, los rótulos dan nombre a un `group`, y lo vacío se dice FUERA de la
  lista, que entonces no se pinta: una lista sin opciones no es una lista.
*/
const LISTA = 'max-h-64 overflow-y-auto p-1';

/** Hay algo que ofrecer en la lista de resultados. */
function hayOpciones({
  busca,
  resultados,
  recientes,
  candidatos,
  elegida,
}: PropsDeResultados): boolean {
  if (elegida) return true;
  if (busca.trim() !== '') return resultados.length > 0;
  return candidatos.length > 0 || recientes.length > 0;
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <div id={id} className="px-2.5 pb-1 pt-2 text-xs text-muted-foreground">
        {titulo}
      </div>
      {children}
    </div>
  );
}

function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-3.5 py-3 text-sm text-muted-foreground">{children}</p>;
}
