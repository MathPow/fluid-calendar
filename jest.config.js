/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  // ts-jest only transpiles. Type-checking in every worker took ~2 GB each and
  // froze a 32 GB machine; `tsc --noEmit` and `next build` check types instead.
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { isolatedModules: true }],
  },
  maxWorkers: "25%",
  // The standalone build copies package.json and would shadow the real one.
  modulePathIgnorePatterns: ["<rootDir>/.next/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["<rootDir>/src/**/__tests__/**/*.test.ts"],
};

module.exports = config;
