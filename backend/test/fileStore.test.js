import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Minimal in-memory Google Drive: token, files.list (by parent [+ name]),
// folder create, resumable upload (new + update), alt=media, delete.
const files = new Map(); // id -> { id, name, parent, mimeType, data }
let seq = 0;
let sessions = new Map();

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const method = init.method || 'GET';
  if (u.host === 'oauth2.googleapis.com') return json({ access_token: 't', expires_in: 3600 });
  if (u.host === 'upload.example') {
    const s = sessions.get(u.pathname);
    const buf = Buffer.from(init.body);
    if (s.id) Object.assign(files.get(s.id), { data: buf });
    else { s.id = `f${++seq}`; files.set(s.id, { id: s.id, name: s.name, parent: s.parent, mimeType: init.headers['Content-Type'], data: buf }); }
    return json({ id: s.id });
  }
  if (u.pathname.startsWith('/upload/drive/v3/files')) {
    const id = u.pathname.split('/')[5];
    const meta = JSON.parse(init.body);
    const key = `/s${++seq}`;
    sessions.set(key, { id, name: meta.name, parent: meta.parents?.[0] });
    return new Response('', { status: 200, headers: { location: `https://upload.example${key}` } });
  }
  const id = u.pathname.split('/')[4];
  if (id && u.searchParams.get('alt') === 'media') {
    const f = files.get(id);
    return f ? new Response(f.data, { headers: { 'content-type': f.mimeType } }) : new Response('nf', { status: 404 });
  }
  if (id && method === 'DELETE') { files.delete(id); return new Response(null, { status: 204 }); }
  if (method === 'POST') {
    const meta = JSON.parse(init.body);
    const fid = `d${++seq}`;
    files.set(fid, { id: fid, name: meta.name, parent: meta.parents[0], mimeType: meta.mimeType });
    return json({ id: fid });
  }
  // list
  const qs = u.searchParams.get('q');
  const parent = qs.match(/^'([^']+)' in parents/)[1];
  const name = qs.match(/name = '((?:\\.|[^'])*)'/)?.[1]?.replace(/\\(.)/g, '$1');
  const hits = [...files.values()].filter((f) => f.parent === parent && (name === undefined || f.name === name));
  return json({ files: hits.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.data ? String(f.data.length) : undefined })) });
}

let fileStore, verifyFileLink;

beforeAll(async () => {
  process.env.STORAGE_PROVIDER = 'gdrive';
  process.env.PUBLIC_API_URL = 'https://api.test';
  vi.stubGlobal('fetch', fakeFetch);
  ({ fileStore, verifyFileLink } = await import('../src/lib/fileStore.js'));
});
afterAll(() => { vi.unstubAllGlobals(); delete process.env.STORAGE_PROVIDER; });

describe('fileStore on Google Drive', () => {
  it('uploads into nested folders and downloads the same bytes', async () => {
    const up = await fileStore().upload('lead-1/2026-10-18/PAN.pdf', Buffer.from('hello'), { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const { data, error } = await fileStore().download('lead-1/2026-10-18/PAN.pdf');
    expect(error).toBeNull();
    expect(Buffer.from(await data.arrayBuffer()).toString()).toBe('hello');
    // root folder + 2 nested folders + 1 file, no duplicates
    expect([...files.values()].filter((f) => f.mimeType === 'application/vnd.google-apps.folder').map((f) => f.name).sort())
      .toEqual(['2026-10-18', 'InstaFin Documents', 'lead-1']);
  });

  it('refuses to overwrite without upsert, overwrites with it', async () => {
    const again = await fileStore().upload('lead-1/2026-10-18/PAN.pdf', Buffer.from('x'));
    expect(again.error?.statusCode).toBe(409);
    expect((await fileStore().upload('lead-1/2026-10-18/PAN.pdf', Buffer.from('v2'), { upsert: true })).error).toBeNull();
    const { data } = await fileStore().download('lead-1/2026-10-18/PAN.pdf');
    expect(await data.text()).toBe('v2');
  });

  it('creates a folder once for parallel uploads', async () => {
    await Promise.all([1, 2, 3].map((i) => fileStore().upload(`lead-2/doc${i}.pdf`, Buffer.from('a'))));
    expect([...files.values()].filter((f) => f.name === 'lead-2')).toHaveLength(1);
  });

  it('lists folders (id null) and files (with size) like Supabase', async () => {
    const { data } = await fileStore().list('lead-1');
    expect(data).toEqual([expect.objectContaining({ name: '2026-10-18', id: null })]);
    const { data: inner } = await fileStore().list('lead-1/2026-10-18');
    expect(inner[0]).toMatchObject({ name: 'PAN.pdf', metadata: { size: 2 } });
  });

  it('gives a signed backend link that verifies and rejects tampering', async () => {
    const { data } = await fileStore().createSignedUrl('lead-1/2026-10-18/PAN.pdf', 60);
    expect(data.signedUrl.startsWith('https://api.test/api/files/')).toBe(true);
    const tok = data.signedUrl.split('/').pop();
    expect(verifyFileLink(tok)).toMatchObject({ n: 'PAN.pdf' });
    expect(verifyFileLink(tok.slice(0, -2) + 'xx')).toBeNull();
  });

  it('reports missing files as errors and removes files', async () => {
    expect((await fileStore().download('nope/missing.pdf')).error?.statusCode).toBe(404);
    expect((await fileStore().remove(['lead-2/doc1.pdf'])).data).toHaveLength(1);
    expect((await fileStore().download('lead-2/doc1.pdf')).error).not.toBeNull();
  });
});
