export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
  setupFilesAfterEnv: ['<rootDir>/src/jest.setup.ts'],
  watchman: false,
};
