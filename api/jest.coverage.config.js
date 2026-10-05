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
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testTimeout: 30000,
};
