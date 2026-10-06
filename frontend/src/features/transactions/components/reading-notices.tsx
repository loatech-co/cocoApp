import { Sparkles, TriangleAlert } from 'lucide-react';

import { t } from '@/shared/lib/i18n';

/**
 * Lo que el soporte NO dijo.
 *
 * Mismo sitio y misma forma que `LoQueLei` —es la otra respuesta a la misma
 * pregunta— y el tono de lo pendiente, no el del error: no se rompió nada, hay
 * trabajo que hacer a mano.
 */
export function CouldNotRead({ text }: { text: string }) {
  return (
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

/**
 * El aviso de que hay datos leídos por la máquina.
 *
 * ── Por qué el acento y no el ámbar ─────────────────────────────────────────
 * Porque no ha pasado nada malo. El ámbar de esta app está para lo que está
 * PENDIENTE —un pago que vence, un movimiento sin clasificar— y un naranja
 * intenso encima de un formulario que acaba de rellenarse solo se lee como un
 * error, cuando lo que hubo fue un acierto. El acento llama sin alarmar.
 *
 * ── La única cosa quieta que usa `accent` ───────────────────────────────────
 * En el resto de la app `accent` es la superficie de lo que RESPONDE: la
 * opción bajo el cursor, la fila señalada, el botón encendido. Este aviso no
 * responde a nada y aun así lo usa, a propósito: es lo más parecido que tiene
 * este tema a un realce que llame sin alarmar, y ponerlo en `info` —que es lo
 * que le tocaría por tono— lo dejaría igual que cualquier otra nota, cuando
 * este es el único sitio donde la aplicación pide que se revise lo que ella
 * misma acaba de escribir.
 *
 * Con el token, el contraste lo garantiza el tema: verde muy claro sobre casi
 * blanco, verde muy oscuro con letra menta sobre casi negro.
 *
 * ── Por qué una sola frase ──────────────────────────────────────────────────
 * Porque el detalle de por qué se clasificó así no cambia lo que hay que
 * hacer, que es mirar los campos. Contarlo entero ocupaba tres renglones y
 * empujaba hacia abajo justo lo que se pedía revisar.
 */
export function WhatWasRead() {
  return (
    /*
      ── `min-h-16`: la mitad más alto ─────────────────────────────────────────
      Medía lo que su renglón y su relleno, 44px, y con eso era una tira que la
      vista se salta para ir a los campos. Es lo primero que hay que leer de
      esta columna —dice que lo de abajo lo escribió una máquina y hay que
      comprobarlo—, así que tiene que pesar como algo y no como un borde.

      Y es un MÍNIMO y no un relleno mayor porque en una columna de la mitad de
      ancho la frase cae en dos renglones, y dos renglones con el relleno de
      arriba y abajo miden exactamente estos 64: el aviso se ve igual quepa la
      frase de una o de dos, en vez de dar un salto al cambiar el ancho.
    */
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground">
      <Sparkles className="size-4 shrink-0" aria-hidden="true" />
      {t('transactions.reading.verifyNotice')}
    </p>
  );
}
