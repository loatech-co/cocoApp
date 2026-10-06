/** Una opción de menú cierra el menú y después hace lo suyo. */
export function trasCerrar(cerrar: () => void, accion: () => void): () => void {
  return () => {
    cerrar();
    accion();
  };
}
