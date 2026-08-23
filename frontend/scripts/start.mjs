import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const port = process.env.PORT?.trim() || "3001";

const child = spawn(process.execPath, [nextCli, "start", "--port", port], {
  env: { ...process.env, PORT: port },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error("Failed to start Next.js", error);
  process.exit(1);
});

child.once("exit", (code) => {
  process.exit(code ?? 0);
});
