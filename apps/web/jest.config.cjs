/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  watchman: false,
  moduleNameMapper: {
    "\\.(css)$": "<rootDir>/tests/style-mock.cjs",
  },
  testMatch: ["<rootDir>/tests/**/*.test.tsx"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};
