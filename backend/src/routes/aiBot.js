// AI Bot login: save / fetch a lead's documents by chat.
//   "Ravi Kumar PAN" + file  -> files into that lead's PAN checklist slot
//                               (no type / no match -> the lead's Other Documents)
//   new name                 -> asks for the mobile, creates the lead, then saves
//   "show Ravi Kumar"        -> the lead's files in category folders (KYC, Income...)
//   "leads"                  -> recent leads
// Files go through the same lead_checklist_status rows + storage paths the
// Checklists / Customer Login pages use, so they show up there too.
import express from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { parseMessage } from '../services/aiBotParse.js';
import { fileStore } from '../lib/fileStore.js';
import { isZip, extractZip } from '../utils/unzip.js';
import { downloadName } from '../utils/downloadName.js';
import { matchDocumentName } from '../whatsapp-intake/documentCatalog.js';
import { leadChecklist, categorizer, CATEGORY_LABELS } from '../services/docCategory.js';

const router = express.Router();
const OTHER = { id: 'other_docs', name: 'Other Document' };

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

router.use(authenticate, authorize('ai_bot', 'admin'));

// ---------- pure helpers (tested) ----------

// Indian mobile: 10 digits starting 6-9, optional +91 / 0 prefix.
export function extractMobile(text) {
  const m = String(text || '').replace(/[\s-]/g, '').match(/(?:\+?91|0)?([6-9]\d{9})(?!\d)/);
  return m ? m[1] : null;
}

export function extractLeadCode(text) {
  const m = String(text || '').match(/\bL\d{4,}\b/i);
  return m ? m[0].toUpperCase() : null;
}

// Remove mobile / lead code so they don't end up in the customer's name.
export function stripIds(text) {
  return String(text || '')
    .replace(/(?:\+?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)/g, ' ')
    .replace(/\bL\d{4,}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Same word, different spellings (aadhaar / aadhar / adhar / adhaar).
const canon = (w) => (/^a?adh+a+r$/.test(w) ? 'aadhar' : w);
const wordsOf = (s) => norm(s).split(' ').map(canon);

// Leads whose name contains every word typed; an exact full-name match wins.
export function pickLeads(rows, name) {
  const words = norm(name).split(' ').filter(Boolean);
  if (!words.length) return [];
  const hits = rows.filter((r) => {
    const have = norm(r.customer_name).split(' ');
    return words.every((w) => have.includes(w));
  });
  const exact = hits.filter((r) => norm(r.customer_name) === words.join(' '));
  return exact.length ? exact : hits;
}

export function titleCase(s) {
  return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Which checklist slot a file belongs to: the typed label first, then the
// file's own name; only slots that exist in this lead's checklist count.
// Words that say nothing about which document it is.
const NOISE = new Set(['card', 'copy', 'doc', 'docs', 'document', 'documents', 'file', 'scan', 'img', 'image', 'photo', 'front', 'back', 'page', 'the', 'of', 'and', 'all', 'new', 'final', 'pdf']);

export function slotFor(checklist, label, fileName) {
  const ids = new Map(checklist.map((i) => [i.id, i.name]));
  for (const text of [label, String(fileName || '').replace(/\.[^.]+$/, '')]) {
    if (!text) continue;
    // 1. keyword catalog, if that slot is in this lead's checklist
    const m = matchDocumentName(text);
    if (m && ids.has(m.documentId)) return { id: m.documentId, name: ids.get(m.documentId) };
    // 2. else the lead's own item names ("PAN" -> "Pan Card (All Director)"); only a clear winner
    const words = wordsOf(text).filter((w) => w.length > 1 && !NOISE.has(w) && !/^\d+$/.test(w));
    if (!words.length) continue;
    const scored = checklist
      .map((i) => ({ i, score: words.filter((w) => wordsOf(i.name).includes(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) {
      return { id: scored[0].i.id, name: scored[0].i.name };
    }
  }
  return OTHER;
}

export function istDate(iso) {
  return new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------- DB ----------

const LEAD_COLS = 'id, lead_code, customer_name, mobile, loan_type, loan_status, income_source, resident_type, business_type';

async function findLeads({ code, mobile, name }) {
  if (code) {
    const { data } = await supabase.from('leads').select(LEAD_COLS).eq('lead_code', code).limit(1);
    return data || [];
  }
  if (mobile) {
    // ponytail: unindexed ILIKE on mobile; add an index if leads grow past ~50k
    const { data } = await supabase.from('leads').select(LEAD_COLS).ilike('mobile', `%${mobile}`).limit(10);
    return data || [];
  }
  const first = norm(name).split(' ')[0];
  if (!first) return [];
  const { data } = await supabase.from('leads').select(LEAD_COLS).ilike('customer_name', `%${first}%`).limit(200);
  return pickLeads(data || [], name);
}

async function createLead(name, mobile, byUser) {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({ customer_name: titleCase(name), mobile, status: 'New', priority: 'Medium', assigned_banks: [], remarks: 'Created from AI Bot' })
    .select(LEAD_COLS)
    .single();
  if (error) throw error;
  await supabase.from('status_history').insert({
    lead_id: lead.id, previous_status: null, new_status: 'New',
    changed_by: byUser || 'AI Bot', changed_at: new Date().toISOString(), notes: 'Lead created from AI Bot',
  });
  return lead;
}

// Unpack zips; returns { files: [{ originalname, buffer, mimetype }], skipped }
function expand(files) {
  const out = [];
  const skipped = [];
  for (const f of files) {
    if (isZip(f)) {
      const z = extractZip(f.buffer);
      z.files.forEach((e) => out.push({ originalname: e.name, buffer: e.buffer, mimetype: e.mimetype }));
      skipped.push(...z.skipped);
    } else {
      out.push(f);
    }
  }
  return { files: out, skipped };
}

async function saveToLead(lead, files, label) {
  const checklist = leadChecklist(lead);
  const saved = [];
  for (const f of files) {
    const slot = slotFor(checklist, label, f.originalname);
    const storagePath = `${lead.id}/${uuidv4()}-${f.originalname}`;
    const { error: upErr } = await fileStore().upload(storagePath, f.buffer, { contentType: f.mimetype });
    if (upErr) throw upErr;
    const { error: rowErr } = await supabase.from('lead_checklist_status').insert({
      lead_id: lead.id,
      document_id: slot.id,
      document_name: JSON.stringify({ name: slot.name, description: 'Added via AI Bot', originalFile: f.originalname }),
      status: 'uploaded',
      file_path: storagePath,
      uploaded_at: new Date().toISOString(),
    });
    if (rowErr) throw rowErr;
    saved.push(`${f.originalname} → ${slot.name}`);
  }
  return saved;
}

// The lead's uploaded files as category folders: [{ key, label, files: [{ name, date, url }] }]
async function leadFolders(lead, date) {
  const { data: rows, error } = await supabase
    .from('lead_checklist_status')
    .select('id, document_id, document_name, file_path, uploaded_at')
    .eq('lead_id', lead.id)
    .eq('status', 'uploaded')
    .not('file_path', 'is', null)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  const list = (rows || []).filter((r) => !date || istDate(r.uploaded_at) === date).map((r) => {
    let doc = {};
    try { doc = JSON.parse(r.document_name); } catch { doc = { name: r.document_name }; }
    return { ...r, doc };
  });
  if (!list.length) return [];
  const { data: signed, error: sErr } = await fileStore().createSignedUrls(
    list.map((r) => r.file_path),
    3600,
    { names: list.map((r) => downloadName(lead.customer_name, r.doc.originalFile || r.file_path, r.doc.name)) },
  );
  if (sErr) throw sErr;
  const categoryOf = categorizer(lead);
  const folders = new Map();
  list.forEach((r, i) => {
    if (!signed[i]?.signedUrl) return;
    const cat = categoryOf(r.document_id);
    if (!folders.has(cat.key)) folders.set(cat.key, { key: cat.key, label: cat.label, files: [] });
    folders.get(cat.key).files.push({
      name: [r.doc.name, r.doc.originalFile].filter(Boolean).join(' — ') || 'Document',
      date: istDate(r.uploaded_at),
      url: signed[i].signedUrl,
    });
  });
  // Same order as the checklist pages.
  const order = Object.keys(CATEGORY_LABELS);
  return [...folders.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}

const leadLabel = (l) => `${l.customer_name}${l.lead_code ? ` (${l.lead_code})` : ''}`;
const leadInfo = (l) => ({ id: l.id, name: l.customer_name, code: l.lead_code });

// Files waiting for a mobile number / lead choice, per user.
// ponytail: in memory, 15 min, lost on restart; staff just re-attach then.
const pending = new Map();
const PENDING_MS = 15 * 60 * 1000;

const HELP = 'Attach a file and type the customer name, e.g. "Ravi Kumar PAN". ' +
  'New customer? Add the mobile: "Ravi Kumar 9876543210 PAN". ' +
  'To fetch: "show Ravi Kumar", "Ravi Kumar today" or a Lead ID like "L10031". To see recent leads: "leads".';

// POST /api/ai-bot/message  (multipart: text, files[])
router.post('/message', upload.array('files', 10), async (req, res) => {
  try {
    const text = String(req.body.text || '');
    const code = extractLeadCode(text);
    const mobile = extractMobile(text);
    const rawFiles = req.files || [];
    let unpacked;
    try {
      unpacked = expand(rawFiles);
    } catch (zipErr) {
      return res.json({ reply: `Could not open the zip: ${zipErr.message}` });
    }
    const skippedNote = unpacked.skipped.length ? `\nSkipped (unsupported type): ${unpacked.skipped.join(', ')}` : '';
    const userKey = String(req.user.id);

    // Finishing an earlier upload: "9876543210" or "L10031" with no new files.
    const wait = pending.get(userKey);
    if (wait && Date.now() > wait.expires) pending.delete(userKey);
    if (!rawFiles.length && pending.has(userKey) && (mobile || code)) {
      const p = pending.get(userKey);
      let leads = await findLeads(code ? { code } : { mobile });
      let created = false;
      if (!leads.length && mobile && p.name) {
        leads = [await createLead(p.name, mobile, req.user.email)];
        created = true;
      }
      if (leads.length !== 1) {
        return res.json({ reply: leads.length ? `That matches ${leads.map(leadLabel).join(', ')}. Send the Lead ID.` : 'No lead found for that. Send the Lead ID or the new customer\'s mobile.' });
      }
      pending.delete(userKey);
      const saved = await saveToLead(leads[0], p.files, p.label);
      return res.json({
        reply: `${created ? `New lead created: ${leadLabel(leads[0])}.\n` : ''}Saved ${saved.length} file(s) to ${leadLabel(leads[0])}:\n${saved.join('\n')}`,
        lead: leadInfo(leads[0]),
      });
    }

    const intent = await parseMessage(stripIds(text), unpacked.files.length);
    if (rawFiles.length && !unpacked.files.length) {
      return res.json({ reply: `Nothing to save: no PDF, image, Word or Excel files.${skippedNote}` });
    }

    if (intent.action === 'leads' && !code && !mobile) {
      const { data } = await supabase.from('leads').select(LEAD_COLS).order('created_at', { ascending: false }).limit(30);
      return res.json({ reply: `${(data || []).length} most recent leads:`, leads: (data || []).map(leadInfo) });
    }

    const name = intent.lead;
    if (!code && !mobile && !name) {
      return res.json({ reply: unpacked.files.length ? `Whose document is this? ${HELP}` : HELP });
    }

    const leads = await findLeads({ code, mobile, name });

    // ----- save -----
    if (unpacked.files.length) {
      if (leads.length === 1) {
        const saved = await saveToLead(leads[0], unpacked.files, intent.label);
        return res.json({ reply: `Saved ${saved.length} file(s) to ${leadLabel(leads[0])}:\n${saved.join('\n')}${skippedNote}`, lead: leadInfo(leads[0]) });
      }
      if (!leads.length && mobile && name) {
        const lead = await createLead(name, mobile, req.user.email);
        const saved = await saveToLead(lead, unpacked.files, intent.label);
        return res.json({ reply: `New lead created: ${leadLabel(lead)}.\nSaved ${saved.length} file(s):\n${saved.join('\n')}${skippedNote}`, lead: leadInfo(lead) });
      }
      pending.set(userKey, { files: unpacked.files, name, label: intent.label, expires: Date.now() + PENDING_MS });
      if (leads.length > 1) {
        return res.json({ reply: `"${name}" matches ${leads.length} leads. Tap the right one to save the file(s).`, choose: leads.map(leadInfo) });
      }
      return res.json({ reply: `No lead named "${titleCase(name || code || mobile)}" yet. Send the customer's 10-digit mobile number and I'll create the lead and save the ${unpacked.files.length} file(s).` });
    }

    // ----- list -----
    if (!leads.length) return res.json({ reply: `No lead found for "${name || code || mobile}".` });
    if (leads.length > 1) return res.json({ reply: `"${name}" matches ${leads.length} leads. Tap one:`, leads: leads.map(leadInfo) });
    const lead = leads[0];
    const folders = await leadFolders(lead, intent.date);
    const count = folders.reduce((n, f) => n + f.files.length, 0);
    res.json({
      reply: count
        ? `${leadLabel(lead)}: ${count} file(s) in ${folders.length} folder(s)${intent.date ? ` on ${intent.date}` : ''}.`
        : `${leadLabel(lead)} has no uploaded files${intent.date ? ` on ${intent.date}` : ''}.`,
      lead: leadInfo(lead),
      folders,
    });
  } catch (err) {
    console.error('[AI-BOT] error:', err);
    res.status(500).json({ error: err.message || 'AI Bot failed' });
  }
});

export default router;
