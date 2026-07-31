#!/usr/bin/env node
/**
 * End-to-end smoke test for GET /api/archives/leads/:leadId/zip
 *
 * What it does:
 *   1. Boots the REAL backend server on a test port (catches boot-time ESM
 *      import failures like the archiver v8 default-export issue).
 *   2. Authenticates with a self-issued admin JWT (the archives routes only
 *      check req.user.role for admin, so no user DB lookup is needed).
 *   3. Seeds a fixture lead and uploads a tiny PNG through the real API
 *      surface (POST /api/leads + POST /api/checklist-status/upload).
 *   4. Downloads the ZIP and verifies:
 *        - response is a valid ZIP (200 + PK\x03\x04 magic bytes)
 *        - an end-of-central-directory record exists
 *        - the ZIP is organized into section folders (e.g. "KYC Documents/")
 *        - the uploaded file name appears inside the ZIP
 *   5. Exercises error paths: 401 without a token, 404 for an unknown lead.
 *   6. Cleans up the seeded lead + document.
 *
 * Usage (run from backend/):
 *   node scripts/smoke-test-archives.js
 *   SMOKE_PORT=4321 node scripts/smoke-test-archives.js
 *   SMOKE_BOOT_TIMEOUT_MS=30000 node scripts/smoke-test-archives.js
 *   SMOKE_SKIP_SEED=1 node scripts/smoke-test-archives.js   # verify auth/error paths only
 *
 * Exit code 0 = all checks passed, 1 = at least one check failed.
 *
 * NOTE: This test seeds a fixture lead + document through the real API against
 * the Supabase project configured in backend/src/lib/supabase.js (the baked-in
 * anon key). Cleanup is best-effort — only run it against a dev/staging
 * environment, not production.
 */

import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const SKIP_SEED = process.env.SMOKE_SKIP_SEED === '1';
const JWT_SECRET = process.env.JWT_SECRET || 'instafin-dev-secret-2024';

// 1x1 transparent PNG (valid image, passes the multer image/png filter)
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const results = [];
let serverProc = null;
let seedLeadId = null;
let seedFileId = null;

function record(name, ok, detail = '') {
  results.push({ name, ok });
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Pick a free port so leftover processes from a previous run can't cause a port conflict.
function getFreePort() {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', () => resolve(3999)); // fallback
  });
}

async function waitForServer(baseUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

function adminToken() {
  return jwt.sign(
    { id: 'smoke-test-admin', email: 'smoke-admin@instafin.local', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

async function main() {
  const PORT = Number(process.env.SMOKE_PORT || (await getFreePort()));
  const BOOT_TIMEOUT_MS = Number(process.env.SMOKE_BOOT_TIMEOUT_MS || 20000);
  const BASE_URL = `http://127.0.0.1:${PORT}`;

  try {
    // ── 1. Boot the real server ──────────────────────────────────────
    serverProc = spawn(process.execPath, ['src/server.js'], {
      cwd: BACKEND_ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProc.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

    const up = await waitForServer(BASE_URL, BOOT_TIMEOUT_MS);
    record('server boots and responds on /', up, up ? `${BASE_URL}/` : 'timed out');
    if (!up) {
      console.error('\nServer did not start — see [server] log above (e.g. ESM import failures).');
      return;
    }

    const token = adminToken();
    const headers = { Authorization: `Bearer ${token}` };

    // ── 2. Auth guard: no token → 401 ────────────────────────────────
    const noAuth = await fetch(`${BASE_URL}/api/archives/leads`);
    record('no token → 401', noAuth.status === 401, `got ${noAuth.status}`);

    // ── 3. List archives with admin token ─────────────────────────────
    const listRes = await fetch(`${BASE_URL}/api/archives/leads`, { headers });
    record('GET /api/archives/leads → 200', listRes.ok, `got ${listRes.status}`);

    // ── 4. Seed fixture: lead + uploaded document via real API ────────
    //    (skippable via SMOKE_SKIP_SEED=1 — e.g. on a read-only DB)
    if (!SKIP_SEED) {
      const mobile = `9${Date.now().toString().slice(-9)}`;
      const createRes = await fetch(`${BASE_URL}/api/leads`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: `Smoke Test ${Date.now()}`, mobile }),
      });
      const created = createRes.ok ? await createRes.json() : null;
      seedLeadId = created?.id || null;
      record('seed lead via POST /api/leads', !!seedLeadId, seedLeadId ? `id=${seedLeadId}` : `got ${createRes.status}`);

      if (seedLeadId) {
        const form = new FormData();
        form.append('leadId', seedLeadId);
        form.append('documentId', 'kyc_aadhaar');
        form.append('documentName', 'Aadhaar Card');
        form.append('file', new File([TINY_PNG], 'smoke-aadhaar.png', { type: 'image/png' }));
        const upRes = await fetch(`${BASE_URL}/api/checklist-status/upload`, {
          method: 'POST',
          headers,
          body: form,
        });
        const uploaded = upRes.ok ? await upRes.json() : null;
        seedFileId = uploaded?.id || null;
        record('seed document via POST /api/checklist-status/upload', !!seedFileId, seedFileId ? `id=${seedFileId}` : `got ${upRes.status}`);
      }
    } else {
      console.log('SKIP  seeding fixture data (SMOKE_SKIP_SEED=1)');
    }

    // ── 5. The ZIP end-to-end check ──────────────────────────────────
    if (SKIP_SEED) {
      console.log('SKIP  ZIP generation end-to-end (SMOKE_SKIP_SEED=1)');
    } else if (seedLeadId && seedFileId) {
      const zipRes = await fetch(`${BASE_URL}/api/archives/leads/${seedLeadId}/zip`, { headers });
      const buf = Buffer.from(await zipRes.arrayBuffer());

      const isZip = zipRes.status === 200
        && (zipRes.headers.get('content-type') || '').startsWith('application/zip')
        && buf.length >= 4
        && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04; // PK\x03\x04
      record('ZIP response is a valid ZIP (200 + PK magic)', isZip, `status=${zipRes.status} bytes=${buf.length}`);

      const hasEocd = buf.includes(Buffer.from([0x50, 0x4b, 0x05, 0x06])); // end-of-central-directory
      record('ZIP contains end-of-central-directory record', hasEocd);

      const utf8 = buf.toString('utf8');
      const hasFolder = utf8.includes('KYC Documents');
      const hasFile = utf8.includes('smoke-aadhaar.png');
      record('ZIP organized into section folders (KYC Documents/)', hasFolder);
      record('ZIP contains the uploaded file', hasFile, hasFile ? 'smoke-aadhaar.png' : 'file name not found');
    } else {
      record('ZIP generation end-to-end', false, 'could not seed fixture data (check Supabase connectivity)');
    }

    // ── 6. Error path: unknown lead → 404 ────────────────────────────
    const missing = await fetch(`${BASE_URL}/api/archives/leads/00000000-0000-0000-0000-000000000000/zip`, { headers });
    record('unknown lead ZIP → 404', missing.status === 404, `got ${missing.status}`);
  } catch (err) {
    console.error('\nSmoke test crashed:', err.message);
    record('no uncaught errors during test', false, err.message);
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────
    const cleanup = [];
    if (serverProc && (seedLeadId || seedFileId)) {
      const token = adminToken();
      const headers = { Authorization: `Bearer ${token}` };
      try {
        if (seedFileId) {
          const r = await fetch(`${BASE_URL}/api/checklist-status/file/${seedFileId}`, { method: 'DELETE', headers });
          cleanup.push(`delete file → ${r.status}`);
        }
        if (seedLeadId) {
          const r = await fetch(`${BASE_URL}/api/leads/${seedLeadId}`, { method: 'DELETE', headers });
          cleanup.push(`delete lead → ${r.status}`);
        }
      } catch { /* best-effort cleanup */ }
    }

    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.filter(r => r.ok).length}/${results.length} checks passed`);
    if (cleanup.length) console.log('cleanup:', cleanup.join(', '));

    if (serverProc) {
      serverProc.kill('SIGTERM');
      // Windows: SIGTERM may leave the child running — fall back to a hard kill
      setTimeout(() => { try { serverProc.kill('SIGKILL'); } catch { /* already gone */ } }, 500);
      await sleep(600);
      serverProc = null;
    }

    process.exitCode = failed.length ? 1 : 0;
  }
}

main();
