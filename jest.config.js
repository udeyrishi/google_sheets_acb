export default {
  testEnvironment: 'node',
  testMatch: ['**/*.test.js', '**/*.test.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
  watchman: false,
};
