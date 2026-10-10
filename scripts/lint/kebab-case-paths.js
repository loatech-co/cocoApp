// @ts-check
/**
 * File and folder names in kebab-case (step 7.2 «Nomenclatura»).
 *
 * It replaces `eslint-plugin-check-file`, which pulled `micromatch` → `braces`
 * into the tree (GHSA-vfj7-8cjw-p6xm, no fixed `braces` exists) to answer a
 * question two regular expressions answer. Same contract as the plugin's
 * `KEBAB_CASE` with `ignoreMiddleExtensions`: only the part of the file name
 * before the first dot is checked, so `.test`, `.spec`, `.stories` and the role
 * suffixes stay free; and every folder between the source root and the file.
 */
import path from 'node:path';

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Where the folder check starts: the folders above these are not ours to name. */
const SOURCE_ROOTS = [/^api\/(?:src|test)\//, /^frontend\/src\//, /^packages\/[^/]+\/src\//];

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'File and folder names in kebab-case' },
    schema: [],
    messages: {
      file: 'The file name "{{name}}" is not kebab-case.',
      folder: 'The folder name "{{name}}" is not kebab-case.',
    },
  },
  create(context) {
    return {
      Program(node) {
        const relative = path.relative(context.cwd, context.filename).split(path.sep).join('/');
        const base = path.posix.basename(relative);
        const stem = base.slice(0, base.indexOf('.') === -1 ? undefined : base.indexOf('.'));
        if (!KEBAB_CASE.test(stem))
          context.report({ node, messageId: 'file', data: { name: base } });
        const root = SOURCE_ROOTS.map((pattern) => pattern.exec(relative)).find(Boolean);
        if (!root) return;
        const folders = path.posix.dirname(relative.slice(root[0].length)).split('/');
        for (const folder of folders) {
          if (folder !== '.' && !KEBAB_CASE.test(folder))
            context.report({ node, messageId: 'folder', data: { name: folder } });
        }
      },
    };
  },
};

export default { rules: { 'kebab-case-paths': rule } };
