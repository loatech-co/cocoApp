import type { RefObject } from 'react';

/**
 * The browser's file field, HIDDEN.
 *
 * The native one cannot be styled: what is seen is another control (a box to
 * drop on, a button) that opens it with `ref.current?.click()`. It hands over the list
 * of files and empties itself while doing so, so that picking the same
 * file TWICE fires the event the second time: without that the value does not change and nothing
 * happens.
 */
export function FilePicker({
  ref,
  accept,
  multiple: isMultiple = false,
  onFiles,
}: {
  ref: RefObject<HTMLInputElement | null>;
  /** The accepted types, as in `accept`. */
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
