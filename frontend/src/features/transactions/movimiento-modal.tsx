import {
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { type ComponentType, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import {
  BotonOscuro,
  LienzoPdf,
  PanelDeSubida,
  PreviaDeArchivo,
  SeparadorDeMandos,
  Soltar,
  Soportes,
} from '@/components/soportes';
import { nombreDelMovimiento, rutaSeleccionada } from '@/lib/movimientos';
import { Etiqueta } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChipIcono, type ColorDeChip } from '@/components/ui/chip-icono';
import { BLOQUE, Bloque } from '@/components/ui/bloque';
import { Campo } from '@/components/ui/campo';
import { CampoDeDinero } from '@/components/ui/campo-de-dinero';
import { Combo } from '@/components/ui/combo';
import { Confirmacion } from '@/components/ui/confirmacion';
import { SelectorDeFecha } from '@/components/selector-de-fecha';
import { CabeceraDeModal, PANEL_DE_MODAL, PieDeModal } from '@/components/ui/modal-partes';
import { Progreso } from '@/components/ui/progreso';
import { REALCE, SUPERFICIE_FLOTANTE } from '@/components/ui/superficie';
import { Textarea } from '@/components/ui/textarea';
import { ApiClientError, apiSubir } from '@/lib/api-client';
import { encogerSoportes } from '@/lib/encoger-soporte';
import { diaLargo, mesLargo } from '@/lib/fechas';
import {
  useActualizarMovimiento,
  useCategories,
  useCrearCategoria,
  useCrearMovimiento,
  useEliminarMovimiento,
} from '@/lib/queries';
import { cn, formatCOP } from '@/lib/utils';
import { useAlCambiar } from '@/lib/al-cambiar';
import { BuscadorDeConcepto, type CandidatoDelRecibo } from '@/components/buscador-de-concepto';
import { useSugerenciaDeCategoria } from '@/features/categorization/use-sugerencia';
import { apiFetch } from '@/lib/api-client';
import { SIN_CLASIFICAR, aplicar, nombreDelOrigen, type Clasificacion, type Origen } from '@/lib/precedencia';
import { useTransactions } from '@/lib/queries';
import { conceptosRecientes } from '@/lib/recientes';
import { Camara } from './camara';
import { leerSoporte, type ProgresoDeLectura } from './leer-soporte';
import { buscarEnArbol, indexarArbol, normalizar, resolverTerminos, terminosPara, type Lectura } from '@coco/lectura';
import type { Category, PagoPendiente, Transaction, TransactionType } from '@coco/types';

/**
 * Lo que dura como mínimo el paso de lectura de un soporte.
 *
 * ── Por qué se espera a propósito ───────────────────────────────────────────
 * Porque la lectura no siempre tarda lo mismo: un PDF con su texto dentro se
 * resuelve en medio segundo y una foto pasa por el OCR y tarda diez. Con la
 * espera atada al trabajo, la misma acción daba dos resultados distintos —un
 * parpadeo o una espera larga— y el parpadeo es el peor de los dos: la banda
 * no alcanza a cruzar el documento, la barra salta de 0 a nada, y lo que se
 * ve es un temblor entre dos pantallas del que no queda claro si se leyó
 * algo. Con un piso, leer un soporte siempre se ve igual.
 *
 * ── Por qué cuatro segundos ─────────────────────────────────────────────────
 * La banda cruza en 1,8s (`barre`, en `index.css`). Cuatro segundos son dos
 * pasadas completas y un respiro: se ve el barrido entero, se ve que vuelve a
 * empezar —que es lo que dice «sigue trabajando»— y da tiempo a leer de qué
 * documento se trata, que es el dato que hace falta si lo que sale no cuadra.
 *
 * Y es un MÍNIMO, no una pausa que se suma: si la lectura tarda más, no se
 * espera nada.
 */
const LECTURA_MINIMA_MS = 4000;

/**
 * El ÚNICO formulario de movimiento: crea y edita.
 *
 * Tener dos —uno para registrar y otro para corregir— garantiza que se
 * separen: se añade un campo en uno y se olvida en el otro, y la persona
 * descubre que solo puede poner notas cuando edita. Un solo componente, dos
 * modos.
 *
 * ── La cascada de tres niveles ──────────────────────────────────────────────
 * Centro de costos → categoría → concepto. Se guarda el CONCEPTO, que es la hoja:
 * los dos de arriba existen para sumar, no para clasificar. Elegir uno de
 * arriba y dejarlo ahí sería un movimiento que no aparece en ningún desglose
 * por concepto.
 */
export function MovimientoModal({
  abierta,
  movimiento,
  pago,
  tipoPorDefecto = 'expense',
  onCerrar,
}: {
  abierta: boolean;
  /** Sin movimiento, el formulario crea. Con movimiento, edita ese. */
  movimiento?: Transaction | null;
  /**
   * El pago pendiente que se viene a confirmar, desde la tarjeta del resumen.
   *
   * ── Por qué es el pago entero y no solo su concepto ─────────────────────
   * Porque un pago pendiente ya trae dicho casi todo el movimiento: de qué
   * concepto es, cuándo vencía y cuánto suele costar. Pasando solo el
   * concepto, las otras dos cosas había que teclearlas mirando la misma
   * tarjeta que se acababa de pulsar.
   *
   * ── Y por qué eso cambia la ficha entera ────────────────────────────────
   * Confirmar un pago no es registrar un gasto desde cero: no hay que decidir
   * CÓMO empezar —el concepto ya está, lo que falta es el papel— así que se
   * abre directamente en el formulario, con los campos puestos y la columna
   * del soporte esperando. Lo que hay escrito es lo ESPERADO, y el soporte lo
   * corrige: ver `onAñadir` en la columna de soportes.
   */
  pago?: PagoPendiente | null;
  /** Con qué tipo abrir al CREAR. Lo elige el menú de "Nuevo movimiento". */
  tipoPorDefecto?: TransactionType;
  onCerrar: () => void;
}) {
  const categorias = useCategories();
  const crear = useCrearMovimiento();
  const actualizar = useActualizarMovimiento();
  const eliminar = useEliminarMovimiento();
  const crearCategoria = useCrearCategoria();

  const editando = Boolean(movimiento);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(hoyEnBogota());
  const [type, setType] = useState<TransactionType>('expense');
  /*
    ── La clasificación lleva escrito de dónde salió ───────────────────────
    No es un id suelto: es un id y una fuente —a mano, el historial, las
    palabras clave, el diccionario—. Toda propuesta pasa por `aplicar()`, que
    es la única que sabe quién puede reemplazar a quién: lo elegido a mano no
    lo toca nada automático, y una fuente inferior nunca pisa a una superior.
    Ver `lib/precedencia.ts`.

    Un solo objeto y actualizaciones funcionales, a propósito: las propuestas
    llegan por caminos asíncronos —la lectura de un recibo, una petición— y
    comparar contra un `categoryId` capturado en un render viejo es cómo una
    sugerencia tardía pisa lo que la persona acaba de elegir.
  */
  const [clasificacion, setClasificacion] = useState<Clasificacion>(SIN_CLASIFICAR);
  const categoryId = clasificacion.categoryId;
  const proponer = (propuesta: { categoryId: number | undefined; origen: Origen }): void =>
    setClasificacion((previa) => aplicar(previa, propuesta));
  /**
   * Si en esta apertura alguna fuente automática propuso algo. Es lo que
   * decide si al guardar se aprende: solo cuando hubo una sugerencia que la
   * persona aceptó o corrigió, nunca de un movimiento clasificado a mano sin
   * que nadie hubiera dicho nada.
   */
  const [huboSugerencia, setHuboSugerencia] = useState(false);
  /** Lo que la lectura de un recibo dejó entre lo que dudar. */
  const [candidatosDelRecibo, setCandidatosDelRecibo] = useState<CandidatoDelRecibo[]>([]);
  /**
   * La cascada de siempre, detrás de un enlace. Sigue existiendo para quien
   * quiera ir nivel a nivel, pero ya no es la puerta: la puerta es el buscador.
   */
  const [cascadaVisible, setCascadaVisible] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  /*
    ── Se abre para LEER, no para editar ────────────────────────────────────
    Abrir un movimiento es casi siempre consultarlo: ver cuánto fue, cuándo se
    pagó, mirar el recibo. Con todo editable desde el primer instante, cada
    una de esas consultas es una ocasión de cambiar algo sin querer —un clic
    en un desplegable, una tecla en el campo del valor— y de esos accidentes
    no queda rastro.

    Crear es lo contrario: no hay nada que leer, así que nace editable.
  */
  const [editable, setEditable] = useState(false);

  /*
    ── Crear un movimiento empieza por decidir CÓMO ────────────────────────
    Con un recibo en la mano, teclear el valor y la fecha es copiar a mano lo
    que está escrito en el papel. Sin recibo, esperar a tener uno para
    registrar un gasto es perder el gasto.

    Son dos caminos de verdad distintos —uno empieza por el documento, el otro
    por los datos— y preguntarlo de entrada cuesta un clic y ahorra el
    formulario entero en el caso más común.
  */
  const [paso, setPaso] = useState<'elegir' | 'camara' | 'leyendo' | 'formulario'>('formulario');
  /**
   * El panel de subir, abierto SOBRE la ficha.
   *
   * Es el mismo que abre la baldosa de la galería de un movimiento ya
   * guardado: subir un archivo se hace igual venga de donde venga, y no es
   * una etapa del formulario sino algo que se hace en medio y se cierra.
   */
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [progresoDeLectura, setProgresoDeLectura] = useState<ProgresoDeLectura | null>(null);
  const [lectura, setLectura] = useState<Lectura | null>(null);
  /**
   * Lo que NO se pudo leer, para decirlo.
   *
   * Es un estado aparte del error porque no es un error: el archivo se abrió,
   * se miró y no se reconoció nada dentro. Un rojo ahí diría que algo salió
   * mal, y lo que hay que hacer es distinto —escribir los datos a mano—.
   */
  const [sinLeer, setSinLeer] = useState<string | null>(null);
  /*
    Los soportes elegidos antes de que el movimiento exista.

    Un soporte cuelga de un movimiento, y al crear todavía no hay de qué
    colgarlo. Se quedan aquí y se suben justo después de guardar: el orden
    inverso —crear el movimiento para poder adjuntar— obligaría a guardar algo
    a medias solo para tener un identificador.
  */
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  /**
   * El movimiento que se acaba de crear, cuando su soporte se quedó sin subir.
   *
   * Es lo que impide que reintentar cree un segundo movimiento por la misma
   * plata. Ver el porqué largo en `onSubmit`.
   */
  const [registrado, setRegistrado] = useState<number | null>(null);
  /*
    Sube cada vez que se cancela una edición.

    Está en las dependencias del efecto que llena los campos, así que
    cancelar los devuelve a lo que hay GUARDADO. Sin esto, "Cancelar" solo
    apagaba el modo de edición y dejaba en pantalla lo que se había escrito:
    la ficha decía una cosa y la base otra, y el siguiente que pulsara el
    lápiz guardaba sin querer un cambio que alguien ya había descartado.
  */
  const [descartes, setDescartes] = useState(0);

  // Cada vez que se abre se recarga desde el movimiento: sin esto, abrir para
  // editar el segundo movimiento mostraría los datos del primero.
  //
  // Durante el render y no en un efecto —ver `useAlCambiar`—: así la ficha
  // sale pintada ya con los datos buenos, sin un fotograma con los del
  // movimiento anterior. Son quince estados; en dos tandas se notaba.
  useAlCambiar([abierta, movimiento, pago, tipoPorDefecto, descartes], () => {
    if (!abierta) return;
    setDescription(movimiento?.description ?? '');
    /*
      Confirmando un pago, el valor y la fecha nacen puestos.

      Son lo ESPERADO: el promedio de los meses que sí se pagaron y el día en
      que vencía. No son el dato bueno —el dato bueno lo dice el recibo— pero
      son mucho mejor que una caja vacía, y el gesto que los corrige es
      adjuntar el soporte, que es a lo que se viene.

      Un valor esperado que nadie corrige se registra como si fuera el real, y
      por eso la cabecera lo dice con todas las letras en vez de dejar que
      parezca un dato.
    */
    /*
      ── Lo que se cubre a pedazos entra VACÍO, y con la fecha de hoy ────────
      Un concepto normal se confirma: lo que se espera que cueste es lo que va
      a costar, y traerlo escrito ahorra el paso. Uno que se paga en varias
      veces no se confirma, se ABONA: lo que trae la cabeza de quien abre esta
      ficha es lo que acaba de gastar en el supermercado, y el total del mes no
      tiene nada que ver con eso.

      Poner ahí 1.200.000 —el presupuesto entero— sería la peor sugerencia
      posible: al primer «guardar» sin mirar, el mes queda cubierto de golpe y
      el concepto sale de la lista como si ya estuviera resuelto.

      Y la fecha es HOY y no el vencimiento, por lo mismo: la ida al mercado
      fue hoy. El día 1 es cuándo empieza a contar el ciclo, no cuándo se gastó
      esto.
    */
    const abonandoAUnConcepto = pago?.varios_pagos === true;

    setAmount(
      movimiento
        ? String(Number(movimiento.amount))
        : !abonandoAUnConcepto && pago?.expected_amount != null
          ? String(Number(pago.expected_amount))
          : '',
    );
    setDate(
      movimiento?.date ?? (abonandoAUnConcepto ? hoyEnBogota() : (pago?.due_date ?? hoyEnBogota())),
    );
    setType(movimiento?.type ?? tipoPorDefecto);
    // Lo que llega puesto —el concepto de un movimiento que se edita, el de un
    // pago pendiente que se confirma— es una elección: lo automático no lo toca.
    const puesto = movimiento?.category_id ?? pago?.category_id;
    setClasificacion(puesto === undefined ? SIN_CLASIFICAR : { categoryId: puesto, origen: 'manual' });
    setHuboSugerencia(false);
    setCandidatosDelRecibo([]);
    setCascadaVisible(false);
    setNotes(movimiento?.notes ?? '');
    setError(null);
    setConfirmandoBorrado(false);
    setEditable(!movimiento);
    /*
      Confirmar un pago se salta el «cómo empezar».

      Esa pantalla existe para decidir si se parte del papel o de los datos, y
      aquí esa pregunta ya no está abierta: el concepto se sabe, el valor y la
      fecha están puestos, y lo único que falta es el soporte —que se adjunta
      en la columna de al lado, sin cambiar de pantalla—.
    */
    setPaso(movimiento || pago ? 'formulario' : 'elegir');
    setLectura(null);
    setSinLeer(null);
    setPendientes([]);
    setProgresoDeLectura(null);
    setRegistrado(null);
    // El foco solo cuando hay algo que escribir: puesto en un campo de solo
    // lectura, el cursor parpadea en un sitio donde no se puede escribir.
  });

  /*
    ── La recurrencia NO se edita aquí ─────────────────────────────────────
    Es del CONCEPTO, no del movimiento, y su sitio es Centros de costos. En un
    centro estático, además, la clasificación entera vive allá; y en uno
    dinámico un concepto nunca es recurrente —lo que se improvisa no vuelve
    solo cada mes—.

    Editable desde aquí, un formulario que uno abre para corregir una cifra
    podía cambiar de paso cada cuánto vuelve un pago, y eso reaparece semanas
    después en la tarjeta de pagos pendientes sin que nadie recuerde haberlo
    tocado.
  */

  /*
    ── Las fuentes automáticas ─────────────────────────────────────────────
    Tres, y las tres pasan por `proponer`, que aplica la precedencia:

    · El HISTORIAL, que vive en el servidor: `/categorization/suggest` con lo
      que se está escribiendo (con espera entre teclas; ver el hook).
    · Las PALABRAS CLAVE y los nombres de la persona: lo escrito se busca en su
      árbol; si lleva a un solo concepto, se propone.
    · El DICCIONARIO del sistema: si lo escrito nombra un comercio conocido,
      sus términos se buscan en el árbol. A un concepto, se propone; a una
      categoría o a varios conceptos, se propone la categoría y los candidatos
      quedan a la vista en el buscador.

    Solo con la ficha en el formulario y editable: proponer sobre una ficha de
    solo lectura sería cambiarle la clasificación a un movimiento guardado.
  */
  const indiceDelArbol = useMemo(() => indexarArbol(categorias.data ?? []), [categorias.data]);
  const proponiendo = abierta && paso === 'formulario' && editable;

  const sugerenciaDelHistorial = useSugerenciaDeCategoria(proponiendo ? description : '');
  useAlCambiar([sugerenciaDelHistorial?.category_id], () => {
    // Solo con un id de verdad: una respuesta con otra forma no puede vaciar
    // lo que otra fuente ya había puesto.
    if (typeof sugerenciaDelHistorial?.category_id !== 'number') return;
    setHuboSugerencia(true);
    proponer({ categoryId: sugerenciaDelHistorial.category_id, origen: 'historial' });
  });

  const propuestaLocal = useMemo(() => {
    const escrito = description.trim();
    if (!proponiendo || escrito.length < 3) return null;

    const conceptos = buscarEnArbol(indiceDelArbol, escrito).filter((e) => e.nivel === 'concepto');
    if (conceptos.length === 1) {
      return { categoryId: Number(conceptos[0].id), origen: 'palabras-clave' as const, candidatos: [] as CandidatoDelRecibo[] };
    }

    const terminos = terminosPara(escrito);
    if (terminos.length === 0) return null;
    const resuelto = resolverTerminos(indiceDelArbol, terminos);
    if (resuelto.certeza === 'alta' && resuelto.concepto) {
      return { categoryId: Number(resuelto.concepto.id), origen: 'diccionario' as const, candidatos: [] as CandidatoDelRecibo[] };
    }
    if (resuelto.certeza === 'media') {
      return {
        categoryId: resuelto.categoria ? Number(resuelto.categoria.id) : undefined,
        origen: 'diccionario' as const,
        candidatos: resuelto.candidatos.map((c) => ({ id: Number(c.id), nombre: c.nombre, ruta: c.ruta.join(' › ') })),
      };
    }
    return null;
  }, [indiceDelArbol, description, proponiendo]);

  useAlCambiar(
    [propuestaLocal?.categoryId, propuestaLocal?.origen, propuestaLocal?.candidatos.map((c) => c.id).join(',')],
    () => {
      if (!propuestaLocal) return;
      setHuboSugerencia(true);
      if (propuestaLocal.categoryId !== undefined) proponer(propuestaLocal);
      if (propuestaLocal.candidatos.length > 0) setCandidatosDelRecibo(propuestaLocal.candidatos);
    },
  );

  // Los conceptos usados últimamente, para el buscador en blanco. Solo al
  // crear: editando, el concepto ya está puesto.
  const movimientosRecientes = useTransactions({ per_page: 40 }, { enabled: abierta && !movimiento });
  const recientes = useMemo(
    () => conceptosRecientes(movimientosRecientes.data?.data ?? [], indiceDelArbol),
    [movimientosRecientes.data, indiceDelArbol],
  );

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  const arbol = categorias.data ?? [];
  const { centro, categoria, concepto } = rutaSeleccionada(arbol, categoryId);

  /**
   * Se vino a confirmar un pago pendiente, no a registrar un gasto cualquiera.
   *
   * Lleva el `!movimiento` dentro a propósito: `pago` sigue puesto mientras la
   * ficha está abierta, y en cuanto se guarda deja de ser un pendiente. Sin
   * eso, la ficha de un movimiento ya existente podría titularse «Confirmar
   * pago» por venir de esa tarjeta.
   */
  const confirmandoUnPago = pago != null && !movimiento;

  /*
    ── Lo que ya está en un centro estático no se mueve ──────────────────────
    Estático es estático: ni desde la tabla ni desde aquí. La estructura de
    los costos fijos se decide una vez, y si de verdad hay que cambiarla, se
    hace dinámico el centro y entonces se mueve —que es un acto deliberado,
    en otra pantalla, y no un desplegable a un clic de distancia—.

    Se mira el centro GUARDADO, no el que esté elegido en el formulario. Con
    el elegido, escoger "Costos fijos" al crear un movimiento bloqueaba los
    dos desplegables de abajo y dejaba el formulario a medias: entrar sí se
    puede, salir es lo que no.
  */
  const centroGuardado = rutaSeleccionada(arbol, movimiento?.category_id ?? undefined).centro;
  const estatico = centroGuardado?.estatico ?? false;

  /** Lo que se puede tocar ahora mismo. */
  const editandoCampos = editable;

  /**
   * Lee el recibo y rellena lo que sepa.
   *
   * Rellena, no decide: lo leído entra en los mismos campos que se escribirían
   * a mano, y la persona confirma con el mismo botón de siempre. Un recibo mal
   * leído que se guarda solo es peor que no leerlo, porque nadie vuelve a
   * mirar lo que ya quedó registrado.
   *
   * ── Por qué se espera aunque ya esté leído ────────────────────────────────
   * Ver `LECTURA_MINIMA_MS`.
   */
  async function escanear(archivo: File): Promise<void> {
    setPaso('leyendo');
    setError(null);
    setPendientes([archivo]);
    const empezo = Date.now();

    try {
      const { lectura: leida, texto } = await leerSoporte(archivo, {
        periodo: date.slice(0, 7),
        // El árbol, por sus palabras clave: es lo que hace que un recibo que
        // el catálogo no conoce se reconozca porque alguien escribió en su
        // concepto lo que dice la factura.
        arbol: categorias.data ?? [],
        onProgreso: setProgresoDeLectura,
      });

      /*
        ── Leer y no sacar nada NO es haber leído ──────────────────────────
        Antes se anunciaba «Los datos se extrajeron del soporte» pasara lo que
        pasara, incluso con los tres campos vacíos: el aviso decía que una
        máquina había rellenado el formulario y el formulario estaba en
        blanco. Quien lo mira no sabe si tiene que comprobar lo que hay o
        escribirlo todo.

        Y hay dos maneras de no sacar nada, que no se arreglan igual:

        · No se pudo sacar TEXTO del archivo —un PDF que no abre, una imagen
          que el reconocimiento no descifra—. Ahí no hay nada que revisar.
        · Se sacó el texto pero no se reconoció ni valor ni fecha ni concepto.
          Ahí el documento sí se leyó; lo que no cuadró es su forma.

        En los dos casos el archivo se queda adjunto: se subió para guardarlo,
        no solo para leerlo.
      */
      const algoUtil = leida.valor !== null || leida.fecha !== null || leida.concepto !== null;
      setLectura(algoUtil ? leida : null);
      setSinLeer(
        algoUtil
          ? null
          : texto.trim() === ''
            ? 'No se pudo extraer el texto de este archivo. Escribe los datos a mano; el archivo queda adjunto al movimiento.'
            : 'Se leyó el archivo, pero no se reconoció el valor ni la fecha. Escríbelos a mano; el archivo queda adjunto al movimiento.',
      );

      if (leida.valor !== null) setAmount(String(leida.valor));
      if (leida.fecha) setDate(leida.fecha);
      if (leida.concepto) setDescription(leida.concepto);

      /*
        Lo que el recibo dice de la clasificación, por su fuente y su certeza.

        Con ids cuando los hay —`enElArbol`—: alta propone el concepto; media
        propone la categoría, si la hay, y deja los candidatos a la vista en el
        buscador para que la persona elija. Nunca se adivina entre varios.

        Y pasa por `proponer`: las palabras clave de la persona y el catálogo
        van con rango de palabras clave; el diccionario, con el suyo. Si ya
        había algo elegido a mano, aquí no se toca nada.
      */
      const enElArbol = leida.enElArbol;
      if (enElArbol) {
        const origen: Origen = enElArbol.fuente === 'diccionario' ? 'diccionario' : 'palabras-clave';
        setHuboSugerencia(true);
        if (enElArbol.certeza === 'alta' && enElArbol.conceptoId !== undefined) {
          proponer({ categoryId: Number(enElArbol.conceptoId), origen });
        } else if (enElArbol.certeza === 'media') {
          if (enElArbol.categoriaId !== undefined) proponer({ categoryId: Number(enElArbol.categoriaId), origen });
          setCandidatosDelRecibo(
            enElArbol.candidatos.map((c) => ({ id: Number(c.id), nombre: c.nombre, ruta: c.ruta })),
          );
        }
      } else if (leida.concepto) {
        // Sin ids —un árbol que no llegó—, por el nombre, como siempre.
        const suyo = conceptoLlamado(categorias.data ?? [], leida.concepto);
        if (suyo) {
          setHuboSugerencia(true);
          proponer({ categoryId: suyo.id, origen: 'palabras-clave' });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer ese archivo.');
    } finally {
      // El piso de la espera, salga bien o mal. También cuando falla: un
      // mensaje de error que aparece de un fogonazo se lee como un fallo de
      // la ficha y no como el resultado de haber intentado leer el archivo.
      const falta = LECTURA_MINIMA_MS - (Date.now() - empezo);
      if (falta > 0) {
        await new Promise<void>((sigue) => {
          setTimeout(sigue, falta);
        });
      }

      setProgresoDeLectura(null);
      setPaso('formulario');
    }
  }

  /**
   * Crea una categoría o un concepto dentro de lo que ya está elegido, y lo elige.
   *
   * ── Por qué aquí y no en Centros de costos ──────────────────────────────
   * Porque el momento en que uno descubre que algo no existe es exactamente
   * el momento en que lo está buscando. Mandarlo a otra pantalla —y a volver,
   * y a buscar otra vez— es donde se abandona la tarea y el movimiento acaba
   * sin clasificar.
   *
   * ── Por qué no vale para los centros de costos ──────────────────────────
   * Porque un centro es la estructura de arriba y se define tres veces en la
   * vida de una cuenta. Poder inventar uno al vuelo mientras se registra un
   * gasto es como acaban las cuentas con "Casa", "casa" y "Hogar" siendo lo
   * mismo. Su combo no ofrece crear, y esto no se llama desde ahí.
   */
  async function crearDentro(nombre: string, padreId: number | undefined): Promise<void> {
    if (nombre.trim() === '' || padreId === undefined) return;
    setError(null);

    try {
      const nuevo = await crearCategoria.mutateAsync({
        name: nombre.trim(),
        kind: 'expense',
        parent_id: padreId,
      });
      proponer({ categoryId: nuevo.id, origen: 'manual' });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'No se pudo crear.');
    }
  }

  async function onSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    const cuerpo = {
      date,
      amount: amount.replace(',', '.'),
      type,
      description: description.trim() || null,
      // El comercio sigue a la descripción: es lo que alimenta la
      // categorización automática de futuras importaciones.
      merchant: description.trim() || null,
      notes: notes.trim() || null,
      category_id: categoryId ?? null,
    };

    /*
      ── Guardar son DOS peticiones, y o entran las dos o no entra ninguna ───
      Primero se crea el movimiento y después se suben sus soportes, porque un
      soporte cuelga de un movimiento y hasta que no existe no hay de qué
      colgarlo. Esa segunda petición puede fallar sola: el servidor se queda
      sin recursos para tratar la imagen, se cae la conexión a mitad de una
      foto, el archivo es un formato que allá no se puede abrir.

      Cuando eso pasa en un movimiento que se acaba de crear, se DESHACE: se
      borra lo que se acababa de registrar y se dice que no quedó nada. Un
      gasto cuyo soporte no llegó es peor que ningún gasto —queda anotada plata
      sin el papel que la explica, y nada en la pantalla recuerda que falta—,
      así que la ficha vuelve al estado del que salió y se reintenta entera.

      Antes se quedaba registrado y se avisaba. La razón era buena —pulsar
      «Registrar» otra vez creaba un SEGUNDO movimiento por la misma plata—
      pero la solución era peor que el problema: para no duplicar había que
      dejar a medias. Deshaciendo no hay nada que duplicar, y el reintento es
      el mismo camino de la primera vez.

      ── Y si el deshacer TAMBIÉN falla ──────────────────────────────────────
      Entonces sí quedó registrado, y hay que decirlo. Ahí se recuerda el id:
      el siguiente intento ACTUALIZA ese movimiento en vez de crear otro.
    */
    const existente = movimiento?.id ?? registrado;
    let id = existente ?? undefined;
    /** Lo creó ESTE intento. Es lo único que se puede deshacer sin preguntar. */
    let recienCreado = false;

    try {
      if (existente != null) await actualizar.mutateAsync({ id: existente, cambios: cuerpo });
      else {
        const creado = await crear.mutateAsync(cuerpo as never);
        id = (creado as { id: number }).id;
        recienCreado = true;
      }

      // Los soportes, ya con un movimiento del que colgar.
      if (id !== undefined && pendientes.length > 0) {
        setSubiendo(true);
        const datos = new FormData();
        // Ver `lib/encoger-soporte.ts`: lo que sube es un JPG liviano, no la
        // foto de doce megapíxeles que da un teléfono.
        for (const archivo of await encogerSoportes(pendientes)) {
          datos.append('archivos', archivo);
        }
        await apiSubir(`/transactions/${id}/soportes`, datos);
      }

      /*
        ── Aprender, solo si hubo sugerencia ─────────────────────────────────
        Si alguna fuente automática propuso algo y el movimiento se guardó
        clasificado, lo que quedó —aceptado o corregido— es una regla que vale
        la pena recordar. Un movimiento clasificado a mano sin que nadie
        hubiera sugerido nada no pasa por aquí: no hay nada que confirmar.

        Sin esperar y sin fallar: aprender es de regalo, y una regla que no se
        pudo guardar no puede convertir un gasto bien registrado en un error.
        De descripciones vacías o genéricas el servidor no aprende; lo decide
        él, que es quien tiene la lista.
      */
      if (huboSugerencia && cuerpo.category_id !== null && cuerpo.description) {
        void apiFetch('/categorization/learn', {
          method: 'POST',
          body: { description: cuerpo.description, category_id: cuerpo.category_id },
        }).catch(() => undefined);
      }

      onCerrar();
    } catch (e) {
      const dijo = e instanceof ApiClientError ? e.message : 'No se pudo guardar.';

      // Editando, o reintentando sobre uno que ya estaba: aquí no hay nada que
      // deshacer. Lo que había antes sigue estando, que es lo correcto.
      if (!recienCreado || id === undefined) {
        setError(dijo);
        return;
      }

      try {
        await eliminar.mutateAsync(id);
        setRegistrado(null);
        setError(`${dijo} No quedó registrado nada: un movimiento no se guarda sin el soporte que se le adjuntó. Vuelve a intentarlo.`);
      } catch {
        setRegistrado(id);
        setError(
          `${dijo} El movimiento quedó registrado, su soporte no, y tampoco se pudo deshacer. ` +
            'Reintenta para adjuntarlo, o bórralo desde la tabla: no se va a duplicar.',
        );
      }
    } finally {
      setSubiendo(false);
    }
  }

  const guardando = crear.isPending || actualizar.isPending || subiendo;

  return (
    <div
      // El velo compartido, `--velo`. Aquí hubo un `bg-carbon-950/50` que no
      // pintaba nada —`carbon` no era un color de ninguna paleta de este
      // proyecto—, así que el modal flotaba sobre la página sin velo detrás.
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-[var(--velo)] backdrop-blur-sm',
        /*
          ── 24 hasta el borde de la pantalla, en el teléfono ──────────────
          La ficha no va a sangre. Pegada a los tres cantos, se lee como otra
          PANTALLA: se come el ancho entero, la esquina de abajo desaparece y
          lo único que dice que la aplicación sigue detrás es una franja de
          velo arriba. Separada, vuelve a leerse como lo que es —algo que está
          ENCIMA— y el velo se ve por los cuatro lados.

          Es distancia de la ficha al canto de la pantalla, no relleno de la
          ficha: lo de dentro sigue en 16, que es lo que `Modal` y
          `CabeceraDeModal` ya fijan.
        */
        'p-6',
        'se-revela sm:items-center sm:p-4',
      )}
      // `onMouseDown` sobre el velo, y no `onClick` en cualquier sitio.
      //
      // Con clic, un arrastre que EMPIEZA dentro del panel y termina fuera
      // —soltar el ratón un dedo más allá del borde— dispara el clic en el
      // ancestro común, que es el velo, y la ficha se cerraba con todo lo
      // escrito dentro. Aquí eso no es un caso raro: la previsualización del
      // soporte se recorre arrastrando, así que el gesto que cierra la ficha
      // es el mismo con el que se mira el recibo.
      onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar movimiento' : 'Nuevo movimiento'}
        // En móvil entra desde abajo y ocupa el ancho: es el patrón que la
        // gente espera de una app, y deja el pulgar cerca de los botones.
        className={cn(
          PANEL_DE_MODAL,
          SUPERFICIE_FLOTANTE,
          'emerge',
          // El ancho lo pone `PANEL_DE_MODAL`, que lo topa en 720 para todas
          // las fichas. Esta pedía 1024 por su columna del soporte, y una
          // ficha de 1024 deja de leerse como algo que está encima de la
          // aplicación: se lee como otra pantalla.
          // Las cuatro esquinas, ya no solo las de arriba: separada del borde
          // de abajo, las de abajo también se ven, y dos cantos rectos debajo
          // de dos curvos es una caja a medio dibujar.
          'rounded-lg',
          /*
            ── La ÚNICA ficha que puede ser más baja ────────────────────────
            El alto mínimo de `PANEL_DE_MODAL` existe para que dos fichas
            seguidas no hagan crecer y encoger el mismo panel en el mismo sitio
            de la pantalla. Aquí no aplica: «cómo empezar» no es una ficha más,
            es el paso previo a todas —tres opciones y nada más—, y no se abre
            después de otra sino ANTES. No hay con qué compararla.

            Y el mínimo le hacía daño: con tres tarjetas de dos renglones, 600
            de alto son cuatrocientos de nada debajo. Es exactamente el hueco
            que llevamos media tarde intentando llenar con adornos.

            `min-h-0` gana al `min-h-[min(600px,92dvh)]` de la clase compartida
            porque va después y las dos son la misma propiedad; el `max-h` de
            92dvh sigue en pie, que es el que importa cuando sí hay contenido.
          */
          paso === 'elegir' && 'min-h-0',
        )}
      >
        {/* La misma cabecera que las demás fichas, con el pastel de color en
            su hueco. El tipo está en el TÍTULO y en el color, no en un par de
            botones dentro del formulario: lo eligió el menú de "Nuevo
            movimiento" antes de abrir esto, así que aquí ya no es una
            pregunta —es de qué se está hablando, y el pastel lo dice antes de
            leer—. */}
        <CabeceraDeModal
          titulo={
            confirmandoUnPago
              ? // Lo que se va a hacer no es lo mismo, así que no se llama
                // igual. «Confirmar pago» en un concepto que se cubre a
                // pedazos promete cerrar el mes, y lo que se anota es una ida
                // de cuatro: la lista ya ofreció «Registrar otro» y la ficha
                // que se abre tiene que ser la que se pidió.
                pago.varios_pagos
                ? 'Registrar otro'
                : 'Confirmar pago'
              : !editando
                ? `Nuevo ${nombreDelTipo(type)}`
                : editable
                  ? `Editar ${nombreDelTipo(type)}`
                  : mayuscula(nombreDelTipo(type))
          }
          /*
            Solo al confirmar un pago, y dice las tres cosas que hacen falta:
            CUÁL es el pago —el título no lo dice—, que lo que hay escrito es
            un esperado y no un dato, y qué hacer para que deje de serlo.

            Sin la segunda, un valor calculado del promedio de tres meses se
            ve igual que uno copiado del recibo, y el que confirme sin mirar
            registra un promedio como si fuera la plata que salió.
          */
          ayuda={
            confirmandoUnPago
              ? pago.varios_pagos
                ? `${pago.name}. Esto se paga en varias veces: anota lo de ESTA vez, no el total del mes.`
                : pago.expected_amount != null
                  ? `${pago.name}. El valor y la fecha son los esperados: adjunta el soporte y se corrigen con lo que diga el recibo.`
                  : `${pago.name}. Adjunta el soporte y se leen el valor y la fecha.`
              : undefined
          }
          antes={
            <ChipIcono
              Icono={type === 'income' ? TrendingUp : TrendingDown}
              color={type === 'income' ? 'ingreso' : 'gasto'}
              tamano="sm"
            />
          }
          acciones={
            <>
              {editando && !editable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm-icon"
                  onClick={() => setEditable(true)}
                  aria-label="Editar movimiento"
                  title="Editar"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
              )}

              {/*
                También en los centros estáticos, y no es una excepción a la
                regla: es que la regla nunca hablaba de esto.

                Lo que un centro estático protege es su ESTRUCTURA —qué
                conceptos existen y en qué categoría viven—, y por eso no se
                reclasifica desde aquí. Un movimiento no es estructura: es el
                registro de que tal mes salió tal plata de un concepto.
                Borrarlo borra el registro y deja el concepto donde estaba,
                igual de vivo, listo para el mes siguiente.

                Estaba condicionado a `!estatico`, así que en un centro
                estático la papelera desaparecía y quedaba un hueco al lado del
                lápiz: no se podía borrar un gasto mal anotado sin ir a hacer
                dinámico su centro, que es exactamente lo contrario de lo que
                hay que hacer.
              */}
              {editando && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm-icon"
                  onClick={() => setConfirmandoBorrado(true)}
                  aria-label="Eliminar movimiento"
                  title="Eliminar"
                  /*
                    El MISMO color y el mismo tamaño que el lápiz y la equis:
                    llevaba `text-muted-foreground` y los otros dos heredan la
                    tinta de la página, así que la papelera salía más apagada y
                    los tres iconos de una misma fila tenían dos pesos.
                    Apagar uno de tres no dice nada: dice que ese está medio
                    deshabilitado.

                    Lo que sí cambia es el HOVER, y es la única excepción:
                    borrar es lo único de esta fila que no se puede deshacer, y
                    el rojo al pasar por encima es la última señal antes de la
                    confirmación.
                  */
                  className="hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </>
          }
          onCerrar={onCerrar}
        />

        {/* `min-h-0` es lo que permite que esto se encoja dentro de la columna:
            sin él mide lo que mida su contenido y se lleva por delante el alto
            máximo del panel. Y es a su vez una columna porque el panel tiene
            alto mínimo: con eso el formulario puede estirarse y llevarse sus
            botones al fondo en vez de dejarlos a media altura. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {paso === 'elegir' && (
            <ComoEmpezar
              onSubir={() => setSubiendoArchivo(true)}
              onCamara={() => setPaso('camara')}
              onAMano={() => setPaso('formulario')}
            />
          )}

          {paso === 'camara' && (
            <Camara onTomar={(a) => void escanear(a)} onCerrar={() => setPaso('elegir')} />
          )}

          {paso === 'leyendo' && (
            <Escaneando archivo={pendientes[0]} progreso={progresoDeLectura} />
          )}

          {paso === 'formulario' && (
            <form onSubmit={(e) => void onSubmit(e)} className="flex flex-1 flex-col gap-4">
              {/*
                ── La misma rejilla, se esté leyendo o editando ────────────
                Y la MISMA en el árbol, no una copia en cada rama: la columna
                del papel se pinta una vez, fuera del condicional, así que al
                pulsar «Editar» React no la desmonta. Escrita dentro de las dos
                ramas, el soporte se descargaba otra vez en cada cambio —el
                marco se vaciaba, aparecía el girador y volvía la misma imagen
                que ya estaba en la memoria de la pestaña—.

                Lo único que cambia de lado a lado es la columna derecha: los
                campos o lo que dicen.
              */}
              <div className={REJILLA_DE_LA_FICHA}>
                <div className="flex flex-col">
                  {movimiento ? (
                    <Soportes transactionId={movimiento.id} />
                  ) : (
                    <SoportesPendientes
                      archivos={pendientes}
                      /*
                        Confirmando un pago, el PRIMER soporte se lee.

                        Es la mitad que faltaba: la ficha se abre con el valor
                        y la fecha esperados, y el recibo es lo que los
                        convierte en los de verdad. Adjuntarlo y que no pasara
                        nada dejaba al soporte de adorno y obligaba a copiar a
                        mano lo que la app sabe leer.

                        Solo el primero, y solo si no hay ninguno: los demás
                        quedan adjuntos sin leer, porque lo que rellena el
                        formulario es UN documento. Es la misma regla que ya
                        seguía el panel de subir.

                        Y solo confirmando un pago. Quien eligió «Registrar
                        manualmente» eligió teclearlo: releerle encima lo que
                        acaba de escribir sería deshacerle el trabajo.
                      */
                      onAñadir={(nuevos) => {
                        const [primero, ...resto] = nuevos;

                        if (confirmandoUnPago && pendientes.length === 0 && primero) {
                          void escanear(primero).then(() => {
                            if (resto.length > 0) setPendientes((p) => [...p, ...resto]);
                          });
                          return;
                        }

                        setPendientes((p) => [...p, ...nuevos]);
                      }}
                      onQuitar={(i) => setPendientes((p) => p.filter((_, n) => n !== i))}
                    />
                  )}
                </div>

                {editandoCampos ? (
                  <>
                    {/*
                  El orden es el de la pregunta: de qué centro, de qué categoría,
                  qué concepto. Y después cuánto y cuándo, que son los dos
                  datos que se copian del papel.

                  Sin rótulo de sección: tres campos con su nombre encima no
                  necesitan que alguien anuncie que son tres campos.
                */}
                    <div className="flex flex-col gap-3">
                      {/*
                        El aviso de lo que se leyó, DENTRO de la columna de
                        campos.

                        Estaba encima de la rejilla, a todo el ancho, y lo que
                        dice —«verifica esto antes de guardar»— no tiene nada
                        que ver con el recibo de la izquierda: habla de los
                        campos de la derecha, que son los que se rellenaron
                        solos. Encabezando su columna, es el rótulo de lo que
                        hay debajo; cruzando la ficha entera, era un cartel.
                      */}
                      {lectura && <LoQueLei />}
                      {sinLeer && <NoSePudoLeer texto={sinLeer} />}

                      {/*
                    Los tres se bloquean si el centro GUARDADO es estático.

                    Esta regla estaba y se perdió al rediseñar la ficha: los
                    desplegables pasaron a bloquearse solo por dependencia
                    —«elige antes un centro»— y el estático dejó de contar, así
                    que un movimiento de Costos fijos se podía reclasificar
                    desde aquí aunque la tabla no lo permitiera. La misma plata
                    se movía o no según por dónde se entrara.

                    Lo que protege un centro estático es su estructura. Borrar
                    el movimiento sí se puede —eso es el registro, no la
                    estructura—; moverlo de concepto, no.
                  */}
                      {/*
                        ── Un solo buscador para clasificar ──────────────────
                        Se escribe «d1» y aparece «Mercado · Alimentación ›
                        Costos variables»: un clic y los tres niveles quedan
                        puestos. La cascada de centro, categoría y concepto
                        sigue ahí, detrás del enlace de abajo, para quien
                        quiera ir nivel a nivel; pero ya no es la puerta.

                        Lo que el buscador dice debajo —«sugerido por tu
                        historial»— es la regla de no guardar nunca una
                        clasificación sugerida sin que la persona la vea.
                      */}
                      <BuscadorDeConcepto
                        id="mov-concepto"
                        arbol={arbol}
                        valor={categoryId}
                        deshabilitado={estatico}
                        onElegir={(id) => proponer({ categoryId: id, origen: 'manual' })}
                        onCrearConcepto={(nombre, categoriaId) => void crearDentro(nombre, categoriaId)}
                        creando={crearCategoria.isPending}
                        recientes={recientes}
                        candidatos={candidatosDelRecibo}
                        ayuda={
                          clasificacion.origen && clasificacion.origen !== 'manual' && categoryId !== undefined
                            ? `${nombreDelOrigen(clasificacion.origen).replace(/^\w/, (c) => c.toUpperCase())}. Puedes cambiarlo.`
                            : candidatosDelRecibo.length > 0 && clasificacion.origen !== 'manual'
                              ? 'El recibo apunta a varios conceptos: elige uno en el buscador.'
                              : undefined
                        }
                      />

                      {!estatico && (
                        <button
                          type="button"
                          onClick={() => setCascadaVisible((v) => !v)}
                          className="-mt-2 self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          {cascadaVisible ? 'Ocultar centro y categoría' : 'Elegir por centro y categoría'}
                        </button>
                      )}

                      {(cascadaVisible || estatico) && (
                        <>
                        <Campo etiqueta="Centro de costos" id="mov-centro">
                          <Combo
                            id="mov-centro"
                            etiqueta="Centro de costos"
                            valor={centro ? String(centro.id) : ''}
                            opciones={arbol.map((c) => ({ valor: String(c.id), etiqueta: c.name }))}
                            deshabilitado={estatico}
                            onCambiar={(v) => proponer({ categoryId: v === '' ? undefined : Number(v), origen: 'manual' })}
                          />
                        </Campo>

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
                            creando={crearCategoria.isPending}
                            onCambiar={(v) => proponer({ categoryId: v === '' ? centro?.id : Number(v), origen: 'manual' })}
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
                            creando={crearCategoria.isPending}
                            onCambiar={(v) => proponer({ categoryId: v === '' ? categoria?.id : Number(v), origen: 'manual' })}
                            onCrear={(nombre) => void crearDentro(nombre, categoria?.id)}
                          />
                        </Campo>
                        </>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Campo etiqueta="Valor" id="mov-valor">
                          {/* Agrupa los miles al escribir y conserva el cursor.
                              El porqué largo está en el componente. */}
                          <CampoDeDinero
                            id="mov-valor"
                            valor={amount}
                            onCambiar={setAmount}
                            placeholder="0"
                            required
                          />
                        </Campo>

                        <Campo etiqueta="Fecha" id="mov-fecha">
                          <SelectorDeFecha
                            id="mov-fecha"
                            valor={date}
                            onElegir={setDate}
                            requerido
                          />
                        </Campo>
                      </div>

                      {/*
                        Las notas, dentro de la columna de campos y pegadas a
                        los demás.

                        Estaban debajo de la rejilla y a todo el ancho: un
                        recuadro de mil píxeles para tres renglones que casi
                        nunca se escriben, pegado encima de los botones y con
                        media ficha vacía a su lado.

                        Y sin `mt-auto`, que las mandaba al fondo de la columna
                        para cerrarla a la altura del soporte. Eso las separaba
                        de los campos con un palmo de nada en medio, y una nota
                        sobre este movimiento es un campo más de los que se
                        rellenan al registrarlo: va donde va el siguiente, no
                        donde sobra sitio. Que la columna cierre antes que la
                        del soporte no es un desajuste —son dos cosas de largo
                        distinto—.
                      */}
                      <Campo etiqueta="Notas" id="mov-notas">
                        {/* Sin marcador. Decía «Opcional», que no es un ejemplo
                        de lo que va ahí sino una nota sobre la validación: este
                        campo no lleva `required`, y eso ya se sabe porque el
                        formulario se envía sin él. Un marcador que explica una
                        regla en vez de enseñar un ejemplo es un renglón
                        gastado. */}
                        <Textarea
                          id="mov-notas"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                        />
                      </Campo>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-4">
                    <VistaDeLectura
                      tipo={type}
                      // El nombre sale del concepto, igual que en la tabla. Leía
                      // `description`, que en un movimiento registrado a mano está
                      // vacío desde que la ficha cambió su campo libre por un selector.
                      nombre={movimiento ? nombreDelMovimiento(movimiento, arbol) : ''}
                      valor={amount}
                      fecha={date}
                      periodo={movimiento?.period}
                      ruta={[centro?.name, categoria?.name, concepto?.name].filter(Boolean) as string[]}
                    />

                    {/* Las notas, con lo que dicen los datos y no debajo de
                        los soportes: el recibo es la prueba de lo que pasó y
                        la nota es el comentario de alguien sobre eso, así que
                        va del lado en el que se cuenta lo que pasó. */}
                    {notes.trim() !== '' && (
                      <Seccion titulo="Notas">
                        {/* `whitespace-pre-line`: las notas se escriben con
                            saltos de línea y aplanarlas convierte una lista en
                            un párrafo. */}
                        <p className="whitespace-pre-line text-sm">{notes}</p>
                      </Seccion>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Leyendo no hay pie: no hay nada que cancelar ni que guardar, y
              para salir ya está la equis de la esquina. Un botón "Cerrar"
              debajo de todo es una segunda puerta a la misma salida. */}
              {editandoCampos && (
                <PieDeModal>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!editando) return onCerrar();
                      setDescartes((n) => n + 1);
                      setEditable(false);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={guardando}>
                    {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {editando ? 'Guardar' : 'Registrar'}
                  </Button>
                </PieDeModal>
              )}
            </form>
          )}

          {subiendoArchivo && (
            <PanelDeSubida
              subiendo={false}
              progreso={0}
              onArchivos={(archivos) => {
                const [primero, ...resto] = archivos;
                if (!primero) return;
                setSubiendoArchivo(false);
                // El primero se lee; los demás quedan adjuntos sin leer, porque lo
                // que rellena el formulario es UN documento.
                void escanear(primero).then(() => {
                  if (resto.length > 0) setPendientes((p) => [...p, ...resto]);
                });
              }}
              onCerrar={() => setSubiendoArchivo(false)}
            />
          )}

          <Confirmacion
            abierta={confirmandoBorrado}
            titulo="Eliminar movimiento"
            peligrosa
            etiquetaConfirmar="Eliminar"
            ocupada={eliminar.isPending}
            onCancelar={() => setConfirmandoBorrado(false)}
            onConfirmar={() =>
              movimiento &&
              eliminar.mutate(movimiento.id, {
                onSuccess: () => {
                  setConfirmandoBorrado(false);
                  onCerrar();
                },
              })
            }
          >
            {/*
              Los tres golpes: qué está a punto de pasar, que no se deshace, y
              la pregunta. Lo que se salta del patrón es la frase del medio, y
              no es un detalle: el nombre de este movimiento ES el de su
              concepto, así que la papelera parece estar apuntando al concepto.
              No lo está. Sin esa frase, nadie borra un gasto mal anotado por
              miedo a llevarse «Aseo» por delante.
            */}
            Estás a punto de borrar el registro de un movimiento. No se elimina el concepto “
            {concepto?.name ?? categoria?.name ?? 'al que pertenece'}”. Esta acción no se puede
            deshacer. ¿Estás seguro de que quieres continuar?
          </Confirmacion>
        </div>
      </div>
    </div>
  );
}

function hoyEnBogota(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** `expense` → "gasto". El tipo, dicho como se dice. */
function nombreDelTipo(tipo: TransactionType): string {
  return tipo === 'income' ? 'ingreso' : 'gasto';
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El movimiento cuando solo se está mirando.
 *
 * ── Por qué no son los mismos campos, apagados ──────────────────────────────
 * Porque un campo apagado sigue siendo un campo: tiene su marco, su etiqueta
 * encima y su altura de control, y ocupa el sitio de una caja donde se podría
 * escribir aunque no se pueda. Ocho de esos, uno debajo de otro, son un
 * formulario que no deja rellenarse —que se lee como una avería— cuando lo
 * que uno viene a hacer es LEER un dato: cuánto fue, cuándo, de qué.
 *
 * ── De dónde sale la jerarquía ──────────────────────────────────────────────
 * De que no todo pese igual. La cifra manda: va grande, en su color y sobre un
 * tinte del pastel que ya marca el tipo en el resumen. Debajo, sus dos datos
 * inseparables —de qué es y cuándo se pagó— en la misma caja, porque se leen
 * juntos. Y después secciones con su nombre encima, cada una respondiendo una
 * pregunta distinta. Una ficha donde todo es del mismo tamaño y del mismo gris
 * obliga a leerla entera para encontrar lo que se venía a mirar.
 */
function VistaDeLectura({
  tipo,
  nombre,
  valor,
  fecha,
  periodo,
  ruta,
}: {
  tipo: TransactionType;
  nombre: string;
  valor: string;
  fecha: string;
  /** `YYYY-MM-DD` del día 1 del mes al que PERTENECE el gasto. */
  periodo?: string;
  ruta: string[];
}) {
  // El periodo solo se nombra cuando NO es el mes del pago. Repetir
  // "septiembre" dos veces seguidas no informa; decirlo cuando la factura de
  // agosto se pagó en septiembre, sí —es lo que descuadra los totales de quien
  // no lo nota—.
  const mesDelPago = fecha.slice(0, 7);
  const desfasado = Boolean(periodo) && periodo!.slice(0, 7) !== mesDelPago;

  return (
    <div className="flex flex-col gap-5">
      {/*
        Partido en dos: arriba CUÁNTO, abajo de qué.

        Juntos en una sola caja, la cifra tenía cuatro líneas pegadas debajo y
        el bloque se leía como un párrafo que empieza con un número grande. La
        línea los separa en dos registros: el dato que se viene a ver, y el
        contexto que lo explica. Y deja a la cifra sola en su mitad, que es lo
        que la hace mandar sin tener que agrandarla más.

        Y es una TARJETA de verdad, no un velo negro al 5 %.

        Desde que el modal es del color del fondo, un tinte sobre él no se
        levanta de nada: quedaba una mancha apenas más oscura. `Card` es la
        superficie que la aplicación ya usa para "esto es una cosa" —en el
        resumen, en los centros de costos— y aquí dice lo mismo: el movimiento
        es un objeto, y lo de abajo son sus anexos.
      */}
      <Card className="overflow-hidden">
        <div className="px-4 py-5">
          {/*
            SIN `tabular`.

            Las cifras tabulares tienen todas el mismo ancho para que las
            columnas de una tabla alineen por dígito. Aquí no hay columna, hay
            un número solo y grande, y ese ancho fijo separa los dígitos como
            si alguien le hubiera metido interletraje.
          */}
          {/*
            Una flecha, no un signo.

            El menos delante de una cifra es una convención de TABLA: ahí hay
            una columna con gastos e ingresos mezclados y el signo los separa
            sin gastar sitio. Aquí no hay columna ni nada con qué confundirlo
            —la ficha entera es un gasto, y lo dice el título— así que el menos
            solo aporta un guion pegado al número.

            La flecha dice lo mismo mejor: sube y sale, baja y entra. Y al
            mismo peso que la cifra, para que se lea como parte de ella y no
            como un adorno al lado.
          */}
          {/* 36px y los mismos en todas las pantallas. Subía a 48 en escritorio,
              y desde que la ficha está topada en 720 esa cifra ocupaba media
              columna: es el dato principal, no el único. */}
          <p className="flex items-center gap-2 font-display text-4xl font-bold leading-none text-acento-tinta">
            <ArrowUpRight
              className={cn('size-8 shrink-0 sm:size-10', tipo === 'income' && 'rotate-180')}
              strokeWidth={2.75}
              aria-hidden="true"
            />
            {formatCOP(valor || '0')}
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          <p className="truncate text-base font-medium">{nombre || 'Sin concepto'}</p>

          {/* El camino, sin etiqueta y sin fichas. Con fichas parecían
              pestañas —algo que se pulsa y cambia lo de abajo— y aquí no se
              pulsa nada: es dónde vive este movimiento, que se lee como una
              ruta. */}
          {ruta.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              {ruta.map((nombre, i) => (
                <span key={nombre} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">›</span>}
                  <span className={cn(i === ruta.length - 1 && 'font-medium text-foreground')}>
                    {nombre}
                  </span>
                </span>
              ))}
            </p>
          )}

          <p className="mt-1 text-xs text-muted-foreground">Pagado el {diaLargo(fecha)}</p>

          {desfasado && (
            <p className="text-xs font-medium text-warning">
              Pertenece a {mesLargo(periodo!.slice(0, 7))}
            </p>
          )}
        </div>
      </Card>

      {ruta.length === 0 && (
        <p className="text-sm text-muted-foreground">Este movimiento está sin clasificar.</p>
      )}
    </div>
  );
}

/**
 * Una parte de la ficha, con su nombre ENCIMA y no sobre el borde.
 *
 * Antes eran `<fieldset>` con `<legend>`, y un `legend` lo dibuja el navegador
 * montado sobre la línea del borde: el texto partía la caja por arriba y se
 * comía un trozo de lo primero que hubiera dentro. El nombre va fuera, que
 * además es lo que crea la jerarquía —etiqueta pequeña, contenido debajo—.
 */
function Seccion({
  titulo,
  caja = true,
  crece = false,
  children,
}: {
  titulo: string;
  /** Con `false`, el contenido va suelto: lo que ya son tarjetas no necesita otra. */
  caja?: boolean;
  /**
   * Se come el alto que sobre en la ficha.
   *
   * Lo pide la de soportes, y solo ella. La ficha tiene alto mínimo, así que
   * al leer un movimiento con pocos campos sobra sitio, y el pie se lo lleva
   * al fondo con su `mt-auto`: el hueco quedaba entre el cuadro de soltar y
   * los botones. Un cuadro donde se sueltan archivos es además el único
   * elemento de la ficha al que el tamaño le sirve de algo —es el blanco que
   * hay que acertar con un archivo agarrado—, así que ese hueco es suyo.
   */
  crece?: boolean;
  children: ReactNode;
}) {
  return (
    // `gap-3` y no `gap-2`: con ocho pulgadas de miniaturas debajo, dos
    // píxeles menos hacían que el rótulo pareciera pegado a la primera fila,
    // casi montado encima —que es justo lo que se acaba de arreglar quitando
    // los `legend`—.
    <section className={cn('flex flex-col gap-3', crece && 'min-h-0 flex-1')}>
      {/*
        Sin mayúsculas sostenidas.

        Una palabra en versalitas pierde la silueta que la hace reconocible
        —"Soporte" y "SOPORTE" no se leen igual de rápido— y dentro de una
        ficha, donde todo el texto es corto, ese rótulo gritando compite con lo
        que titula. El tamaño y el gris ya dicen que es un rótulo.
      */}
      <h3 className="text-xs font-semibold text-muted-foreground">{titulo}</h3>
      {caja ? <Bloque className="flex flex-col gap-3">{children}</Bloque> : children}
    </section>
  );
}

/**
 * Busca un concepto por su nombre en el árbol.
 *
 * Sin distinguir mayúsculas ni tildes: lo que devuelve el clasificador viene
 * de una tabla de firmas escrita a mano, y lo que hay en el árbol lo escribió
 * una persona. "Celsia (Energia)" y "Celsia (Energía)" son el mismo concepto y
 * no hay ninguna razón para que un acento los separe.
 */
function conceptoLlamado(arbol: Category[], nombre: string): Category | undefined {
  const buscado = normalizar(nombre);

  for (const centro of arbol) {
    for (const categoria of centro.children ?? []) {
      for (const concepto of categoria.children ?? []) {
        if (normalizar(concepto.name) === buscado) return concepto;
      }
    }
  }
  return undefined;
}

/**
 * Las dos formas de empezar un movimiento.
 *
 * ── Por qué se pregunta en vez de deducirlo ─────────────────────────────────
 * Porque son dos actos distintos, no dos caminos al mismo sitio. Con el
 * soporte a mano, teclear el valor y la fecha es copiar lo que ya está escrito
 * en el papel —y equivocarse en un dígito—. Sin soporte, esperar a tener uno
 * para registrar el gasto es perder el gasto.
 *
 * ── Por qué la fila entera es el disparador ─────────────────────────────────
 * Porque la fila ES la opción. Con el clic solo en un botón pequeño al final,
 * el resto —el icono, el título, la explicación— se ve pulsable y no lo es, y
 * cada intento fallido enseña a desconfiar del resto de la pantalla.
 *
 * La vía de escanear es la excepción: lleva dos acciones distintas dentro, y
 * una fila no puede hacer dos cosas.
 */
function ComoEmpezar({
  onSubir,
  onCamara,
  onAMano,
}: {
  /**
   * Lleva a la pantalla de subir, no abre el buscador de archivos.
   *
   * Abriéndolo desde aquí, la única forma de dar un archivo era buscarlo en el
   * disco: ni arrastrarlo ni pegar una captura, que es de donde sale la mitad
   * de los soportes. La pantalla de al lado tiene las tres.
   */
  onSubir: () => void;
  onCamara: () => void;
  onAMano: () => void;
}) {
  return (
    /*
      ── TRES opciones, una al lado de la otra ─────────────────────────────
      Eran dos filas apiladas, y la primera contenía dos botones dentro: una
      caja que no se podía pulsar con dos pastillas pequeñas debajo de su
      explicación, y debajo una fila que sí se pulsaba entera. Tres cosas que
      se pueden hacer, presentadas de dos maneras distintas y en dos niveles
      —la jerarquía decía que la cámara y el archivo eran subopciones de algo,
      cuando en realidad son hermanas de registrar a mano—.

      Ahora son tres columnas iguales y los tres son el mismo objeto: una
      baldosa que se pulsa entera. Se comparan de un vistazo, que es lo que se
      viene a hacer aquí, y el blanco de cada una es toda la baldosa.

      En un teléfono se apilan: tres columnas en 375px dejan cada título
      partido en tres renglones.
    */
    /*
      ── Ni estiradas ni pegadas arriba: centradas ───────────────────────────
      Estuvieron ocupando el alto entero de la ficha, con `flex-1` y
      `auto-rows-fr`. Era un error de planteamiento y costó cuatro intentos de
      adorno descubrirlo: esto es un CHOOSER —tres opciones, se elige una y
      desaparecen— y una opción no tiene nada que hacer con quinientos píxeles
      de alto. Lo que había debajo del texto no era espacio, era un hueco, y
      todo lo que se le metió dentro se leyó como relleno.

      Miden ahora lo que miden sus dos renglones, y `my-auto` las pone en
      mitad de la ficha en vez de dejarlas colgando del título. La ficha tiene
      alto mínimo y aquí no hay nada más: el sitio que sobra es de la ficha, no
      de las tarjetas.
    */
    <div className="grid my-auto gap-3 sm:grid-cols-3">
      {/* Apagada, no escondida: es la regla de esta app para lo que va a
          llegar. Quitarla haría creer que la aplicación no sabe leer una foto
          —y sabe: es el mismo motor que lee un archivo subido—. */}
      <Via
        Icono={Camera}
        color="gasto"
        titulo="Tomar una foto"
        ayuda="Se leen el valor, la fecha y el concepto."
        nota="Pronto"
        deshabilitada
        onClick={onCamara}
      />

      <Via
        Icono={Upload}
        color="gasto"
        titulo="Subir un archivo"
        ayuda="Un PDF o una imagen del soporte."
        onClick={onSubir}
      />

      <Via
        Icono={Pencil}
        color="presupuesto"
        titulo="Registrar manualmente"
        ayuda="Sin soporte, o cuando ya sabes cómo clasificarlo."
        onClick={onAMano}
      />
    </div>
  );
}

/**
 * Una de las tres vías.
 *
 * ── Por qué es una baldosa y no una fila ────────────────────────────────────
 * Porque las tres se comparan entre sí, y lo que se compara se pone al lado,
 * no debajo: en columna hay que leer las tres explicaciones en orden para
 * saber cuál es la que se quiere. Una al lado de otra se ven de un vistazo.
 *
 * ── Y siempre se pulsa ENTERA ───────────────────────────────────────────────
 * Antes había dos formas —con `onClick` la fila era un botón; sin él, una caja
 * que contenía botones más pequeños—, y eso hacía que la cámara y el archivo
 * parecieran subopciones de «escanear» cuando en realidad son hermanas de
 * registrar a mano. Con una sola forma, el blanco de cada opción es toda su
 * baldosa, que es lo que se acierta con el dedo.
 *
 * El contenido va en COLUMNA: el pastel arriba y el texto debajo. De lado, en
 * un tercio del ancho del modal, el texto se queda con setenta píxeles y el
 * título se parte.
 */
/**
 * Las dos manchas de color de un cartel: mismo tamaño, esquinas opuestas.
 *
 * La medida va aquí y no en cada una porque lo que las hace funcionar es que
 * sean IGUALES —dos discos de tamaños parecidos pero distintos se leen como un
 * descuido, no como una composición— y escrita dos veces es cuestión de tiempo
 * que alguien cambie una y se olvide de la otra. Lo único que cambia entre las
 * dos es de qué esquina entran.
 *
 * Y se hunden MÁS en el teléfono que en pantalla grande —80px contra 64—
 * aunque ahí el disco sea más pequeño. Apilada, la tarjeta mide un tercio de
 * la ficha: un disco de 208 hundido solo 64 se le comería el centro, que es
 * donde va el glifo.
 */
function Via({
  Icono,
  color,
  titulo,
  ayuda,
  nota,
  deshabilitada = false,
  onClick,
}: {
  Icono: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  color: ColorDeChip;
  titulo: string;
  ayuda: string;
  /** Dos palabras en una etiqueta: por qué no se puede todavía. */
  nota?: string;
  deshabilitada?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      aria-disabled={deshabilitada}
      // Al pasar por encima se tiñe el borde y se llena con `accent`, que es
      // la superficie de lo que responde en toda la app. Antes era `muted`, y
      // dentro de un modal `muted` y `popover` se llevan un escalón de nada en
      // oscuro: había que marcar además el borde en `primary` —a plena tinta,
      // más fuerte que la fila entera— para que se notara algo.
      className={cn(
        BLOQUE,
        // `h-full` para que las tres midan lo que la más alta de la fila: con
        // una ayuda de dos renglones y otra de uno, tres tarjetas de altos
        // distintos en una fila se leen como un descuadre.
        //
        // `items-start` para que el pastel mida lo suyo: sin él, un hijo de una
        // columna flexible se estira a todo el ancho y el círculo sale óvalo.
        'flex h-full w-full flex-col items-start gap-3 p-4 text-left',
        'transition-colors',
        // Apagada no responde: ni tiñe el borde ni se realza, o prometería
        // que al pulsarla pasa algo.
        deshabilitada ? 'cursor-not-allowed opacity-50' : cn('hover:border-ring/40', REALCE),
      )}
    >
      <ChipIcono Icono={Icono} color={color} tamano="sm" />

      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">{titulo}</span>
          {/* La misma etiqueta que en el resto de la app, no un rótulo a mano. */}
          {nota && (
            <Etiqueta tono="neutro" className="shrink-0 text-muted-foreground">
              {nota}
            </Etiqueta>
          )}
        </span>
        {/*
          ── `min-h-8`: dos renglones reservados ─────────────────────────────
          El texto va pegado al pie de la tarjeta, así que lo que queda fijo es
          el BORDE DE ABAJO del bloque y no su principio: una ayuda de dos
          renglones empuja su título dieciséis píxeles hacia arriba y el de al
          lado, con una ayuda de uno, se queda donde estaba. Tres títulos a dos
          alturas distintas en una fila de tres tarjetas iguales se lee como un
          descuadre, aunque cada tarjeta por separado esté bien.

          Reservando el alto de dos renglones —`text-xs` mide uno por cada
          rem—, todas las ayudas ocupan lo mismo aunque una llene solo la
          mitad, y los tres títulos caen en la misma línea.
        */}
        <span className="mt-0.5 block min-h-8 text-xs text-muted-foreground">{ayuda}</span>
      </span>
    </button>
  );
}

/**
 * LA rejilla de una ficha de movimiento: el papel y lo que dice.
 *
 * ── Por qué una clase y no dos rejillas escritas ────────────────────────────
 * Porque la ficha tiene cinco caras —leer, editar, registrar a mano, registrar
 * con un archivo y, pronto, con una foto— y las cinco son lo mismo: un
 * documento a la izquierda y sus datos a la derecha. Escrita en cada una, la
 * de leer y la de editar ya se habían separado: al pulsar «Editar», el recibo
 * saltaba de sitio y las columnas cambiaban de ancho en el mismo gesto.
 *
 * ── El reparto: mitad y mitad ───────────────────────────────────────────────
 * Se probó a favor del papel —65 y 35— y no hacía falta. Desde que la columna
 * del documento perdió su fila de miniaturas, lo que hay en ella es una sola
 * previsualización de 350px de alto: darle dos tercios del ancho solo la deja
 * con aire a los lados mientras los campos de al lado se aprietan.
 *
 * Por debajo de `lg` no hay reparto: son dos filas apiladas, porque en un
 * teléfono dos columnas de 170px no son dos columnas.
 */
const REJILLA_DE_LA_FICHA = 'grid gap-5 lg:min-h-0 lg:flex-1 lg:auto-rows-fr lg:grid-cols-2';

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
/**
 * El documento, con una banda de luz cruzándolo mientras se lee.
 *
 * ── Por qué se enseña el documento y no un girador ─────────────────────────
 * Porque un girador dice «espera» y nada más: es el mismo dibujo para cargar
 * una lista, guardar un formulario o leer un recibo. Aquí está pasando algo
 * concreto y que se puede enseñar —una máquina está mirando ESE papel—, y
 * enseñarlo hace dos cosas que el girador no: se entiende que la espera tiene
 * un motivo, y se ve qué documento se está leyendo, que es justo el dato que
 * hace falta si lo que sale no cuadra.
 *
 * ── Por qué el `blob:` se crea y se suelta aquí ────────────────────────────
 * Porque vive exactamente lo que dura este paso. Creado más arriba habría que
 * acordarse de soltarlo en cada una de las salidas —se leyó bien, falló, se
 * cerró la ficha— y el que se olvide se queda en la memoria de la pestaña con
 * el archivo entero dentro.
 */
function Escaneando({
  archivo,
  progreso,
}: {
  archivo: File | undefined;
  progreso: ProgresoDeLectura | null;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!archivo) return;
    const creado = URL.createObjectURL(archivo);
    /*
      Un `blob:` es un recurso del navegador con ciclo de vida —se crea, se
      usa, se suelta— y el sitio de un ciclo de vida es un efecto con su
      limpieza. La regla pide no escribir estado dentro de un efecto, pero
      aquí el estado es solo el asa del recurso: no hay forma de tener el
      `blob:` sin crearlo, y crearlo en el render sería un efecto secundario
      sin limpieza posible.

      La alternativa que la regla sugiere —`useMemo` para crearlo y un efecto
      solo para soltarlo— se rompe con `StrictMode`: React simula desmontar y
      volver a montar, la limpieza suelta el `blob:` y el memo, que no se
      repite, queda apuntando a uno que ya no existe. La imagen sale rota en
      desarrollo. Esta es la forma correcta, y la excepción lo dice.
    */
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recurso con ciclo de vida, ver arriba
    setUrl(creado);
    return () => {
      URL.revokeObjectURL(creado);
      setUrl(null);
    };
  }, [archivo]);

  const esImagen = archivo?.type.startsWith('image/') ?? false;
  const etapa = progreso?.etapa ?? 'Leyendo el soporte…';

  return (
    <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
      {/*
        El cristal del escáner: el documento dentro, recortado, y las dos capas
        del barrido encima. `overflow-hidden` es lo que mantiene la banda
        dentro del marco, y `select-none` evita que un arrastre sobre él
        seleccione media ficha.
      */}
      <div
        className={cn(
          'relative w-full max-w-sm select-none overflow-hidden rounded-lg',
          'border border-border bg-card',
          // Una hoja es más alta que ancha. Fijando la proporción, el marco no
          // cambia de tamaño cuando la imagen acaba de cargar.
          'aspect-[3/4]',
        )}
      >
        {url === null ? null : esImagen ? (
          // `object-top`: lo que hace falta ver de un recibo está arriba —el
          // comercio, la fecha—, no en su centro geométrico.
          <img src={url} alt="" className="size-full object-cover object-top opacity-80" />
        ) : (
          <div className="grid size-full place-items-center overflow-hidden">
            <LienzoPdf url={url} />
          </div>
        )}

        {/*
          El rastro: lo ya barrido queda un poco más claro que lo que falta.
          Sin esto la banda parece un reflejo suelto pasando por encima; con
          él, parece que va dejando el trabajo hecho detrás.
        */}
        <span
          aria-hidden="true"
          className="deja-rastro pointer-events-none absolute inset-0 bg-accent/25"
        />

        {/* La banda, con su canto de avance brillante. */}
        <span
          aria-hidden="true"
          className={cn(
            'barre pointer-events-none absolute inset-y-0 left-0 w-1/4',
            'bg-gradient-to-r from-transparent via-acento-tinta/30 to-transparent',
          )}
        >
          <span className="absolute inset-y-0 right-0 w-px bg-acento-tinta shadow-[0_0_12px_2px_var(--acento-tinta)]" />
        </span>
      </div>

      <p className="text-sm font-medium">{etapa}</p>

      {/* El OCR de un escaneo tarda segundos y sin barra parece colgado. La
          barra es la compartida: esta medía 4px de alto y 192 de ancho y la de
          la importación 8px y todo el ancho, siendo la misma espera del mismo
          trabajo. */}
      <Progreso avance={progreso?.avance ?? 0} etiqueta={etapa} className="w-full max-w-sm" />
    </div>
  );
}

/**
 * Lo que el soporte NO dijo.
 *
 * Mismo sitio y misma forma que `LoQueLei` —es la otra respuesta a la misma
 * pregunta— y el tono de lo pendiente, no el del error: no se rompió nada, hay
 * trabajo que hacer a mano.
 */
function NoSePudoLeer({ texto }: { texto: string }) {
  return (
    <p className="flex min-h-16 items-center gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning">
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  );
}

function LoQueLei() {
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
      Los datos se extrajeron del soporte. Conviene verificarlos antes de guardar.
    </p>
  );
}

/**
 * Los soportes elegidos antes de que el movimiento exista.
 *
 * ── Por qué una galería y no una lista ──────────────────────────────────────
 * Porque con varios recibos lo que uno hace es pasar de uno a otro, y el
 * nombre del archivo no dice cuál es cuál: `IMG_4821.HEIC` y `scan0007.pdf`
 * son indistinguibles hasta que se abren. Una fila de miniaturas se reconoce
 * mirando, y el que se está viendo va marcado.
 *
 * ── Por qué los `blob:` viven aquí ──────────────────────────────────────────
 * Porque los mira la previsualización grande Y su miniatura: creados en cada
 * uno, el mismo archivo se cargaría dos veces en memoria. Aquí se crean una
 * vez y se sueltan juntos.
 */
function SoportesPendientes({
  archivos,
  onAñadir,
  onQuitar,
}: {
  archivos: File[];
  onAñadir: (archivos: File[]) => void;
  onQuitar: (indice: number) => void;
}) {
  const [activo, setActivo] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);
  /** El panel de subir, sobre la ficha. El mismo que abre la galería de uno
      ya guardado. */
  const [añadiendo, setAñadiendo] = useState(false);

  useEffect(() => {
    const creados = archivos.map((a) => URL.createObjectURL(a));
    // El mismo caso que el `blob:` de `Escaneando`, y por el mismo motivo:
    // recurso del navegador con ciclo de vida, y `useMemo` se rompe con
    // `StrictMode`. Ver la explicación larga allí.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- recurso con ciclo de vida
    setUrls(creados);
    // Cada blob vive en la memoria de la pestaña hasta que se le suelta.
    return () => {
      for (const u of creados) URL.revokeObjectURL(u);
    };
  }, [archivos]);

  // El que se está viendo, recortado: quitar el último dejaba el índice
  // apuntando a un archivo que ya no existe.
  const i = Math.min(activo, archivos.length - 1);
  const vacio = archivos.length === 0;

  return (
    /*
      `min-h-0 flex-1` SIEMPRE, y no solo cuando está vacía.

      Lo llevaba solo en el caso vacío, que es cuando el hueco de soltar tiene
      que llenar la columna. Pero con un documento dentro pasa lo mismo: si
      esta caja mide lo que miden sus hijos, el previsualizador no tiene contra
      qué crecer y se queda en su alto mínimo con el resto de la columna en
      blanco debajo.
    */
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/*
        La misma columna que la de un movimiento ya guardado: UNA
        previsualización con sus mandos encima, sin fila de miniaturas. Lo que
        cambia es de dónde salen los archivos —de la memoria, no del servidor—
        y que aquí no hay pase a pantalla completa que abrir: el soporte no
        existe en ninguna parte hasta que se guarda el movimiento.
      */}
      {i >= 0 && archivos[i] && (
        <PreviaDeArchivo
          // La clave es el ARCHIVO y no su url: con la url, el marco se
          // desmontaba y se volvía a montar en cuanto se creaba el `blob:`.
          key={`${archivos[i].name}-${i}`}
          url={urls[i]}
          esImagen={archivos[i].type.startsWith('image/')}
          acciones={
            <>
              {archivos.length > 1 && (
                <>
                  <BotonOscuro
                    etiqueta="Soporte anterior"
                    deshabilitado={i === 0}
                    onClick={() => setActivo(i - 1)}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </BotonOscuro>
                  <span className="tabular px-1 text-xs font-medium text-sala-tinta">
                    {i + 1} / {archivos.length}
                  </span>
                  <BotonOscuro
                    etiqueta="Soporte siguiente"
                    deshabilitado={i === archivos.length - 1}
                    onClick={() => setActivo(i + 1)}
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </BotonOscuro>
                  <SeparadorDeMandos />
                </>
              )}

              <BotonOscuro etiqueta="Agregar otro soporte" onClick={() => setAñadiendo(true)}>
                <Plus className="size-4" aria-hidden="true" />
              </BotonOscuro>

              {/* Aquí no se pregunta antes de quitar: lo que se va es un
                  archivo que todavía no se ha guardado en ninguna parte, así
                  que volver a ponerlo es arrastrarlo otra vez. */}
              <BotonOscuro
                etiqueta="Quitar este soporte"
                onClick={() => {
                  onQuitar(i);
                  if (i > 0) setActivo(i - 1);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </BotonOscuro>
            </>
          }
        />
      )}

      {vacio && (
        <div className="flex min-h-0 flex-1">
          <Soltar subiendo={false} progreso={0} solo onArchivos={onAñadir} />
        </div>
      )}

      {añadiendo && (
        <PanelDeSubida
          subiendo={false}
          progreso={0}
          onArchivos={(nuevos) => {
            onAñadir(nuevos);
            setAñadiendo(false);
          }}
          onCerrar={() => setAñadiendo(false)}
        />
      )}
    </div>
  );
}
