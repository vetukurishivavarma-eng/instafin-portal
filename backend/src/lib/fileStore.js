// File storage for lead documents, forms and AI Bot files.
//
// Drop-in for `supabase.storage.from('lead-documents')`: same methods, same
// { data, error } results, same path strings — so callers didn't change.
//   STORAGE_PROVIDER=gdrive  -> Google Drive (one Gmail account, OAuth refresh token)
//   anything else            -> Supabase Storage (old behaviour)
//
// On Drive a path like "<leadId>/abc.pdf" becomes real folders under one root
// folder ("InstaFin Documents" by default), so it is browsable in drive.google.com.
// Drive has no signed URLs, so createSignedUrl returns a link to this backend
// (/api/files/<token>, HMAC-signed, expiring) that streams the file.
import crypto from 'crypto';
import { supabase } from './supabase.js';

const BUCKET = 'lead-documents';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
const LINK_SECRET = `files:${process.env.JWT_SECRET || 'instafin-dev-secret-2024'}`;

export const usingDrive = () => process.env.STORAGE_PROVIDER === 'gdrive';

// ---------- Google auth ----------
let token = null;
let tokenExp = 0;

async function accessToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google auth failed: ${body.error_description || body.error || res.status}`);
  token = body.access_token;
  tokenExp = Date.now() + body.expires_in * 1000;
  return token;
}

async function drive(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await accessToken()}`, ...init.headers } });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Drive ${res.status}: ${text.slice(0, 300)}`);
    err.statusCode = res.status;
    throw err;
  }
  return res;
}

const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findChild(parentId, name) {
  const params = new URLSearchParams({
    q: `'${parentId}' in parents and name = '${q(name)}' and trashed = false`,
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime)',
    pageSize: '10',
  });
  const { files } = await (await drive(`${API}?${params}`)).json();
  return files[0] || null;
}

async function createFolder(parentId, name) {
  const res = await drive(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
  });
  return (await res.json()).id;
}

// path ("a/b") -> folder id. Promises are cached so parallel uploads into a new
// folder don't create it twice. ponytail: in-process cache only, one backend
// instance; a second instance could race and make a duplicate folder.
const folderCache = new Map();

function folderId(dirPath, create) {
  const key = `${create ? 'c' : 'r'}:${dirPath}`;
  if (folderCache.has(`c:${dirPath}`)) return folderCache.get(`c:${dirPath}`);
  if (folderCache.has(key)) return folderCache.get(key);
  const p = (async () => {
    if (!dirPath) {
      const rootName = process.env.GOOGLE_DRIVE_ROOT_FOLDER || 'InstaFin Documents';
      const found = await findChild('root', rootName);
      if (found) return found.id;
      if (!create) return null;
      return createFolder('root', rootName);
    }
    const i = dirPath.lastIndexOf('/');
    const parent = await folderId(i < 0 ? '' : dirPath.slice(0, i), create);
    if (!parent) return null;
    const name = dirPath.slice(i + 1);
    const found = await findChild(parent, name);
    if (found) return found.id;
    return create ? createFolder(parent, name) : null;
  })();
  folderCache.set(key, p);
  // Don't remember failures or "not found" — the folder may appear later.
  p.then((id) => { if (!id) folderCache.delete(key); }, () => folderCache.delete(key));
  return p;
}

function split(filePath) {
  const clean = String(filePath).replace(/^\/+/, '');
  const i = clean.lastIndexOf('/');
  return { dir: i < 0 ? '' : clean.slice(0, i), name: clean.slice(i + 1) };
}

async function findFile(filePath) {
  const { dir, name } = split(filePath);
  const parent = await folderId(dir, false);
  return parent ? findChild(parent, name) : null;
}

const notFound = () => Object.assign(new Error('Object not found'), { statusCode: 404 });

async function wrap(fn) {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// ---------- signed links served by /api/files/:token ----------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', LINK_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifyFileLink(tokenStr) {
  const [body, mac] = String(tokenStr).split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', LINK_SECRET).update(body).digest('base64url');
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  return payload.e > Date.now() ? payload : null;
}

// opts.download (as in Supabase): a file name to save as, or true; forces download.
// opts.name: save-as name but still opens in the browser tab.
function linkFor(file, expiresInSec, opts = {}) {
  const base = process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3001}`;
  const name = (typeof opts.download === 'string' && opts.download) || opts.name || file.name;
  const tokenStr = sign({ f: file.id, n: name, e: Date.now() + expiresInSec * 1000 });
  return `${base.replace(/\/+$/, '')}/api/files/${tokenStr}${opts.download ? '?dl=1' : ''}`;
}

// Stream a Drive file id (used by the /api/files route).
export async function driveStream(fileId) {
  return drive(`${API}/${encodeURIComponent(fileId)}?alt=media`);
}

// ---------- the Drive bucket ----------
const driveBucket = {
  upload: (filePath, body, opts = {}) => wrap(async () => {
    const { dir, name } = split(filePath);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : await new Response(body).arrayBuffer());
    const contentType = opts.contentType || 'application/octet-stream';
    const parent = await folderId(dir, true);
    const existing = await findChild(parent, name);
    if (existing && !opts.upsert) throw Object.assign(new Error('The resource already exists'), { statusCode: 409 });

    // Resumable upload: works for any size (multipart is limited to 5 MB).
    const start = await drive(
      existing ? `${UPLOAD}/${existing.id}?uploadType=resumable` : `${UPLOAD}?uploadType=resumable`,
      {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': contentType },
        body: JSON.stringify(existing ? {} : { name, parents: [parent] }),
      },
    );
    const session = start.headers.get('location');
    const done = await drive(session, { method: 'PUT', headers: { 'Content-Type': contentType }, body: buf });
    const file = await done.json();
    return { path: filePath, id: file.id, fullPath: `${BUCKET}/${filePath}` };
  }),

  download: (filePath) => wrap(async () => {
    const file = await findFile(filePath);
    if (!file) throw notFound();
    const res = await driveStream(file.id);
    return new Blob([await res.arrayBuffer()], { type: res.headers.get('content-type') || file.mimeType });
  }),

  remove: (paths) => wrap(async () => {
    const removed = [];
    for (const p of paths) {
      const file = await findFile(p);
      if (!file) continue;
      await drive(`${API}/${file.id}`, { method: 'DELETE' });
      removed.push({ name: p });
    }
    return removed;
  }),

  createSignedUrl: (filePath, expiresIn, opts) => wrap(async () => {
    const file = await findFile(filePath);
    if (!file) throw notFound();
    return { signedUrl: linkFor(file, expiresIn, opts) };
  }),

  // One folder listing per directory instead of one lookup per file.
  // opts.names: optional save-as name per path (same order as paths).
  createSignedUrls: (paths, expiresIn, opts = {}) => wrap(async () => {
    const byDir = new Map();
    for (const p of paths) {
      const { dir } = split(p);
      if (!byDir.has(dir)) {
        const parent = await folderId(dir, false);
        const files = new Map();
        if (parent) {
          let pageToken;
          do {
            const params = new URLSearchParams({ q: `'${parent}' in parents and trashed = false`, fields: 'nextPageToken,files(id,name)', pageSize: '1000' });
            if (pageToken) params.set('pageToken', pageToken);
            const page = await (await drive(`${API}?${params}`)).json();
            page.files.forEach((f) => files.set(f.name, f));
            pageToken = page.nextPageToken;
          } while (pageToken);
        }
        byDir.set(dir, files);
      }
    }
    return paths.map((p, i) => {
      const { dir, name } = split(p);
      const file = byDir.get(dir).get(name);
      return file
        ? { path: p, signedUrl: linkFor(file, expiresIn, { name: opts.names?.[i] }), error: null }
        : { path: p, signedUrl: null, error: 'Object not found' };
    });
  }),

  // Same shape as Supabase: folders have id null, files carry metadata.size.
  list: (prefix = '', opts = {}) => wrap(async () => {
    const parent = await folderId(String(prefix).replace(/^\/+|\/+$/g, ''), false);
    if (!parent) return [];
    const entries = [];
    let pageToken;
    do {
      const params = new URLSearchParams({
        q: `'${parent}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime)',
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await (await drive(`${API}?${params}`)).json();
      for (const f of page.files) {
        const isFolder = f.mimeType === FOLDER;
        entries.push({
          name: f.name,
          id: isFolder ? null : f.id,
          created_at: f.createdTime,
          updated_at: f.modifiedTime,
          metadata: isFolder ? null : { size: Number(f.size || 0), mimetype: f.mimeType },
        });
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    const desc = opts.sortBy?.order === 'desc';
    entries.sort((a, b) => (desc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
    const offset = opts.offset || 0;
    return entries.slice(offset, offset + (opts.limit || 100));
  }),
};

// Callers use: fileStore().upload(...), fileStore().download(...), etc.
export function fileStore() {
  return usingDrive() ? driveBucket : supabase.storage.from(BUCKET);
}
