import { PoolClient } from 'pg';

import env from '../../../env';

import { ensureAuthTables, hashPassword } from '../auth-registration.server';
import { getPool } from '../db.server';

async function createUser(
  client: PoolClient,
  authSchema: string,
  email: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  await client.query(
    `
    INSERT INTO "${authSchema}".users (email, password_hash, is_active)
    VALUES ($1, $2, $3)
  `,
    [email, passwordHash, true],
  );
}

async function checkUserExists(
  client: PoolClient,
  authSchema: string,
  email: string,
) {
  const result = await client.query(
    `
    SELECT COUNT(*) FROM "${authSchema}".users WHERE LOWER(email) = LOWER($1)
  `,
    [email],
  );
  return result.rows[0].count > 0 ? result.rows[0].count : 0;
}

(async function () {
  console.log(`🌱 Inserting seed data...`);
  const defaultUserEnabled = env.AUTH_DEFAULT_USER_ENABLED === 'true';
  const defaultUserEmail = env.AUTH_DEFAULT_USER_EMAIL;
  const defaultUserPassword = env.AUTH_DEFAULT_USER_PASSWORD;

  if (!defaultUserEnabled || !defaultUserEmail || !defaultUserPassword) {
    console.log('❌ ');
    return;
  }

  const connectionString = env.DATABASE_URL;
  const authSchema = env.AUTH_SCHEMA || 'auth';

  await ensureAuthTables(connectionString, authSchema);

  const pool = getPool(connectionString);
  const client = await pool.connect();

  try {
    const userExists = await checkUserExists(
      client,
      authSchema,
      defaultUserEmail,
    );

    if (userExists === 0) {
      await createUser(
        client,
        authSchema,
        defaultUserEmail,
        defaultUserPassword,
      );

      client.release();
      console.log('✅ Default user added successfully.');
      process.exit();
    }

    console.log('⚠️ User already exists');
    process.exit();
  } catch (error) {
    console.log('There was an error seeding the default user');
    console.log('❌ Something went wrong');
    client.release();
    process.exit(1);
  }
})();
