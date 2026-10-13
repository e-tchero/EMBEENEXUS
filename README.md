# EMBEENEXUS — Clean-Room Workspace

Fresh, empty workspace for the clean-room implementation. This branch is separate from
`main` (the V2 application) so the existing history and code remain untouched.

## Intent

Build the domain and state machines first, in vendor-decoupled code, before committing
to a database schema or web framework (`15_CLEAN_ROOM_ENGINEERING_HANDOFF.md`).

Intended target stack:

- TypeScript domain core (`src/domain`) with no framework imports
- NestJS API
- PostgreSQL 16 + PostGIS as the system of record
- Provider ports for payments and maps (adapters chosen later)

## Status

Workspace initialized. No application code yet.

## Conventions

- Do not guess parameters that the open-decisions register marks as unresolved;
  expose them as configurable server-side rules instead of hard-coded constants.
- Never commit real environment values; keep `.env.example` placeholder-only.
