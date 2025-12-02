import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: { js },
    extends: ["js/recommended"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      },
    },
  },
  {
    files: ["**/*.test.js", "**/*.spec.js", "**/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest, // ✅ Agrega globales de Jest
      },
    },
  },
]);
