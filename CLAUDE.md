# CLAUDE.md

# DEAFCS Project Instructions

## Repository safety

Theft may work in parallel on DEAFCS.

Before starting any new task or editing files:

```powershell
git status
git branch --show-current
git fetch origin
git status -sb
git log --oneline -5
```

If the branch is behind and the working tree is clean, use:

```powershell
git pull --ff-only
```

Never reset, overwrite, rebase over, or force-push another contributor's work without explicit approval.

Do not push unless TricoN explicitly asks.

A deployment request counts as approval for the pushes required by that deployment, but not for unrelated commits, repositories, or changes.

Before committing:
- confirm no active Git process
- confirm there is no stale `.git/index.lock`
- use a conventional commit title
- include a useful multi-line commit body for non-trivial work
- report tests/checks run

## Repository locations

Typical local paths:

- Root: `C:\Users\TricoN\Desktop\DEAFCS\`
- Web: `C:\Users\TricoN\Desktop\DEAFCS\deafcs-web`
- API: `C:\Users\TricoN\Desktop\DEAFCS\api-deafcs`

The game-server repo is separate. Do not touch it unless the task requires it.

## Scope discipline

Prefer the smallest correct change.

For web-only work:
- do not touch API
- do not touch Hasura
- do not touch database/schema/migrations
- do not modify package files or `yarn.lock` unless genuinely required

Avoid Hasura/database work unless absolutely necessary, and warn before any unavoidable schema/metadata work.

## Production web deployment

For any production deployment of `deafcs-web`, ALWAYS read and follow:

`DEAFCS_WEB_DEPLOYMENT_SIMPLE.md`

Do this before running Docker, registry, SSH, Kubernetes, rollout, or deployment commands.

The deployment guide is the source of truth for the current web release process.

At minimum, every production web deployment must:

1. Verify Git is clean and synchronized.
2. Check Docker is available.
3. Confirm GHCR authentication.
4. Verify SSH access to the production VPS.
5. Inspect the live Kubernetes web deployment read-only before modifying anything.
6. Confirm the actual namespace, Deployment, container, image, and imagePullPolicy rather than guessing.
7. Capture the current running web image digest when practical.
8. Build the production web Docker image.
9. Push the image successfully before restarting production.
10. Restart ONLY the intended web Deployment.
11. Wait for rollout success.
12. Verify the new pod is Ready and running the newly pushed image/digest.
13. Test the affected production routes.
14. Confirm unrelated workloads were untouched.

Never expose:
- GitHub PATs
- registry credentials
- SSH private keys
- Kubernetes Secret values
- passwords/tokens

Never guess infrastructure values when they can be checked from the live cluster.

For a normal web-only deployment, do not restart or modify:
- API
- Hasura
- TimescaleDB/database
- Redis
- MinIO
- Typesense
- demo-parser
- MediaMTX
- game servers

## Current known web deployment reference

These values are useful context, but the live cluster must still be checked before deployment:

- Image: `ghcr.io/deafcs/web:latest`
- Namespace: `5stack`
- Deployment: `web`
- Service: `web`
- Container: `web`
- Image pull policy: `Always`
- Production site: `https://deafcs.net`
- Release pattern: build -> push `latest` -> rollout restart web -> verify digest -> test production

If live production differs from this reference, trust the live cluster and stop to report the difference before making changes.

## Production API / Hasura deployment

Confirmed from the live production cluster and current `api-deafcs` source. Future sessions should verify only if deployment configuration has actually changed, not re-investigate from scratch every time.

### Production Kubernetes

- Namespace: `5stack`
- API Deployment: `api`
- API container name: `api`
- API image: `ghcr.io/deafcs/api:latest`
- API imagePullPolicy: `Always`
- API serviceAccountName: `server-creator`
- API health endpoint: `/system/healthz` on port `5585`
- Hasura Deployment: `hasura`
- Hasura Service: `hasura`, port `8080`
- Production cluster commands are run on the VPS using: `sudo -n kubectl ...`

### Production database connection facts

Confirmed live on the production TimescaleDB setup:

- PostgreSQL database: `hasura`
- PostgreSQL user: `hasura`
- TimescaleDB StatefulSet: `timescaledb`
- Current TimescaleDB pod observed during verification: `timescaledb-0`
- Production does not currently have a `postgres` role, so do not assume `-U postgres` will work.

For read-only production verification from inside the database pod, use the confirmed database/user:

sudo -n kubectl exec -n 5stack timescaledb-0 -- psql -U hasura -d hasura ...

If the TimescaleDB pod has been recreated, first re-check the current pod name:

sudo -n kubectl get pods -n 5stack | grep -i timescale

Do not store, print, or paste database passwords, full PostgreSQL connection strings, or other Secret values into `CLAUDE.md` / `CODEX.md`.

The database credentials/config are provided through the production Kubernetes Secret:
`timescaledb-secrets-gt9748kthh`

Secret/ConfigMap names are safe to document. Secret values are not.

### API production envFrom (current, confirmed live)

- `api-config-hht89h5526`
- `api-secrets-8tfbt456f9`
- `steam-secrets-4865t59ccd`
- `hasura-secrets-b8hm7h4kh9`
- `typesense-secrets-82gdfkftkd`
- `discord-secrets-9hd5t4chtf`
- `redis-secrets-4k9bbt6655`
- `timescaledb-secrets-gt9748kthh`
- `tailscale-secrets-426f262df5`
- `s3-secrets-mgm88d5mg5`
- `s3-config-2c64h9t79t`
- `faceit-secrets-4khm66f5mm`
- `push-secrets-m7bm7tggkg`

These are current production Secret/ConfigMap *names* only. Never record secret/config *values* here.

### Database / Hasura setup

- `RUN_MIGRATIONS=true` is implemented in `api-deafcs` `src/main.ts`.
- A `RUN_MIGRATIONS` execution runs `hasura.setup()`.
- `hasura.setup()` applies, in order:
  1. database migrations
  2. enums
  3. SQL functions
  4. views
  5. triggers
  6. settings
- Therefore SQL function/trigger changes bundled in `api-deafcs` are applied by the same migration-mode API run.
- Hasura metadata is separate and is NOT applied by `hasura.setup()`.
- Hasura metadata must therefore be applied separately.
- The API Docker image contains the repo's `hasura/` directory, so a new API image must be built/pushed before running `RUN_MIGRATIONS` for newly added migrations/functions/triggers.
- Do not run migrations using an old production API image.

### Production jobs

- `m-*` Kubernetes Jobs are NOT migration jobs.
- They are per-match game-server provisioning jobs created by `MatchAssistantService` using IDs like `m-${matchId}`.
- `postgres-backup` is only the database backup CronJob.
- There is currently no confirmed reusable production migration Job/CronJob.
- Do not reuse `m-*` jobs for migrations.

### Known ingress

- `api.deafcs.net` is used by API/Hasura ingress resources.
- Do not guess Hasura path routing. Inspect the Hasura ingress if its exact path is needed.

### Safety rules

- Before API deployment, run `git status`/`git fetch` and protect parallel work.
- Never reset/rebase/discard Theft's work.
- Do not invent migration commands.
- For DB/Hasura changes, inspect the current deployment procedure first if anything materially changed.
- Record the currently running API image digest before deployment for rollback.
- Apply API/Hasura schema changes BEFORE deploying web code that queries new GraphQL fields.
- For a new GraphQL field, safe order is:
  1. build/push new API image
  2. run API migration mode using the new image
  3. apply Hasura metadata
  4. verify live schema/health
  5. run `deafcs-web` codegen
  6. test web
  7. deploy web

### Historical rollback reference

Current running API image digest recorded immediately before the tournament check-in-timeout deployment (commit `89fc016`, 2026-08-19):

```
ghcr.io/deafcs/api@sha256:7a4334f6ae199adb3337f80a72645da7db855808730e8eeb5079730f29dfd731
```

This is a **historical rollback reference for that specific deployment only**, not a permanent/current digest. Always re-verify the live running digest before relying on it for a rollback.

Never expose:
- GitHub PATs
- registry credentials
- SSH private keys
- Kubernetes Secret values
- passwords/tokens

## DEAFCS writing style

Avoid em dashes (`—`) in all user-facing DEAFCS text.

Use instead:
- a comma
- a period
- a colon
- parentheses
- a normal hyphen only when grammatically appropriate

Prefer shorter, natural sentences rather than joining thoughts with an em dash.

Before committing user-facing copy, search changed files for `—` and replace it where appropriate.

Do not change:
- code syntax
- URLs
- third-party quoted text
- generated data

unless the em dash is part of DEAFCS-authored user-facing copy.

## GitHub Issues / Checklists

DEAFCS uses GitHub issues as the active project checklist and source of truth for current task status.

Important:
- Before starting a task, check GitHub for an existing relevant issue/checklist and read its current state before planning or editing.
- Use GitHub issues for context so work stays aligned with the current DEAFCS plan.
- Do not hardcode issue numbers in this file because issues may be reorganized over time.
- Do not create, edit, reorganize, close, or mark GitHub checklist items complete unless TricoN explicitly asks you to do so.
- After completing work, report which GitHub checklist items appear ready to be marked complete.
- Do not consider an item complete merely because code was written. Prefer actual testing, production verification, and TricoN's confirmation when appropriate.
- If work appears to belong to a different feature area, report that a separate issue may be more appropriate instead of modifying GitHub yourself.
- ChatGPT in the DEAFCS project normally maintains and reorganizes GitHub issues/checklists after TricoN verifies the result.

## Final deployment rule

**Inspect first -> build -> push -> restart only the intended workload -> verify the running digest -> test production.**

Do not start another task automatically after a production deployment. Stop and report the result.

## Claude-specific working style

For Claude work on DEAFCS:
- inspect before editing
- keep diffs narrow
- preserve Theft's parallel work
- run relevant tests/checks
- review the final diff before commit
- do not push unless explicitly requested
- do not assume deployment details from memory when they can be checked live

When TricoN asks for deployment, always read `DEAFCS_WEB_DEPLOYMENT_SIMPLE.md` first.

Do not invent registry, Docker, SSH, Kubernetes, image-tag, or rollout commands.
