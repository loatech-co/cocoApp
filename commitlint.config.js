// Conventional Commits — CONTRIBUTING.md, "Commit messages". Checked by the
// commit-msg hook (lefthook.yml).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Optional scope; when present, one of the workspaces or areas.
    'scope-enum': [2, 'always', ['api', 'web', 'ios', 'types', 'lectura', 'ci', 'deps', 'docs']],
  },
};
