/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  watchman: false,
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@point-quest/api-client$":
      "<rootDir>/../../packages/api-client/src/index.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "\\.(css)$": "<rootDir>/tests/style-mock.cjs",
  },
  testMatch: ["<rootDir>/tests/**/*.test.tsx"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};
