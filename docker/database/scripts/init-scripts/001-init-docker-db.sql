DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE USER postgres SUPERUSER;
    END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS bq_queue;
