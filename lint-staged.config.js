// lint-staged — run by the pre-commit hook (lefthook.yml) on staged files only.
// CONTRIBUTING.md, "Git hooks".
//
// One function instead of two globs: two globs matching the same file run in
// parallel, and eslint --fix and prettier --write would race on it.
import { relative } from 'node:path';

const TYPESCRIPT_IN_A_WORKSPACE = /^(api|frontend|packages)\/.+\.tsx?$/;

/** Paths have spaces here ("VS Code"): quote every one. */
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(' ');

export default {
  '*': (files) => {
    const typescript = files.filter((file) =>
      TYPESCRIPT_IN_A_WORKSPACE.test(relative(import.meta.dirname, file)),
    );
    return [
      ...(typescript.length > 0
        ? [`eslint --fix --max-warnings 0 --no-warn-ignored ${quoted(typescript)}`]
        : []),
      `prettier --write --ignore-unknown ${quoted(files)}`,
    ];
  },
};
