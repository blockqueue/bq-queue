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

| Path                     | Purpose                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config/*.yml`, `*.yaml` | Scheduler config: **all** YAML files in `SCHEDULER_CONFIG_DIR` are loaded (see root README). Samples: `prj-a-config.sample.yml`, `prj-b-config.sample.yml` |
| `src/index.ts`           | Process entry: load segments → `startBoss` → `createApp` → listen                                                                                          |
| `src/config/load.ts`     | Directory scan, parse, merge queues for API                                                                                                                |
| `src/app.ts`             | `createApp(config)` – Express routes (also used in tests)                                                                                                  |
| `src/queue/boss.ts`      | One pg-boss instance; per-file queues, static crons, workers                                                                                               |
| `src/queue/worker.ts`    | Delivers jobs to each queue’s `endpoint`                                                                                                                   |
| `tests/setup.ts`         | Test env defaults; optional `.env.test`                                                                                                                    |

## Environment

Set `POSTGRES_DATABASE_URL`, `REQUEST_SIGNING_SECRET`, `PORT` (3000–10000), and **`SCHEDULER_CONFIG_DIR`** (directory containing your scheduler YAML files). See the [root README environment section](../../README.md#environment-variables), [scheduler configuration](../../README.md#scheduler-configuration-yaml), and [how `cleanup` applies globally vs per file](../../README.md#cleanup-global-vs-per-project).
