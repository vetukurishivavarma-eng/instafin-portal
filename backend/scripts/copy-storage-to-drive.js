/**
 * Copy every file in Supabase Storage (bucket lead-documents) to Google Drive,
 * keeping the same paths. Safe to re-run: files already on Drive with the same
 * size are skipped. Nothing is deleted from Supabase.
 *
 *   node --env-file=.env scripts/copy-storage-to-drive.js
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY + GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN.
 */
process.env.STORAGE_PROVIDER = 'gdrive';
const { supabase } = await import('../src/lib/supabase.js');
const { fileStore } = await import('../src/lib/fileStore.js');

const src = supabase.storage.from('lead-documents');
const dst = fileStore();

async function walk(prefix, out) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await src.list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const e of data) {
      const p = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id) out.push({ path: p, dir: prefix, name: e.name, size: e.metadata?.size || 0, type: e.metadata?.mimetype });
      else if (e.name !== '.emptyFolderPlaceholder') await walk(p, out);
    }
    if (data.length < 1000) return out;
  }
}

const files = (await walk('', [])).filter((f) => f.name !== '.emptyFolderPlaceholder');
console.log(`${files.length} files in Supabase`);

const onDrive = new Map(); // dir -> Map(name -> size)
async function driveDir(dir) {
  if (!onDrive.has(dir)) {
    const { data, error } = await dst.list(dir, { limit: 100000 });
    if (error) throw error;
    onDrive.set(dir, new Map(data.filter((e) => e.id).map((e) => [e.name, e.metadata.size])));
  }
  return onDrive.get(dir);
}

let copied = 0, skipped = 0;
const failed = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    try {
      if ((await driveDir(f.dir)).get(f.name) === f.size) { skipped++; continue; }
      const { data, error } = await src.download(f.path);
      if (error) throw error;
      const buf = Buffer.from(await data.arrayBuffer());
      const up = await dst.upload(f.path, buf, { contentType: f.type || data.type, upsert: true });
      if (up.error) throw up.error;
      copied++;
    } catch (err) {
      failed.push(`${f.path}: ${err.message}`);
    }
    const done = copied + skipped + failed.length;
    if (done % 50 === 0) console.log(`${done}/${files.length}`);
  }
}
// 4 parallel copies; folder creation is de-duplicated inside fileStore.
await Promise.all(Array.from({ length: 4 }, worker));

console.log(`\ncopied ${copied}, already there ${skipped}, failed ${failed.length}`);
failed.forEach((f) => console.log('  FAILED', f));
process.exit(failed.length ? 1 : 0);
