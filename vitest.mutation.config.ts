import { defineConfig } from "vitest/config";

import config from "./vitest.config.ts";

// Mutation runs must remain deterministic even when live-test opt-ins are set.
export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["test/unit/**/*.test.ts", "test/integration/app-security.test.ts"],
  },
});
