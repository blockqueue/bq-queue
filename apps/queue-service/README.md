# BQ Queue Scheduler Queue Service

Handles Scheduling, queueing services for blockqueue

## Packages

- [PG Boss](https://timgit.github.io/pg-boss/)
- PostgresSql
- [Express](https://expressjs.com/)

## Setup

### Environment

- `API_SIGNING_SECRET` – Required. Used to verify signed requests to job endpoints.
- `SCHEDULER_CONFIG_PATH` – Optional. Path to scheduler YAML; defaults to `config/config.yml`.
- `POSTGRES_DATABASE_URL` – Postgres connection string (used by pg-boss and app DB).

### Config

Copy `config/scheduler.sample.yml` to `config/config.yml` (or set `SCHEDULER_CONFIG_PATH`) and define queues, optional static crons, and cleanup. Queue names in the config are the only ones accepted for one-off and schedule APIs.

### Database migrations (Drizzle Kit)

Migrations live in `src/db/migrations/` and run automatically on app startup. App tables and the migrations journal use the schema named by `DB_SCHEMA` (default: `bq_queue`). From this app directory:

- **Generate** a new migration after changing `src/db/schema.ts`:  
  `npm run db:generate`
- **Run** migrations via CLI (optional; app also runs them on startup):  
  `npm run db:migrate`
- **Push** schema directly without migration files (dev only):  
  `npm run db:push`
- **Studio** (DB UI):  
  `npm run db:studio`

Set `POSTGRES_DATABASE_URL` (e.g. in `.env`) when using these commands. Optionally set `DB_SCHEMA` to use a different schema (default: `bq_queue`).

### pg-boss dashboard (local)

The [official pg-boss dashboard](https://github.com/timgit/pg-boss/tree/master/packages/dashboard) lets you monitor queues and jobs in the browser.

**From this app directory (requires Node 22.12+):**

```bash
# Use the same URL as your queue service (e.g. from .env)
DATABASE_URL="postgres://user:password@localhost:5432/database" npm run dashboard
```

Then open **http://localhost:3000**. Optional: set `PGBOSS_SCHEMA` if pg-boss uses a non-default schema (default is `pgboss`).

**With Docker Compose:** start the stack and open http://localhost:3000; the `pg-boss-dashboard` service uses the same database as the queue service.

### Local

### Docker
