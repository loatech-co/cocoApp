/**
 * Coverage of `src/`, measured over the unit AND the e2e suites in one run.
 *
 * Neither alone says how much of the API is exercised: controllers, guards and
 * repositories run only in the e2e suite (against Postgres, never mocked),
 * and the pure rules are cheaper to reach from the unit tests. One run with
 * two projects adds both up before the threshold is checked.
 *
 * `npm run test:cov` runs it; CI fails below the threshold. The threshold
 * only goes up (CONTRIBUTING, «Tests»).
 */
const shared = {
  rootDir: __dirname,
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  moduleNameMapper: {
    '^@coco/lectura$': '<rootDir>/../packages/lectura/src/index.ts',
  },
};

module.exports = {
  projects: [
    { ...shared, displayName: 'unit', roots: ['<rootDir>/src'], testRegex: '.*\\.spec\\.ts$' },
    {
      ...shared,
      displayName: 'e2e',
      roots: ['<rootDir>/test'],
      testRegex: '.e2e-spec\\.ts$',
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      transformIgnorePatterns: ['/node_modules/(?!jose)'],
    },
  ],
  // `src/generated` is the Prisma 7 client, written by `prisma generate`.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/generated/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'json-summary'],
  coverageThreshold: {
    global: { lines: 80, branches: 80 },
    './src/common/money/': { lines: 90, branches: 90, functions: 90, statements: 90 },
  },
  testTimeout: 30000,
};
