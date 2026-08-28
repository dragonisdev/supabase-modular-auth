import SwaggerParser from "@apidevtools/swagger-parser";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

type SecurityRequirement = Record<string, unknown[]>;

interface ReferenceObject {
  $ref: string;
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
}

interface ResponseObject {
  description: string;
  content?: Record<string, { schema?: unknown }>;
  headers?: Record<string, unknown>;
}

interface OperationObject {
  operationId?: string;
  parameters?: Array<ParameterObject | ReferenceObject>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
  security?: SecurityRequirement[];
  tags?: string[];
}

type PathItemObject = Partial<Record<HttpMethod, OperationObject>> & {
  parameters?: Array<ParameterObject | ReferenceObject>;
};

interface OpenApiDocument {
  openapi: string;
  components: {
    parameters?: Record<string, ParameterObject>;
    responses?: Record<string, ResponseObject>;
    securitySchemes?: Record<string, unknown>;
  };
  paths: Record<string, PathItemObject>;
}

interface ContractOperation {
  method: HttpMethod;
  path: string;
  operation: OperationObject;
}

const readFixture = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const specificationText = readFixture("../../docs/api/openapi.yaml");
const specification = parse(specificationText) as OpenApiDocument;

const isHttpMethod = (value: string): value is HttpMethod =>
  HTTP_METHODS.includes(value as HttpMethod);

const getContractOperations = (): ContractOperation[] =>
  Object.entries(specification.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem).flatMap(([method, operation]) => {
      if (!isHttpMethod(method) || !operation || Array.isArray(operation)) {
        return [];
      }

      return [{ method, path, operation }];
    }),
  );

const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const extractExpressOperations = (source: string, prefix = ""): Set<string> => {
  const operations = new Set<string>();
  const routePattern =
    /\b(?:this\.)?(?:app|router)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

  for (const match of source.matchAll(routePattern)) {
    const method = match[1];
    const routePath = match[2];
    if (!method || !routePath || !isHttpMethod(method)) {
      continue;
    }

    const joinedPath = `${prefix}${routePath}`.replace(/\/{2,}/g, "/");
    operations.add(`${method.toUpperCase()} ${toOpenApiPath(joinedPath)}`);
  }

  return operations;
};

const findMountPrefix = (appSource: string, routerSymbol: string): string => {
  const escapedSymbol = routerSymbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mountPattern = new RegExp(
    `this\\.app\\.use\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*,\\s*${escapedSymbol}\\b`,
  );
  const prefix = appSource.match(mountPattern)?.[1];

  if (!prefix) {
    throw new Error(`Could not find the Express mount for ${routerSymbol}`);
  }

  return prefix;
};

const discoverExpressOperations = (): Set<string> => {
  const appSource = readFixture("../../backend/src/app.ts");
  const operations = extractExpressOperations(appSource);
  const routers = [
    {
      symbol: "authRoutes",
      source: readFixture("../../backend/src/routes/auth.routes.ts"),
    },
    {
      symbol: "adminRoutes",
      source: readFixture("../../backend/src/routes/admin.routes.ts"),
    },
  ];

  for (const router of routers) {
    const prefix = findMountPrefix(appSource, router.symbol);
    for (const operation of extractExpressOperations(router.source, prefix)) {
      operations.add(operation);
    }
  }

  return operations;
};

const resolveParameter = (parameter: ParameterObject | ReferenceObject): ParameterObject => {
  if (!("$ref" in parameter)) {
    return parameter;
  }

  const name = parameter.$ref.split("/").at(-1);
  const resolved = name ? specification.components.parameters?.[name] : undefined;
  if (!resolved) {
    throw new Error(`Unresolved parameter reference: ${parameter.$ref}`);
  }

  return resolved;
};

const resolveResponse = (response: ResponseObject | ReferenceObject): ResponseObject => {
  if (!("$ref" in response)) {
    return response;
  }

  const name = response.$ref.split("/").at(-1);
  const resolved = name ? specification.components.responses?.[name] : undefined;
  if (!resolved) {
    throw new Error(`Unresolved response reference: ${response.$ref}`);
  }

  return resolved;
};

describe("OpenAPI contract", () => {
  it("is a valid OpenAPI 3.1 document with resolvable references", async () => {
    expect(specification.openapi).toBe("3.1.0");
    await expect(
      SwaggerParser.validate(
        specification as unknown as Parameters<typeof SwaggerParser.validate>[0],
      ),
    ).resolves.toBeTruthy();
  });

  it("covers every mounted Express route and no stale routes", () => {
    const implemented = [...discoverExpressOperations()].toSorted();
    const documented = getContractOperations()
      .map(({ method, path }) => `${method.toUpperCase()} ${path}`)
      .toSorted();

    expect(documented).toEqual(implemented);
  });

  it("uses unique operation IDs and tags every operation", () => {
    const operations = getContractOperations();
    const operationIds = operations.map(({ operation }) => operation.operationId);

    expect(operationIds.every(Boolean)).toBe(true);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    for (const { operation } of operations) {
      expect(operation.tags?.length).toBeGreaterThan(0);
    }
  });

  it("defines every path parameter as required", () => {
    for (const { path, operation } of getContractOperations()) {
      const expectedNames = [...path.matchAll(/{([^}]+)}/g)].map((match) => match[1]);
      if (expectedNames.length === 0) {
        continue;
      }

      const pathParameters = specification.paths[path]?.parameters ?? [];
      const operationParameters = operation.parameters ?? [];
      const defined = [...pathParameters, ...operationParameters]
        .map(resolveParameter)
        .filter((parameter) => parameter.in === "path");

      expect(defined.map((parameter) => parameter.name).toSorted()).toEqual(
        expectedNames.toSorted(),
      );
      expect(defined.every((parameter) => parameter.required === true)).toBe(true);
    }
  });

  it("requires both CSRF credentials for every unsafe route", () => {
    const unsafeOperations = getContractOperations().filter(({ method }) => method !== "get");

    for (const { method, path, operation } of unsafeOperations) {
      expect(operation.security?.length, `${method.toUpperCase()} ${path}`).toBeGreaterThan(0);
      for (const requirement of operation.security ?? []) {
        expect(requirement, `${method.toUpperCase()} ${path}`).toHaveProperty("csrfCookie");
        expect(requirement, `${method.toUpperCase()} ${path}`).toHaveProperty("csrfHeader");
      }
    }
  });

  it("requires access or refresh authentication on protected routes", () => {
    const protectedOperations = getContractOperations().filter(
      ({ path }) => path === "/auth/me" || path.startsWith("/admin/"),
    );

    for (const { method, path, operation } of protectedOperations) {
      const requirements = operation.security ?? [];
      const label = `${method.toUpperCase()} ${path}`;

      expect(
        requirements.some((requirement) => "accessCookie" in requirement),
        label,
      ).toBe(true);
      expect(
        requirements.some((requirement) => "refreshCookie" in requirement),
        label,
      ).toBe(true);
      expect(
        requirements.every(
          (requirement) => "accessCookie" in requirement || "refreshCookie" in requirement,
        ),
        label,
      ).toBe(true);
    }
  });

  it("defines a typed success or redirect response for every operation", () => {
    for (const { method, path, operation } of getContractOperations()) {
      const successEntry = Object.entries(operation.responses ?? {}).find(([status]) =>
        /^[23]\d\d$/.test(status),
      );
      const label = `${method.toUpperCase()} ${path}`;

      expect(successEntry, label).toBeDefined();
      const [status, responseReference] = successEntry!;
      const response = resolveResponse(responseReference);

      if (status.startsWith("3")) {
        expect(response.headers, label).toHaveProperty("Location");
      } else {
        expect(response.content?.["application/json"]?.schema, label).toBeDefined();
      }
    }
  });
});
