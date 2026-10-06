import { Plus, ScanText } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';

import {
  conceptAlreadyUsing,
  cleanKeyword,
  splitKeywords,
  rejectionReason,
} from '@/features/cost-centers/model/keywords';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Chip } from '@/shared/ui/atoms/badge';
import { Field } from '@/shared/ui/atoms/field';
import { FieldAction, Input } from '@/shared/ui/atoms/input';

interface KeywordFieldsProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Para avisar si otra palabra ya está puesta en otro concepto. */
  tree?: readonly Category[];
  /** El concepto que se está editando, para no avisar de sí mismo. */
  conceptId?: Category['id'] | undefined;
  className?: string;
}

/**
 * Las palabras que hacen que un recibo se reconozca solo.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Al adjuntar un soporte, la ficha del movimiento lo lee y rellena el valor,
 * la fecha y el concepto. Lo hace con un catálogo de firmas que salió de 443
 * recibos reales, y por eso sabe reconocer a los acreedores de quien los
 * trajo: el primer recibo de una inmobiliaria que no esté ahí no se reconoce,
 * y hasta hoy la única salida era abrir el código.
 *
 * Aquí se escribe lo que dice ESE recibo —«Comfandi», el NIT— y el siguiente
 * entra clasificado. Lo escrito gana al catálogo: ver `TYPED_TEXT_PRIORITY`.
 *
 * ── Por qué en el concepto y no en una pantalla de reglas ───────────────────
 * Porque el momento en que uno sabe qué palabra reconoce un recibo es el
 * momento en que lo tiene delante, y el sitio donde se dice qué es cada cosa
 * ya existe: Centros de costos. Una pantalla aparte de «reglas de lectura»
 * sería un segundo mapa que mantener de acuerdo con el primero.
 *
 * ── Por qué se escriben y se ven como chips ─────────────────────────────────
 * Porque son una lista corta de cosas cortas. En un campo de texto con comas
 * —que es la otra forma— no se ve dónde acaba una y empieza la otra, y quitar
 * la del medio es editar una cadena a mano.
 */
export function KeywordsFields({
  value,
  onChange,
  tree,
  conceptId,
  className,
}: KeywordFieldsProps) {
  const { draft, setDraft, notice, setNotice, add, onKeyDown, remove } = useKeywordInput(
    value,
    onChange,
  );

  const inOtherConcept = value
    .map((keyword) => ({ keyword, other: conceptAlreadyUsing(tree ?? [], keyword, conceptId) }))
    .find((par) => par.other !== undefined);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Field
        label={t('centers.keywords.label')}
        id="concepto-palabras-clave"
        description={t('centers.keywords.help')}
      >
        <Input
          id="concepto-palabras-clave"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (notice) setNotice(null);
          }}
          onKeyDown={onKeyDown}
          // Lo tecleado y no confirmado entra igual al salir del campo: si no,
          // escribir la palabra y pulsar «Guardar» la pierde en silencio, y
          // nadie relee una lista para comprobar que está lo que acaba de
          // escribir.
          onBlur={add}
          placeholder={t('centers.keywords.placeholder')}
          icon={ScanText}
          actions={[<AddKeywordButton key="añadir" draft={draft} onClick={add} />]}
        />
      </Field>

      {value.length > 0 && <KeywordChips value={value} onRemove={remove} />}

      {/*
        Los dos avisos, en gris y no en rojo.

        Ninguno es un error: uno dice que una palabra no entró y por qué, y el
        otro que ya está puesta en otro concepto —que se puede hacer, y a veces
        es lo que se quiere—. El rojo es para lo que salió mal.
      */}
      {notice && <p className="text-xs leading-relaxed text-muted-foreground">{notice}</p>}

      {!notice && inOtherConcept?.other && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('centers.keywords.sharedMiddle', { word: inOtherConcept.keyword })}
          <strong className="font-medium text-foreground">{inOtherConcept.other.name}</strong>
          {t('centers.keywords.sharedAfter')}
        </p>
      )}
    </div>
  );
}

function KeywordChips({
  value,
  onRemove,
}: {
  value: string[];
  onRemove: (keyword: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {value.map((keyword) => (
        <li key={keyword}>
          {/* El nombre no abre nada: solo se quita. Por eso va sin
              `onClick`, y el chip lo pinta como texto en vez de como un
              botón que no haría nada. */}
          <Chip
            onRemove={() => onRemove(keyword)}
            removeLabel={t('centers.keywords.remove', { word: keyword })}
            className="max-w-full"
          >
            {keyword}
          </Chip>
        </li>
      ))}
    </ul>
  );
}

/** Lo que se está escribiendo, el aviso de lo que no entró y los gestos que añaden y quitan. */
function useKeywordInput(value: string[], onChange: (next: string[]) => void) {
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Añade lo que haya escrito. Devuelve lo que no pudo entrar, para dejarlo en
   * la caja: borrar lo que alguien acaba de teclear sin decir por qué es la
   * forma más rápida de que deje de escribir.
   */
  function add(): void {
    const candidates = splitKeywords(draft);
    if (candidates.length === 0) {
      setDraft('');
      return;
    }

    const current = [...value];
    const rejected: string[] = [];
    let firstNotice: string | null = null;

    for (const candidate of candidates) {
      const problem = rejectionReason(candidate, current);
      if (problem) {
        firstNotice ??= problem;
        rejected.push(candidate);
        continue;
      }
      current.push(cleanKeyword(candidate));
    }

    if (current.length !== value.length) onChange(current);
    setDraft(rejected.join(', '));
    setNotice(firstNotice);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    /*
      Enter añade, y NO envía el formulario.

      Sin el `preventDefault`, teclear una palabra y pulsar Enter —que es el
      gesto con el que se escribe una lista— guardaba el concepto con la
      palabra a medio escribir y cerraba la ficha.
    */
    if (event.key === 'Enter') {
      event.preventDefault();
      add();
      return;
    }

    // Retroceso con la caja vacía quita la última: es como se corrige una
    // lista de chips en cualquier parte, y ahorra apuntar a un aspa de 16px.
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
      setNotice(null);
    }
  }

  function remove(keyword: string): void {
    onChange(value.filter((kept) => kept !== keyword));
    setNotice(null);
  }

  return { draft, setDraft, notice, setNotice, add, onKeyDown, remove };
}

function AddKeywordButton({ draft, onClick }: { draft: string; onClick: () => void }) {
  return (
    // Enter ya lo hace, pero en un teléfono el teclado no siempre enseña un
    // Enter y este es el único sitio donde se ve que la caja no guarda una
    // frase sino una lista.
    <FieldAction
      Icon={Plus}
      label={t('centers.keywords.add')}
      hint={t('centers.keywords.addHint')}
      onClick={onClick}
      disabled={cleanKeyword(draft) === ''}
    />
  );
}
