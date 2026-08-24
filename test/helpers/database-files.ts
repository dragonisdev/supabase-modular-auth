import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface MigrationFile {
  file: string;
  path: string;
  sql: string;
  version: string;
}

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const databaseRoot = resolve(repositoryRoot, "database");
export const migrationsDirectory = resolve(databaseRoot, "supabase/migrations");

export const migrationFiles: MigrationFile[] = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .toSorted()
  .map((file) => {
    const path = resolve(migrationsDirectory, file);

    return {
      file,
      path,
      sql: readFileSync(path, "utf8"),
      version: file.split("_", 1)[0] ?? "",
    };
  });
