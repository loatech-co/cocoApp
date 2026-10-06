import type { ComponentProps } from 'react';

import { t } from '@/shared/lib/i18n';
import { Field } from '@/shared/ui/atoms/field';
import { Textarea } from '@/shared/ui/atoms/textarea';
import { CampoDeDinero } from '@/shared/ui/molecules/campo-de-dinero';

import { MovementClassification } from './movement-classification';
import { LoQueLei, NoSePudoLeer } from './reading-notices';
import { SelectorDeFecha } from './selector-de-fecha';

/**
 * La columna de los campos, cuando la ficha se puede tocar.
 *
 * El orden es el de la pregunta: de qué centro, de qué categoría, qué
 * concepto. Y después cuánto y cuándo, que son los dos datos que se copian del
 * papel. Sin rótulo de sección: tres campos con su nombre encima no necesitan
 * que alguien anuncie que son tres campos.
 */
export function MovementFields(props: ComponentProps<typeof MovementClassification>) {
  const { ficha } = props;

  return (
    <div className="flex flex-col gap-3">
      {/*
        El aviso de lo que se leyó, DENTRO de la columna de campos.

        Estaba encima de la rejilla, a todo el ancho, y lo que dice —«verifica
        esto antes de guardar»— no tiene nada que ver con el recibo de la
        izquierda: habla de los campos de la derecha, que son los que se
        rellenaron solos. Encabezando su columna, es el rótulo de lo que hay
        debajo; cruzando la ficha entera, era un cartel.
      */}
      {ficha.lectura && <LoQueLei />}
      {ficha.sinLeer && <NoSePudoLeer texto={ficha.sinLeer} />}

      <MovementClassification {...props} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('transactions.fields.amount')} id="mov-valor">
          {/* Agrupa los miles al escribir y conserva el cursor. El porqué largo
              está en el componente. */}
          <CampoDeDinero
            id="mov-valor"
            valor={ficha.amount}
            onCambiar={ficha.setAmount}
            placeholder="0"
            required
          />
        </Field>

        <Field label={t('transactions.fields.date')} id="mov-fecha">
          <SelectorDeFecha id="mov-fecha" valor={ficha.date} onElegir={ficha.setDate} requerido />
        </Field>
      </div>

      {/*
        Las notas, dentro de la columna de campos y pegadas a los demás.

        Estaban debajo de la rejilla y a todo el ancho: un recuadro de mil
        píxeles para tres renglones que casi nunca se escriben. Y sin `mt-auto`:
        una nota sobre este movimiento es un campo más de los que se rellenan
        al registrarlo, y va donde va el siguiente, no donde sobra sitio.
      */}
      <Field label={t('transactions.fields.notes')} id="mov-notas">
        {/* Sin marcador. Decía «Opcional», que no es un ejemplo de lo que va
            ahí sino una nota sobre la validación: este campo no lleva
            `required`, y eso ya se sabe porque el formulario se envía sin él. */}
        <Textarea
          id="mov-notas"
          value={ficha.notes}
          onChange={(e) => ficha.setNotes(e.target.value)}
          rows={3}
        />
      </Field>
    </div>
  );
}
