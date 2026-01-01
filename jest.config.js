export default {
  testEnvironment: "node",
  testMatch: ["**/*.test.js", "**/*.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { useESM: true }],
  },
  watchman: false,
};
