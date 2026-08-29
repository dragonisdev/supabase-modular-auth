import { spawn } from "node:child_process";
import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationsDirectory = resolve(repositoryRoot, "supabase", "migrations");
const checkMigrationName = "schema_drift_check";
const checkMigrationSuffix = `_${checkMigrationName}.sql`;

const listMigrationFiles = async () =>
  new Set((await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")));

const runSchemaDiff = async () =>
  new Promise((resolvePromise, reject) => {
    const supabaseArguments = [
      "db",
      "schema",
      "declarative",
      "sync",
      "--strict-coverage",
      "--no-apply",
      "--name",
      checkMigrationName,
    ];
    const isWindows = process.platform === "win32";
    const executable = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "supabase";
    const arguments_ = isWindows
      ? ["/d", "/s", "/c", ["supabase", ...supabaseArguments].join(" ")]
      : supabaseArguments;
    const command = spawn(executable, arguments_, {
      cwd: repositoryRoot,
      stdio: "inherit",
    });

    command.once("error", reject);
    command.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Supabase schema diff terminated by signal ${signal}`));
        return;
      }

      resolvePromise(code ?? 1);
    });
  });

const migrationsBefore = await listMigrationFiles();
let exitCode = 1;

try {
  exitCode = await runSchemaDiff();
} finally {
  const migrationsAfter = await listMigrationFiles();
  const generatedByCheck = [...migrationsAfter].filter(
    (file) => !migrationsBefore.has(file) && file.endsWith(checkMigrationSuffix),
  );

  if (exitCode === 0 && generatedByCheck.length > 0) {
    console.error(
      "Declarative schema drift detected. Generate and review a named migration with " +
        "`pnpm supabase:schema:diff --name <name>`.",
    );
    exitCode = 1;
  } else if (exitCode === 0) {
    console.log("Declarative Supabase schema matches the committed migration history.");
  }

  await Promise.all(
    generatedByCheck.map((file) => rm(resolve(migrationsDirectory, file), { force: true })),
  );
}

process.exitCode = exitCode;
