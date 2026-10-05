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
/**
 * Tests and Storybook stories may import what they show from any level: a
 * card's story puts a button in it to look like the app.
 */
const WEB_TEST = '\\.(test|stories)\\.tsx?$';

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'A cycle means two files cannot be understood, tested or moved apart.',
      from: {},
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
    // ── Web (step 7.4-web-a). Each rule has its line in CONTRIBUTING.md
    // ("Web architecture") and the reasoning in .claude/rules/web.md.
    {
      name: 'web-features-do-not-import-each-other',
      severity: 'error',
      comment: 'What two features share moves up to shared/ (D10).',
      from: { path: '^frontend/src/features/([^/]+)/' },
      to: { path: '^frontend/src/features/', pathNot: '^frontend/src/features/$1/' },
    },
    {
      name: 'web-nothing-imports-app',
      severity: 'error',
      comment:
        'app/ is the top: it boots, routes and composes features and shared. Nothing ' +
        'below imports it back.',
      from: { path: '^frontend/src/(features|shared)/' },
      to: { path: '^frontend/src/app/' },
    },
    {
      name: 'web-shared-does-not-import-features',
      severity: 'error',
      comment: 'shared/ is used by every feature; it cannot depend on one.',
      from: { path: '^frontend/src/shared/' },
      to: { path: '^frontend/src/features/' },
    },
    {
      name: 'web-shared-lib-is-the-floor',
      severity: 'error',
      comment:
        'shared/lib is plain infrastructure (dates, formatting, focus, the native bridge): ' +
        'it draws nothing and fetches nothing.',
      from: { path: '^frontend/src/shared/lib/', pathNot: WEB_TEST },
      to: { path: '^frontend/src/shared/(ui|api)/' },
    },
    {
      name: 'web-ui-has-no-data',
      severity: 'error',
      comment:
        'shared/ui draws what it is given. No React Query, no api client, no session: ' +
        'data lives in a hook of the feature that uses the component.',
      from: { path: '^frontend/src/shared/ui/' },
      to: { path: ['^frontend/src/shared/api/', '(^|/)node_modules/@tanstack/'] },
    },
    {
      name: 'web-ui-knows-no-contract',
      severity: 'error',
      comment:
        'shared/ui does not know the API contract, not even its types: not the generated ' +
        'client (shared/api/generated) nor the native one (shared/lib/native-contract). A ' +
        'component that needs a sign or a label receives it; the feature translates (7.4-web-c).',
      from: { path: '^frontend/src/shared/ui/' },
      to: {
        path: ['^frontend/src/shared/api/generated/', '^frontend/src/shared/lib/native-contract'],
      },
    },
    {
      name: 'web-ui-atoms-use-no-component',
      severity: 'error',
      comment: 'An atom uses no other component of shared/ui (foundations are not components).',
      from: { path: '^frontend/src/shared/ui/atoms/', pathNot: WEB_TEST },
      to: { path: '^frontend/src/shared/ui/(atoms|molecules|organisms|templates)/' },
    },
    {
      name: 'web-ui-molecules-use-only-atoms',
      severity: 'error',
      comment: 'A molecule is built from atoms only.',
      from: { path: '^frontend/src/shared/ui/molecules/', pathNot: WEB_TEST },
      to: { path: '^frontend/src/shared/ui/(molecules|organisms|templates)/' },
    },
    {
      name: 'web-ui-organisms-use-molecules-and-atoms',
      severity: 'error',
      comment: 'An organism is built from molecules and atoms, never from another organism.',
      from: { path: '^frontend/src/shared/ui/organisms/', pathNot: WEB_TEST },
      to: { path: '^frontend/src/shared/ui/(organisms|templates)/' },
    },
    {
      name: 'web-ui-templates-use-lower-levels',
      severity: 'error',
      comment:
        'A template lays out organisms, molecules and atoms, never another template ' +
        '(and, like all of shared/ui, without data).',
      from: { path: '^frontend/src/shared/ui/templates/', pathNot: WEB_TEST },
      to: { path: '^frontend/src/shared/ui/templates/' },
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
