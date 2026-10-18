// AI Bot login: save / fetch documents by customer name, by prompt.
// Separate from the lead checklist system on purpose — files live in their own
// Storage tree, one folder per customer, one sub-folder per date received:
//   lead-documents/ai-bot/<customer-slug>/<YYYY-MM-DD>/<HHMMSS>_<name>
// No DB table: the folder tree in Storage is the index.
import express from 'express';
import multer from 'multer';
import path from 'path';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { parseMessage, slugify, displayName, todayIST } from '../services/aiBotParse.js';

const router = express.Router();
const BUCKET = 'lead-documents';
const ROOT = 'ai-bot';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
});

router.use(authenticate, authorize('ai_bot', 'admin'));

async function listDir(prefix) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
  if (error) throw error;
  return (data || []).filter((e) => e.name !== '.emptyFolderPlaceholder');
}

// Folders = entries with no id. Returns the customer slugs.
async function customerFolders() {
  return (await listDir(ROOT)).filter((e) => !e.id).map((e) => e.name);
}

// Exact slug, else the single folder containing every word typed ("ravi" -> ravi-kumar).
export function matchFolder(folders, name) {
  const slug = slugify(name);
  if (folders.includes(slug)) return { slug, matches: [slug] };
  const words = slug.split('-').filter(Boolean);
  const matches = folders.filter((f) => words.every((w) => f.split('-').includes(w)));
  return { slug: matches.length === 1 ? matches[0] : null, matches };
}

function istTime() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(11, 19).replace(/:/g, '');
}

function safeFileName(original, label) {
  const ext = path.extname(original || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  const base = label || path.basename(original || 'document', path.extname(original || ''));
  return `${base.replace(/[^a-zA-Z0-9 _-]+/g, '').trim().replace(/\s+/g, '_') || 'document'}${ext}`;
}

async function listCustomer(slug, date) {
  const dates = (await listDir(`${ROOT}/${slug}`)).filter((e) => !e.id).map((e) => e.name)
    .filter((d) => !date || d === date);
  const out = [];
  for (const d of dates) {
    const files = (await listDir(`${ROOT}/${slug}/${d}`)).filter((e) => e.id);
    if (!files.length) continue;
    const paths = files.map((f) => `${ROOT}/${slug}/${d}/${f.name}`);
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (error) throw error;
    out.push({
      date: d,
      files: files.map((f, i) => ({ name: f.name.replace(/^\d{6}_/, ''), size: f.metadata?.size || 0, url: signed[i]?.signedUrl })),
    });
  }
  return out;
}

const HELP = 'Attach a file and type the customer name, e.g. "Ravi Kumar PAN". ' +
  'To fetch: "show Ravi Kumar" or "Ravi Kumar 2026-10-18". To see every folder: "leads".';

// POST /api/ai-bot/message  (multipart: text, files[])
router.post('/message', upload.array('files', 10), async (req, res) => {
  try {
    const files = req.files || [];
    const intent = await parseMessage(req.body.text, files.length);
    const folders = await customerFolders();

    if (intent.action === 'leads') {
      return res.json({ reply: folders.length ? `${folders.length} customer folder(s).` : 'No customer folders yet.', folders: folders.map(displayName).sort() });
    }
    if (intent.action === 'help' || !intent.lead) {
      return res.json({ reply: files.length ? `Whose document is this? ${HELP}` : HELP });
    }

    const { slug: found, matches } = matchFolder(folders, intent.lead);

    if (intent.action === 'save') {
      if (!files.length) return res.json({ reply: `Attach the file(s) to save for ${intent.lead}.` });
      if (!found && matches.length > 1) {
        return res.json({ reply: `"${intent.lead}" matches more than one folder: ${matches.map(displayName).join(', ')}. Type the full name.` });
      }
      const slug = found || slugify(intent.lead);
      if (!slug) return res.json({ reply: HELP });
      const date = todayIST();
      const time = istTime();
      const saved = [];
      for (const [i, f] of files.entries()) {
        const name = safeFileName(f.originalname, intent.label && files.length > 1 ? `${intent.label} ${i + 1}` : intent.label);
        const key = `${ROOT}/${slug}/${date}/${time}_${name}`;
        const { error } = await supabase.storage.from(BUCKET).upload(key, f.buffer, { contentType: f.mimetype, upsert: false });
        if (error) throw error;
        saved.push(name);
      }
      const isNew = !found;
      return res.json({
        reply: `${isNew ? 'New folder created. ' : ''}Saved ${saved.length} file(s) to ${displayName(slug)} / ${date}: ${saved.join(', ')}`,
        lead: displayName(slug),
        via: intent.via,
      });
    }

    // list
    if (!found) {
      return res.json({
        reply: matches.length > 1
          ? `"${intent.lead}" matches: ${matches.map(displayName).join(', ')}. Type the full name.`
          : `No folder for "${intent.lead}".`,
      });
    }
    const dates = await listCustomer(found, intent.date);
    const count = dates.reduce((n, d) => n + d.files.length, 0);
    res.json({
      reply: count
        ? `${displayName(found)}: ${count} file(s)${intent.date ? ` on ${intent.date}` : ''}.`
        : `${displayName(found)} has no files${intent.date ? ` on ${intent.date}` : ''}.`,
      lead: displayName(found),
      dates,
      via: intent.via,
    });
  } catch (err) {
    console.error('[AI-BOT] error:', err);
    res.status(500).json({ error: err.message || 'AI Bot failed' });
  }
});

export default router;
