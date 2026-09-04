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
  },
});
