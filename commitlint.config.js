// Conventional Commits — CONTRIBUTING.md, "Commit messages". Checked by the
// commit-msg hook (lefthook.yml).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Optional scope; when present, one of the workspaces or areas:
    // api, web (frontend/), ios, the packages (receipt-parser, flags) and
    // the cross-cutting areas.
    'scope-enum': [
      2,
      'always',
      ['api', 'web', 'ios', 'receipt-parser', 'flags', 'ci', 'deps', 'docs'],
    ],
  },
};
