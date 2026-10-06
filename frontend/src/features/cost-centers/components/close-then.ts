/** Una opción de menú cierra el menú y después hace lo suyo. */
export function afterClose(close: () => void, action: () => void): () => void {
  return () => {
    close();
    action();
  };
}
