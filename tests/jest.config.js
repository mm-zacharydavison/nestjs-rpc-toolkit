module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**'
  ],
  coverageDirectory: './coverage',
  verbose: true,
  testTimeout: 30000,
  // Run tests sequentially to avoid race conditions when multiple test files
  // run the RpcTypesGenerator and write to the same output files
  maxWorkers: 1
};
