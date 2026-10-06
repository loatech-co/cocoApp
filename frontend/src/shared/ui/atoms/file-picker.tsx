import type { RefObject } from 'react';

/**
 * El campo de archivos del navegador, ESCONDIDO.
 *
 * El nativo no se puede peinar: lo que se ve es otro control (un cuadro donde
 * soltar, un botón) que lo abre con `ref.current?.click()`. Entrega la lista
 * de archivos y se vacía al hacerlo, para que elegir DOS VECES el mismo
 * archivo dispare el evento la segunda: sin eso el valor no cambia y no pasa
 * nada.
 */
export function FilePicker({
  ref,
  accept,
  multiple: isMultiple = false,
  onFiles,
}: {
  ref: RefObject<HTMLInputElement | null>;
  /** Los tipos que se aceptan, como en `accept`. */
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <input
      ref={ref}
      type="file"
      multiple={isMultiple}
      accept={accept}
      className="hidden"
      onChange={(e) => {
        onFiles(Array.from(e.target.files ?? []));
        e.target.value = '';
      }}
    />
  );
}
