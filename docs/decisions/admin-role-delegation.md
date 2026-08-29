# Admin role delegation

- Status: Accepted direction; superadmin implementation deferred
- Date: 2026-08-29

## Context

The application currently recognizes `admin` and `user`. The first admin requires a manual, environment-specific bootstrap. Afterward, the existing admin API allows an admin to promote another user to admin. There is no distinct `superadmin` role yet.

## Decision

- Admins and superadmins may promote a user to `admin`.
- Only superadmins may grant or revoke `superadmin`.
- Role changes must be authorized by the backend using server-verified Supabase `app_metadata`; client role flags are never trusted.
- Every role change must be recorded in the durable admin audit log.
- Manual SQL remains limited to first-admin bootstrap and operational recovery.

## Consequences

The current admin-to-admin promotion behavior remains valid. Adding `superadmin` later requires updates to shared role schemas, backend authorization, the admin UI, OpenAPI, tests, and safeguards against removing the final superadmin. No `superadmin` behavior is implemented by this decision record alone.
