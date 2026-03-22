# Queue service

HTTP API + pg-boss workers for Blockqueue. **Full documentation** (architecture, API, signing, config, Docker, tests) is in the **[repository root README](../../README.md)**.

## Quick commands

From this directory (`apps/queue-service`):

| Command                         | Description                                      |
| ------------------------------- | ------------------------------------------------ |
| `npm run dev`                   | Development (nodemon)                            |
| `npm run build`                 | `tsc` → `dist/`                                  |
| `npm run start`                 | `node dist/index.js`                             |
| `npm run lint`                  | ESLint + `tsc --noEmit`                          |
| `npm run test`                  | Vitest (`tests/unit`, `tests/integration`)       |
| `npm run db:generate:migration` | Drizzle: generate migration after schema changes |
| `npm run db:apply:migration`    | Apply migrations                                 |

## Paths

| Path                  | Purpose                                                         |
| --------------------- | --------------------------------------------------------------- |
| `config/config.yml`   | Scheduler config (copy from `config.sample.yml`)                |
| `src/index.ts`        | Process entry: load config → `startBoss` → `createApp` → listen |
| `src/app.ts`          | `createApp(config)` – Express routes (also used in tests)       |
| `src/queue/boss.ts`   | pg-boss lifecycle, queues, static crons, workers                |
| `src/queue/worker.ts` | Delivers jobs to each queue’s `endpoint`                        |
| `tests/setup.ts`      | Test env defaults; optional `.env.test`                         |

## Environment

Set at least `POSTGRES_DATABASE_URL`, `API_SIGNING_SECRET`, and `PORT` (3000–10000). See the [root README environment section](../../README.md#environment-variables).
