import apiConfig from "./apps/api/eslint.config.mjs";
import tseslint from "./apps/api/node_modules/typescript-eslint/dist/index.js";

export default [
  ...apiConfig,
  tseslint.configs.disableTypeChecked,
  {
    languageOptions: {
      sourceType: "module",
    },
    rules: {
      "no-empty-pattern": "off",
    },
  },
];
