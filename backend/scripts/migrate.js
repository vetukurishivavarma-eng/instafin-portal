/**
 * Migration script for InstaFin Backend
 * 
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY="..." node scripts/migrate.js
 * 
 * This script uses Supabase's connection pooler (pgbouncer) to run DDL migrations.
 * The service role key is used as the password with the postgres user via pooler.
 * 
 * Connection format:
 *   postgresql://postgres.{PROJECT_REF}:{SERVICE_ROLE_KEY}@aws-0-{REGION}.pooler.supabase.com:6543/postgres
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://sknevfqnfmwjbimdzpjf.supabase.co';
const PROJECT_REF = 'sknevfqnfmwjbimdzpjf';
const REGION = 'ap-south-1'; // Adjust if needed (common: ap-south-1, us-east-1, eu-west-1)

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
  console.error('');
  console.error('To run this migration, you have two options:');
  console.error('');
  console.error('Option 1: Set the env var and run this script:');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="your-key" node scripts/migrate.js');
  console.error('');
  console.error('Option 2: Run the SQL directly in Supabase Dashboard SQL Editor:');
  console.error('  1. Go to https://supabase.com/dashboard/project/sknevfqnfmwjbimdzpjf');
  console.error('  2. Open the SQL Editor');
  console.error('  3. Paste the contents of migrations/001_drop_unique_constraint.sql');
  console.error('  4. Click Run');
  console.error('');
  process.exit(1);
}

async function runMigration() {
  const connectionString = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(serviceRoleKey)}@aws-0-${REGION}.pooler.supabase.com:6543/postgres?pgbouncer=true`;

  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  const sqlPath = resolve(__dirname, '../migrations/001_drop_unique_constraint.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = await pool.connect();
  try {
    console.log('🔌 Connected to Supabase via pooler. Running migration...');
    await client.query(sql);
    console.log('✅ Migration completed successfully!');
    console.log('   Dropped constraint: lead_checklist_status_lead_id_document_id_key');
    console.log('   Multiple file uploads per document are now allowed.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    if (err.message.includes('does not exist') || err.message.includes('already exists')) {
      console.log('   (This may mean the constraint was already dropped or never existed)');
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch(() => process.exit(1));
