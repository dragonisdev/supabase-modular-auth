import { readFile } from "node:fs/promises";
import openapiTS, { astToString, COMMENT_HEADER } from "openapi-typescript";

const specificationUrl = new URL("./openapi.yaml", import.meta.url);
const generatedTypesUrl = new URL("../../types/src/generated/openapi.ts", import.meta.url);

const syntaxTree = await openapiTS(specificationUrl);
const expected = `${COMMENT_HEADER}${astToString(syntaxTree)}`;

let actual;
try {
  actual = await readFile(generatedTypesUrl, "utf8");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    process.stderr.write("Generated OpenAPI types are missing. Run `pnpm api:generate`.\n");
    process.exitCode = 1;
  } else {
    throw error;
  }
}

if (actual !== undefined && actual !== expected) {
  process.stderr.write("Generated OpenAPI types are stale. Run `pnpm api:generate`.\n");
  process.exitCode = 1;
}
