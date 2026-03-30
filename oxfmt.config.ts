import type { FormatOptions } from "oxfmt";

export default {
  ignorePatterns: ["**/node_modules/", "**/dist/", "**/build/", "**/.next/", "**/out/"],
  singleAttributePerLine: true,
  sortImports: {
    groups: [
      "type-import",
      ["value-builtin", "value-external"],
      "type-internal",
      "value-internal",
      ["type-parent", "type-sibling", "type-index"],
      ["value-parent", "value-sibling", "value-index"],
      "unknown",
    ],
  },
  sortTailwindcss: {
    stylesheet: "./frontend/app/globals.css",
    preserveWhitespace: true,
  },
  sortPackageJson: {
    sortScripts: true,
  },
} satisfies FormatOptions;
