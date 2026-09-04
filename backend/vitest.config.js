import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Pins the test root to this package explicitly so `npm test` here never
// picks up the frontend's vitest.config.ts one directory up.
export default defineConfig({
  root: __dirname,
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    // intakeService defaults to Supabase Storage (correct for real use, see
    // its comment on why) — tests use the local-disk path instead so they
    // don't need a storage mock, matching the fake Supabase client's scope.
    env: { WHATSAPP_INTAKE_STORAGE: 'local' },
  },
});
