/**
 * Generic migration runner for InstaFin Backend.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="your-DB-password" node scripts/apply-migration.js <number>
 *
 * Example:
 *   SUPABASE_SERVICE_ROLE_KEY="your-DB-password" node scripts/apply-migration.js 21
 *
 * IMPORTANT: despite the env var's name, the pooler needs the project's actual
 * *database* password (Supabase dashboard -> Project Settings -> Database ->
 * Connection string / "Reset database password"), NOT the service_role API
 * key from Project Settings -> API. The two are different secrets; passing
 * the API key here fails with "password authentication failed for user
 * postgres". The env var is only named this way for continuity with earlier
 * migrations in this repo.
 *
 * Applies the SQL from migrations/0NN_*.sql using Supabase's connection pooler
 * (same connection approach as migrate.js). Idempotent when the migration SQL
 * uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 */

import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://sknevfqnfmwjbimdzpjf.supabase.co';
const PROJECT_REF = 'sknevfqnfmwjbimdzpjf';
// Supabase migrated this project's pooler from the "aws-0-" prefix to
// "aws-1-" at some point; "aws-0" now fails with "tenant/user not found"
// even with a valid credential (confirmed by direct testing, 2026-09-04).
const REGION = 'ap-south-1';
const POOLER_PREFIX = 'aws-1';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const migrationNumber = process.argv[2];

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
  console.error('   Run with: SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/apply-migration.js <number>');
  process.exit(1);
}

if (!migrationNumber || !/^\d+$/.test(migrationNumber)) {
  console.error('❌ Please pass a migration number, e.g.: node scripts/apply-migration.js 21');
  process.exit(1);
}

// Find the matching migration file: migrations/0NN_*.sql
const migrationsDir = resolve(__dirname, '../migrations');
const prefix = migrationNumber.padStart(3, '0');
const migrationFile = readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .find(f => f.startsWith(prefix));

if (!migrationFile) {
  console.error(`❌ No migration found for number ${migrationNumber} in ${migrationsDir}`);
  process.exit(1);
}

async function runMigration() {
  const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(serviceRoleKey)}@${POOLER_PREFIX}-${REGION}.pooler.supabase.com:6543/postgres?pgbouncer=true`;

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  const sqlPath = resolve(migrationsDir, migrationFile);
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = await pool.connect();
  try {
    console.log(`🔌 Connected to Supabase via pooler. Running migration ${migrationNumber} (${migrationFile})...`);
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    console.log(`   Applied: ${migrationFile}`);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  // A failure before the try/catch inside runMigration() (e.g. pool.connect()
  // itself rejecting) used to exit silently here with no output at all.
  console.error('❌ Unhandled error:', err.message || err);
  process.exit(1);
});
