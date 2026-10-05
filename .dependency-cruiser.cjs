// @ts-check
/**
 * Layering rules (step 7.4, D13). `npm run depcruise`; CI runs it in the
 * `verify` job. Every rule has its section in CONTRIBUTING.md
 * ("Architecture").
 *
 * Type-only imports (`import type`) of Prisma's generated types are allowed
 * everywhere: they vanish at compile time and are how a service names the row
 * a repository returns. What is forbidden is reaching the database.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle means two files cannot be understood, tested or moved apart.',
      from: {
        // TEMPORARY (step 7.4): the one cycle that existed when the rule arrived,
        // between the web's session and the native bridge. The frontend step
        // breaks it and deletes this line.
        pathNot: '^frontend/src/lib/(puente-nativo|session)\\.ts$',
      },
      to: { circular: true },
    },
    {
      name: 'api-only-repositories-use-prisma',
      severity: 'error',
      comment:
        'Only *.repository.ts injects PrismaService. Services, controllers, guards and ' +
        'tasks go through a repository.',
      from: {
        path: '^api/src/',
        pathNot: ['\\.repository\\.ts$', '^api/src/prisma/'],
      },
      to: { path: '^api/src/prisma/prisma\\.service\\.ts$' },
    },
    {
      name: 'api-no-prisma-runtime-in-services-or-controllers',
      severity: 'error',
      comment:
        'A service or controller may name Prisma types (import type) but not use the ' +
        'client at runtime: no queries, no Prisma error classes.',
      from: { path: '^api/src/.+\\.(service|controller)\\.ts$', pathNot: '^api/src/prisma/' },
      // The generated Prisma 7 client (ADR 0020), or its runtime package.
      to: { path: '^api/src/generated/prisma/|@prisma/client', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'api-common-does-not-import-modules',
      severity: 'error',
      comment: 'common/ is shared by every module; it cannot depend on one.',
      from: { path: '^api/src/common/' },
      to: { path: '^api/src/modules/' },
    },
    {
      name: 'api-modules-talk-through-services',
      severity: 'error',
      comment:
        'A module uses another module only through its public service (and its Nest ' +
        'module, to import it) — never its repository, controller or internals.',
      from: { path: '^api/src/modules/([^/]+)/' },
      to: {
        path: '^api/src/modules/',
        pathNot: ['^api/src/modules/$1/', '\\.(service|module)\\.ts$'],
      },
    },
    {
      name: 'web-features-do-not-import-each-other',
      severity: 'error',
      comment: 'What two features share moves up to shared code (D10).',
      from: {
        path: '^frontend/src/features/([^/]+)/',
        pathNot: knownFeatureImporters(),
      },
      to: { path: '^frontend/src/features/', pathNot: '^frontend/src/features/$1/' },
    },
    {
      name: 'web-features-known-violations',
      severity: 'error',
      comment:
        'TEMPORARY (step 7.4): the four cross-feature imports that existed when the rule ' +
        'arrived. Each file may keep ITS import and nothing else. The frontend step moves ' +
        'these to shared code and deletes this rule and knownFeatureImporters.',
      from: {
        path: '^frontend/src/features/([^/]+)/(usuarios-page|cuenta-page|dashboard-page|movimiento-modal)\\.tsx$',
      },
      to: {
        path: '^frontend/src/features/',
        pathNot: [
          '^frontend/src/features/$1/',
          // admin/usuarios-page and cuenta/cuenta-page → the password policy
          '^frontend/src/features/auth/politica-de-contrasena\\.tsx$',
          // dashboard/dashboard-page → the movement modal
          '^frontend/src/features/transactions/movimiento-modal\\.tsx$',
          // transactions/movimiento-modal → the category suggestion hook
          '^frontend/src/features/categorization/use-sugerencia\\.ts$',
        ],
      },
    },
  ],
  options: {
    // The generated Prisma client is a node, not a tree: its own cycles are not ours.
    doNotFollow: { path: ['node_modules', '^api/src/generated/'] },
    exclude: { path: '(^|/)(dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};

/** The four files with a known cross-feature import (see the rule above). */
function knownFeatureImporters() {
  return [
    '^frontend/src/features/admin/usuarios-page\\.tsx$',
    '^frontend/src/features/cuenta/cuenta-page\\.tsx$',
    '^frontend/src/features/dashboard/dashboard-page\\.tsx$',
    '^frontend/src/features/transactions/movimiento-modal\\.tsx$',
  ];
}
