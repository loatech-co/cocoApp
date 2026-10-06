import { useEffect, useState } from 'react';

/*
  ── Why an effect that writes state ─────────────────────────────────────────
  A `blob:` is a browser resource with a life cycle —it is created, used,
  released— and the place for a life cycle is an effect with its cleanup. The
  rule asks not to write state inside an effect, but here the state is only
  the handle of the resource: there is no way to have the `blob:` without
  creating it, and creating it in the render would be a side effect with no
  possible cleanup.

  The alternative the rule suggests —`useMemo` to create it and an effect
  only to release it— breaks with `StrictMode`: React simulates unmounting
  and mounting again, the cleanup releases the `blob:` and the memo, which is
  not repeated, is left pointing to one that no longer exists. The image comes
  out broken in development. This is the right form, and the exception says so.
*/

/**
 * A file's `blob:`, for as long as the file stays the same.
 *
 * It is created and released here because it lives exactly as long as
 * whoever uses it. Created higher up, it would have to be remembered at each
 * of the exits, and the one that forgets stays in the tab's memory with the
 * whole file inside.
 */
export function useObjectUrl(file: File | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const created = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resource with a life cycle, see above
    setUrl(created);
    return () => {
      URL.revokeObjectURL(created);
      setUrl(null);
    };
  }, [file]);

  return url;
}

/** The `blob:`s of a list of files, created once and released together. */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const created = files.map((a) => URL.createObjectURL(a));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resource with a life cycle, see above
    setUrls(created);
    // Each blob lives in the tab's memory until it is released.
    return () => {
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, [files]);

  return urls;
}
