---
name: use-railway
description: >
  Operate Railway infrastructure for this repository: authenticate, inspect
  projects and services, review deployments and logs, manage configuration,
  and run the checked-in Railway Infrastructure as Code workflow. Use when a
  task mentions Railway, deployments, service status, logs, variables,
  domains, environments, Railway MCP, or Railway IaC.
allowed-tools: Bash(railway:*), Bash(which:*), Bash(command:*), Bash(npm:*), Bash(npx:*), Bash(curl:*), Bash(python3:*)
---

# Railway operations

Use the Railway MCP server configured in the repository's `.mcp.json` for
remote project, environment, service, deployment, log, status, and
documentation operations. Use the Railway CLI for local repository workflows
such as login, linking, deployment, SSH, and Infrastructure as Code.

This repository's Railway project is a pnpm monorepo. The checked-in
`.railway/railway.ts` definition reconciles the existing backend service only;
it does not create the separately hosted frontend or the external Redis
provider.

## First-run setup

The MCP endpoint uses the user's Railway authorization. Do not commit a
Railway token, variable value, cookie, Supabase key, or Redis credential.

Check the local CLI before using it:

```bash
which railway
railway --version
```

If the CLI is missing, install it using Railway's current installation method.
If the CLI reports that agent tooling is unavailable, use one of these
machine-local setup commands and restart the coding agent afterward:

```bash
railway setup agent --oauth
# or, for the CLI proxy transport:
railway setup agent --remote
```

For ordinary CLI operations, authenticate with:

```bash
railway login
```

`railway agent` requires OAuth authentication. A `RAILWAY_TOKEN` is suitable
for scoped automation such as CI, but must not be used as a substitute for
interactive agent OAuth setup.

## Choose the right interface

- Use Railway MCP for project, environment, service, deployment, log,
  variable metadata, domain, and status queries, and for platform operations
  that need an authenticated remote session.
- Use the CLI for local commands tied to this checkout: `railway login`,
  `railway link`, `railway deploy`, `railway shell`/`railway ssh`, and
  `railway config ...`.
- Use `railway api` only when the MCP and CLI do not expose a required
  GraphQL operation. Keep such requests read-only unless the user explicitly
  requests a change.
- Prefer explicit project, environment, and service IDs returned by Railway.
  Do not guess IDs or rely on whichever project happens to be linked locally.

## Safe inspection sequence

For a deployment or configuration problem, inspect in this order:

1. Identify the project, environment, and service.
2. Check the service status and the latest deployment state.
3. Read build and runtime/deploy logs for the failing deployment.
4. Inspect service configuration and variable names or metadata only; never
   print secret values.
5. Compare the live configuration with `.railway/railway.ts`.
6. Run a plan before proposing or applying a configuration change.

Report the concrete failure stage (source detection, dependency install,
build, health check, startup, runtime, or Railway scheduling) and include the
relevant deployment ID and log evidence when available.

## IaC workflow for this repository

The safe workflow is:

```bash
railway login
railway link
railway config pull
railway config plan
railway config apply
```

Review both the pull and plan before applying. Do not use
`railway config pull --include-variables`: it writes decrypted variable
values into the authoring file. The checked-in definition uses
`preserve()` for existing runtime variables instead.

The GitHub workflow at `.github/workflows/railway-config.yml` plans changes to
`.railway/**` on pull requests and applies the reviewed plan after merge. CI
must receive a project-scoped `RAILWAY_TOKEN` through GitHub Actions secrets;
never put that token in a workflow file or repository variable.

Keep the Railway service root at `/`. The backend build depends on the root
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `types/`, and
`backend/`, so its watch paths must include:

```text
/backend/**
/types/**
/package.json
/pnpm-lock.yaml
/pnpm-workspace.yaml
```

Do not add a frontend or Redis service through this staged backend IaC
definition without first reviewing the topology, cookies, private networking,
and variable changes.

## Safety rules

- Treat deployment, variable, domain, scaling, and database mutations as
  external writes. Make them only when the user has requested the change and
  the target scope is unambiguous.
- Before a write, state the target project/environment/service and the expected
  impact. Prefer a plan or dry run when available.
- Never expose secrets in command output, logs, comments, plans, or reports.
- Do not delete or recreate a service to resolve a failed deployment unless the
  user explicitly authorizes that destructive operation.
- After a write, verify the resulting deployment and health status and report
  any remaining failure separately from the configuration change.

For the complete upstream Railway guidance, see the official
[`use-railway` skill](https://github.com/railwayapp/railway-skills/tree/main/plugins/railway/skills/use-railway),
[Railway agent documentation](https://docs.railway.com/agents), and
[Railway Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code).
