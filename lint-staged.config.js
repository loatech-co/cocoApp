// lint-staged — run by the pre-commit hook (lefthook.yml) on staged files only.
// CONTRIBUTING.md, "Git hooks".
//
// One function instead of two globs: two globs matching the same file run in
// parallel, and eslint --fix and prettier --write would race on it.
import { relative } from 'node:path';

const TYPESCRIPT_IN_A_WORKSPACE = /^(api|frontend|packages\/[^/]+)\/.+\.tsx?$/;

/** Paths have spaces here ("VS Code"): quote every one. */
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(' ');

/**
 * ESLint runs from each workspace, as `npm run lint` does, so each file is
 * linted with the same configuration and paths as in CI.
 */
function eslintByWorkspace(files) {
  const byWorkspace = new Map();
  for (const file of files) {
    const workspace = TYPESCRIPT_IN_A_WORKSPACE.exec(relative(import.meta.dirname, file))?.[1];
    if (!workspace) continue;
    byWorkspace.set(workspace, [...(byWorkspace.get(workspace) ?? []), file]);
  }
  return [...byWorkspace].map(
    ([workspace, typescript]) =>
      `npm exec --workspace ${workspace} -- eslint --fix --max-warnings 0 --no-warn-ignored ${quoted(typescript)}`,
  );
}

export default {
  '*': (files) => [
    ...eslintByWorkspace(files),
    `prettier --write --ignore-unknown ${quoted(files)}`,
  ],
};
