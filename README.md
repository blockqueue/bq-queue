# bq-queue

**bq-queue** is a monorepo for **Blockqueue** queue scheduling. The main deliverable is **queue-service**: an [Express](https://expressjs.com/) HTTP API that enqueues work in [pg-boss](https://timgit.github.io/pg-boss/) (PostgreSQL-backed job queues) and runs **workers** that deliver signed HTTP requests to URLs you configure per queue.

Use it when you want a single place to schedule jobs, retry failures, and fan out work to internal HTTP services—without each service implementing its own queue.

---

## Table of contents

1. [Architecture](#architecture)
2. [Repository layout](#repository-layout)
3. [Prerequisites](#prerequisites)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Scheduler configuration (YAML)](#scheduler-configuration-yaml)
7. [HTTP API](#http-api)
8. [Authenticating requests to the queue service](#authenticating-requests-to-the-queue-service)
9. [What your downstream endpoint receives](#what-your-downstream-endpoint-receives)
10. [Idempotency](#idempotency)
11. [Static cron jobs (config)](#static-cron-jobs-config)
12. [Database and migrations](#database-and-migrations)
13. [Docker](#docker)
14. [Development](#development)
15. [Testing](#testing)

---

## Architecture

```mermaid
flowchart LR
  subgraph clients [Clients]
    App[Your app / cron / admin]
  end
  subgraph qs [queue-service]
    API[Express API]
    Boss[pg-boss]
    W[Workers]
  end
  subgraph pg [PostgreSQL]
    PB[pg-boss tables]
    AppDB[App schema job_idempotency]
  end
  subgraph downstream [Your services]
    H1[Webhook handler]
    H2[Another handler]
  end
  App -->|signed JSON| API
  API --> Boss
  Boss --> PB
  API --> AppDB
  Boss --> W
  W -->|signed POST| H1
  W -->|signed POST| H2
```

1. **Clients** call the queue service over HTTPS (or HTTP in dev) with a **signed** JSON body.
2. **pg-boss** stores jobs and drives retries, concurrency, and retention according to config.
3. **Workers** (registered per queue) `fetch` the queue’s `endpoint`, sending a **different** signature (per-queue `signature_secret`) so your service can verify the caller.

---

## Repository layout

| Path                          | Purpose                                                   |
| ----------------------------- | --------------------------------------------------------- |
| `apps/queue-service/`         | Queue service source, `config/`, tests under `tests/`     |
| `packages/eslint-config/`     | Shared ESLint config                                      |
| `packages/typescript-config/` | Shared TypeScript config                                  |
| `docker/`                     | Dockerfiles, compose fragments, DB/dashboard env examples |

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** (workspaces)
- **PostgreSQL** reachable by the service (same DB used by pg-boss and Drizzle migrations)

---

## Quick start

```bash
git clone <your-repo-url> bq-queue
cd bq-queue
npm install
```

### 1. Database

Create a database and user, or use Docker (see [Docker](#docker)). You need a connection string for `POSTGRES_DATABASE_URL`.

### 2. Queue service environment

From `apps/queue-service/`, copy env and config:

```bash
cd apps/queue-service
# Create .env with at least POSTGRES_DATABASE_URL, API_SIGNING_SECRET, PORT (3000–10000)
cp config/config.sample.yml config/config.yml
# Edit config.yml: set queues, endpoints, and secrets (or ${VAR} placeholders)
```

Apply migrations (after setting `POSTGRES_DATABASE_URL`):

```bash
npm run db:apply:migration
```

### 3. Build and run

```bash
# From apps/queue-service
npm run build
npm run start
# Or from repo root after build
npx turbo run start --filter=queue-service
```

The service listens on `PORT` (default must be in the 3000–10000 range per validation).

### 4. Call the API

Use the signing flow in [Authenticating requests to the queue service](#authenticating-requests-to-the-queue-service). Example: enqueue a one-off job with `POST /api/jobs/one-off`.

---

## Environment variables

Loaded via `dotenv` from `.env` when present. All are validated at startup (`src/env.ts`).

| Variable                | Required  | Description                                                                                                                        |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_DATABASE_URL` | **Yes**   | PostgreSQL connection URL for pg-boss and app tables                                                                               |
| `API_SIGNING_SECRET`    | **Yes**   | Shared secret for **incoming** requests to `/api/jobs/*` (HMAC signature)                                                          |
| `PORT`                  | **Yes\*** | HTTP port; must be between **3000 and 10000** (inclusive). Set explicitly if unset defaults break validation                       |
| `NODE_ENV`              | No        | `development` \| `production` \| `test` (default `development`)                                                                    |
| `POSTGRES_SSL`          | No        | If `true`, connects with TLS (`rejectUnauthorized: false` for dev-style setups)                                                    |
| `DB_SCHEMA`             | No        | PostgreSQL schema for app tables (default `bq_queue`). Migrations use this schema                                                  |
| `SCHEDULER_CONFIG_PATH` | No        | Path to YAML config file or directory containing `config.yml`. Defaults to `config/config.yml` under the process working directory |

\*If `PORT` is missing, ensure your environment sets a valid port in range.

---

## Scheduler configuration (YAML)

Path: `config/config.yml` by default, or `SCHEDULER_CONFIG_PATH`. Values support **`${ENV_VAR}`** substitution (see `src/config/substituteEnv.ts`).

### Top-level keys

| Key         | Required | Description                                                                                                                                                                           |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `queues`    | **Yes**  | Map of queue name → queue definition. **Only these names** are accepted by the one-off and schedule APIs                                                                              |
| `global`    | No       | Defaults applied to queues: `default_queue_concurrency`, `max_concurrent_jobs`, `retryLimit`, `retryDelay`, `retryBackoff`, `expireInSeconds` (used when a queue omits its own), etc. |
| `cron_jobs` | No       | Static schedules; each entry must reference a `queue` defined in `queues`                                                                                                             |
| `cleanup`   | No       | pg-boss maintenance and per-queue retention (see sample file and `src/config/schema.ts`)                                                                                              |

### `queues.<name>` (each queue)

| Field                                      | Required | Description                                                                                       |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------- |
| `endpoint`                                 | Yes      | URL the worker calls when a job runs                                                              |
| `signature_secret`                         | Yes      | Secret used to sign **outbound** requests to `endpoint` (header `X-Signature`)                    |
| `method`                                   | No       | HTTP method (default `POST`)                                                                      |
| `max_concurrent_jobs`                      | No       | Concurrency for this queue (overrides `global.default_queue_concurrency` / `max_concurrent_jobs`) |
| `retryLimit`, `retryDelay`, `retryBackoff` | No       | Retry behaviour for failed deliveries                                                             |
| `expireInSeconds`                          | No       | Job expiry (≥ 1 if set)                                                                           |
| `wait_interval_after_success_seconds`      | No       | Optional delay after a successful HTTP response before completing the job                         |
| `description`                              | No       | Documentation only                                                                                |

See [`apps/queue-service/config/config.sample.yml`](apps/queue-service/config/config.sample.yml) for a full commented example.

---

## HTTP API

Base URL: `http://localhost:<PORT>` (or your deployment URL).
All job endpoints expect **`Content-Type: application/json`** and a **raw JSON body** (the server uses `express.raw` so the body bytes match the signature—do not send pretty-printed JSON unless that exact string was signed).

### `GET /api/health`

|             |                                                 |
| ----------- | ----------------------------------------------- |
| **Purpose** | Liveness: pg-boss instance is ready             |
| **200**     | `{ "ok": true }`                                |
| **503**     | `{ "ok": false }` if pg-boss is not initialized |

No signature required.

---

### `POST /api/jobs/one-off`

Enqueue a single job immediately.

**Headers:** `x-bq-queue-request-signature` (required), `Content-Type: application/json`

**Body (JSON):**

| Field            | Type   | Required | Description                                                        |
| ---------------- | ------ | -------- | ------------------------------------------------------------------ |
| `idempotencyKey` | string | Yes      | Non-empty; used to dedupe and replace prior jobs with the same key |
| `queue`          | string | Yes      | Must exist in `config.queues`                                      |
| `payload`        | object | No       | Arbitrary JSON object; forwarded inside the job (default `{}`)     |

**Responses:**

| Status | Meaning                           |
| ------ | --------------------------------- |
| `202`  | `{ "jobId": "<pg-boss job id>" }` |
| `400`  | Validation or unknown `queue`     |
| `401`  | Invalid or missing signature      |
| `503`  | pg-boss unavailable               |
| `500`  | Failed to enqueue                 |

---

### `POST /api/jobs/schedule`

Schedule the next run from a cron expression (stored as a delayed job).

**Headers:** same as one-off.

**Body (JSON):**

| Field            | Type   | Required | Description                                                                          |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------ |
| `idempotencyKey` | string | Yes      | Non-empty                                                                            |
| `queue`          | string | Yes      | Must exist in `config.queues`                                                        |
| `schedule`       | string | Yes      | Cron expression (parsed with timezone)                                               |
| `timezone`       | string | No       | IANA timezone (default `UTC`)                                                        |
| `payload`        | object | No       | Merged into job data; `idempotencyKey` is always included in the payload for workers |

**Responses:**

| Status | Meaning                                      |
| ------ | -------------------------------------------- |
| `201`  | `{ "id": "<idempotencyKey>" }`               |
| `400`  | Invalid body, unknown queue, or invalid cron |
| `401`  | Signature                                    |
| `503`  | pg-boss unavailable                          |
| `500`  | Failed to schedule                           |

---

### `POST /api/jobs/delete`

Cancel the pg-boss job and remove the idempotency row for a key.

**Headers:** same as one-off.

**Body (JSON):**

| Field            | Type   | Required           |
| ---------------- | ------ | ------------------ |
| `idempotencyKey` | string | Yes (min length 1) |

**Responses:**

| Status | Meaning                            |
| ------ | ---------------------------------- |
| `200`  | `{ "deleted": true }`              |
| `400`  | Invalid body                       |
| `404`  | No idempotency record for that key |
| `401`  | Signature                          |

---

## Authenticating requests to the queue service

Incoming job requests must include header:

```http
x-bq-queue-request-signature: t=<unix_seconds>,v1=<hmac>
```

- **Algorithm:** HMAC-SHA512 by default (see `src/utils/verifySignature.ts` for optional `sha256` / encodings).
- **Message:** `<timestamp>.` + **exact** raw body string (UTF-8).
- **Timestamp:** Unix **seconds** (not milliseconds). Default tolerance: **±300 seconds** from server time.

To build the header in Node (same helpers as tests):

```ts
import { createSignature } from './path/to/createSignature'; // or reimplement

const body = JSON.stringify({
  idempotencyKey: 'my-key',
  queue: 'MY_QUEUE',
  payload: {},
});
const header = createSignature({
  payload: body,
  secret: process.env.API_SIGNING_SECRET!,
});
// fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bq-queue-request-signature': header }, body })
```

---

## What your downstream endpoint receives

When a job runs, the worker POSTs (by default) to `queues.<name>.endpoint` with:

| Header         | Value                                                                                 |
| -------------- | ------------------------------------------------------------------------------------- |
| `Content-Type` | `application/json`                                                                    |
| `X-Signature`  | `t=...,v1=...` using **`signature_secret`** for that queue (not `API_SIGNING_SECRET`) |

**Body:** JSON string of either:

- `{ "timestamp": <unix>, "data": <payload> }` for object payloads, or
- the raw payload encoding for non-object data

Verify `X-Signature` the same way (HMAC over `timestamp + "." + body` with the queue’s `signature_secret`). Request timeout is **2 minutes**.

---

## Idempotency

- Rows are stored in PostgreSQL (`job_idempotency` in schema `DB_SCHEMA`, default `bq_queue`).
- **One-off:** `idempotencyKey` maps to the pg-boss job id; resubmitting replaces the previous job after cancel/delete of the old record.
- **Schedule:** same key; dynamic schedules include `idempotencyKey` in the job payload; after success, dynamic cleanup can remove the row (see worker + boss integration).
- **Delete:** removes the row and cancels the boss job when possible.

---

## Static cron jobs (config)

Under `cron_jobs`, each item needs:

- `name` – unique key for pg-boss scheduling
- `queue` – must match a key in `queues`
- `schedule` – cron string
- `timezone` – optional, default `UTC`
- `payload` – optional object passed into the scheduled job

On startup, the service calls pg-boss `schedule()` for each entry. Invalid `queue` references fail at config load time.

---

## Database and migrations

- **App tables:** Drizzle schema in `apps/queue-service/src/db/schema/`.
- **Migrations:** `apps/queue-service/src/db/migrations/`.

Commands (from `apps/queue-service`):

```bash
npm run db:generate:migration   # after editing schema
npm run db:apply:migration    # apply migrations
```

Set `POSTGRES_DATABASE_URL` (and optionally `DB_SCHEMA`). pg-boss creates its own schema/tables on first use.

---

## Docker

[`docker-compose.yml`](docker-compose.yml) includes:

- **database** – PostgreSQL (see `docker/database/.env`)
- **pg-boss-dashboard** – monitoring UI (port **3000**)
- **queue-service-dev** – dev image mounting `apps/queue-service` (port **9000** in compose); requires `apps/queue-service/.env`

Adjust ports and env files to match your setup. Start order: database healthy → other services.

---

## Development

| Command                   | Where                | Description                               |
| ------------------------- | -------------------- | ----------------------------------------- |
| `npm install`             | repo root            | Install all workspaces                    |
| `npm run build`           | root                 | `turbo run build`                         |
| `npm run dev`             | root                 | `turbo run dev`                           |
| `npm run lint`            | root                 | `turbo run lint`                          |
| `npm run test`            | root                 | `turbo run test`                          |
| `npm run dev`             | `apps/queue-service` | nodemon (see app `package.json`)          |
| `npm run build` / `start` | `apps/queue-service` | TypeScript compile / `node dist/index.js` |

Use a `.env` in `apps/queue-service` for local runs.

---

## Testing

Tests live under **`apps/queue-service/tests/`**:

- `tests/unit/` – unit tests
- `tests/integration/` – HTTP integration tests with `createApp`

```bash
cd apps/queue-service
npm run test
```

Optional `apps/queue-service/.env.test` is loaded by `tests/setup.ts` for CI/local parity.

---

## Useful links

- [pg-boss documentation](https://timgit.github.io/pg-boss/)
- [Turborepo](https://turborepo.com/docs)

---

## App-specific quick reference

See **[apps/queue-service/README.md](apps/queue-service/README.md)** for paths and scripts in one place.
