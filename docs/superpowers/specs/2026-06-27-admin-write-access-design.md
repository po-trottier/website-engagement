# Admin Write Access and Read-only Boundary Design

**Date:** 2026-06-27
**Status:** Approved

## Goal

Restore production write access with a distinct credential while ensuring the read-only credential can never create, update, or delete RSVPs.

## Design

- Generate a strong `ADMIN_WRITE_PASSWORD` and store it only in Netlify's production Functions environment.
- Keep `ADMIN_PASSWORD` read-only. Read-only users may view, select, email, and export because those actions do not mutate the RSVP list.
- Keep the server authoritative: every action except `list` requires write mode before RSVP storage is accessed.
- If both configured passwords are accidentally identical, resolve the session as read-only so configuration mistakes cannot elevate privileges.
- Keep the existing client behavior: hide Add, Save, and Delete and render fields read-only/disabled when the server reports read-only mode.

## Verification

- Add one dependency-free `node:test` regression file proving create, update, and delete receive HTTP 403 with the read credential, including the equal-password case.
- Run syntax and test checks locally.
- Probe the deployed function with non-mutating requests: read mode must reject a write-routed action with 403, while the new credential must report write mode.

## Scope

Update the backend boundary and README environment-variable instructions. Add no dependencies and make no unrelated UI changes. Never commit the generated password.
