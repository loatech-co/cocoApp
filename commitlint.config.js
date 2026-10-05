// Conventional Commits — CONTRIBUTING.md, "Commit messages". Checked by the
// commit-msg hook (lefthook.yml).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Optional scope; when present, one of the workspaces or areas:
    // api, web (frontend/), ios, the packages (types, lectura, flags) and
    // the cross-cutting areas.
    'scope-enum': [
      2,
      'always',
      ['api', 'web', 'ios', 'types', 'lectura', 'flags', 'ci', 'deps', 'docs'],
    ],
  },
};
