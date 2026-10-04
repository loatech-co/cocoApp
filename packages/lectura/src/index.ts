export { clasificar, necesitaRevision, UMBRAL_DE_REVISION } from './clasificar';
export type { ClasificacionEnElArbol, EntradaDeLectura, Lectura, SeñalesDeLectura } from './clasificar';
export { fechasDe, leerFecha } from './fecha';
export type { FechaCandidata } from './fecha';
export { aNumero, leerMonto } from './monto';
export type { MontoCandidato } from './monto';
export {
  FIRMAS,
  PRIORIDAD_DE_LO_ESCRITO,
  RECAUDADORES,
  firmasDeConceptos,
  normalizar,
} from './firmas';
export type { ConceptoConPalabras, Firma } from './firmas';
export {
  buscarEnArbol,
  indexarArbol,
  resolverTerminos,
  rutaLegible,
} from './buscar';
export type { Certeza, EntradaDelIndice, NivelDelArbol, NodoBuscable, Resolucion } from './buscar';
export { DICCIONARIO, TUBERIAS, comerciosEn, terminosPara } from './diccionario';
export type { ComercioHallado, GrupoDelDiccionario } from './diccionario';
