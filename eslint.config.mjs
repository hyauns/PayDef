import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "public/**",
    "scripts/**",
    // Not app code: vendored third-party templates, local tool/scratch output,
    // the WooCommerce plugin (PHP + its own JS), and one-off root-level scripts.
    "_reference_templates/**",
    ".understand-anything/**",
    ".skill/**",
    ".superpowers/**",
    "plugin woo/**",
    "scratch/**",
    "*.js",
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@next/next/no-html-link-for-pages": "off",
    },
  },
])
