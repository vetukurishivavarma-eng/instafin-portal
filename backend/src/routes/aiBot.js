// AI Bot login: save / fetch a lead's documents by chat. Kept to one tap at most:
//   "Ravi Kumar PAN" + file    -> one matching lead: saved straight into its checklist
//   customer has several loans -> tap the loan (or "New loan")
//   new customer               -> send the mobile, tap the loan type, done
//   "show Ravi Kumar"          -> the lead's files in the Checklists page's category folders
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

const LEAD_COLS = 'id, lead_code, customer_name, mobile, status, loan_type, loan_status, income_source, resident_type, business_type';

// One tap for a new lead: the loan type. The rest gets the most common answer
// (staff can change it in Lead Entry; the checklist follows).
export const LOAN_TYPES = [
  ['home_loan', 'Home Loan'], ['lap', 'LAP'], ['personal_loan', 'Personal Loan'],
  ['business_loan', 'Business Loan'], ['msme', 'MSME Loan'],
];
const LOAN_LABEL = Object.fromEntries(LOAN_TYPES);

export function defaultProfile(loanType) {
  return loanType === 'msme'
    ? { loan_type: 'msme', loan_status: 'new', business_type: 'proprietor' }
    : { loan_type: loanType, loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' };
}

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

async function createLead(name, mobile, loanType, byUser) {
  const { data: lead, error } = await supabase
    .from('leads')
    .insert({
      customer_name: titleCase(name), mobile, status: 'New', priority: 'Medium', assigned_banks: [],
      remarks: 'Created from AI Bot', ...defaultProfile(loanType),
    })
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
// Button text that tells loans of the same customer apart.
export const leadButton = (l) =>
  [l.customer_name, LOAN_LABEL[l.loan_type] || l.loan_type || 'No loan type', l.status, l.lead_code].filter(Boolean).join(' · ');
const loanTypeOptions = () => LOAN_TYPES.map(([v, label]) => ({ label, value: `@type:${v}` }));

// What the bot is waiting for, per user: { files, name, label, mobile, step, expires }
//   step 'pick'   -> tap a loan or "New loan"
//   step 'mobile' -> type the new customer's mobile
//   step 'type'   -> tap the new lead's loan type
// ponytail: in memory, 15 min, lost on restart; staff just re-attach then.
const pending = new Map();
const PENDING_MS = 15 * 60 * 1000;

const HELP = 'Attach a file and type the customer name, e.g. "Ravi Kumar PAN". ' +
  'New customer? Add the mobile: "Ravi Kumar 9876543210 PAN". Another loan for a customer: "Ravi Kumar new loan PAN". ' +
  'To fetch: "show Ravi Kumar", "Ravi Kumar today" or a Lead ID like "L10031". To see recent leads: "leads".';

async function leadById(id) {
  const { data } = await supabase.from('leads').select(LEAD_COLS).eq('id', id).maybeSingle();
  return data;
}

async function showLead(res, lead, date) {
  const folders = await leadFolders(lead, date);
  const count = folders.reduce((n, f) => n + f.files.length, 0);
  return res.json({
    reply: count
      ? `${leadButton(lead)}: ${count} file(s)${date ? ` on ${date}` : ''}.`
      : `${leadButton(lead)} has no uploaded files${date ? ` on ${date}` : ''}.`,
    lead: leadInfo(lead),
    folders,
  });
}

async function saveAndReply(res, lead, files, label, note = '') {
  const saved = await saveToLead(lead, files, label);
  return res.json({ reply: `${note}Saved ${saved.length} file(s) to ${leadButton(lead)}:\n${saved.join('\n')}`, lead: leadInfo(lead) });
}

// POST /api/ai-bot/message  (multipart: text, files[])
router.post('/message', upload.array('files', 10), async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    const userKey = String(req.user.id);
    const old = pending.get(userKey);
    if (old && Date.now() > old.expires) pending.delete(userKey);
    const wait = pending.get(userKey);

    // ----- button taps -----
    if (text.startsWith('@show:')) {
      const lead = await leadById(text.slice(6));
      return lead ? showLead(res, lead) : res.json({ reply: 'That lead no longer exists.' });
    }
    if (text.startsWith('@')) {
      if (!wait) return res.json({ reply: 'That request expired. Please attach the file(s) again.' });
      if (text.startsWith('@lead:')) {
        const lead = await leadById(text.slice(6));
        if (!lead) return res.json({ reply: 'That lead no longer exists.' });
        pending.delete(userKey);
        return saveAndReply(res, lead, wait.files, wait.label);
      }
      if (text === '@new') {
        if (!wait.mobile) {
          pending.set(userKey, { ...wait, step: 'mobile' });
          return res.json({ reply: `New loan for ${titleCase(wait.name)}. Send the customer's 10-digit mobile number.` });
        }
        pending.set(userKey, { ...wait, step: 'type' });
        return res.json({ reply: `New loan for ${titleCase(wait.name)}. Which loan?`, options: loanTypeOptions() });
      }
      if (text.startsWith('@type:') && LOAN_LABEL[text.slice(6)] && wait.mobile) {
        pending.delete(userKey);
        const lead = await createLead(wait.name, wait.mobile, text.slice(6), req.user.email);
        return saveAndReply(res, lead, wait.files, wait.label, `New lead created: ${leadButton(lead)}.\n`);
      }
      return res.json({ reply: 'Please tap one of the buttons above.' });
    }

    const code = extractLeadCode(text);
    const mobile = extractMobile(text);
    const rawFiles = req.files || [];

    // ----- typing the mobile the bot asked for -----
    if (!rawFiles.length && wait?.step === 'mobile' && mobile) {
      pending.set(userKey, { ...wait, mobile, step: 'type' });
      return res.json({ reply: `Which loan is ${titleCase(wait.name)} applying for?`, options: loanTypeOptions() });
    }

    let unpacked;
    try {
      unpacked = expand(rawFiles);
    } catch (zipErr) {
      return res.json({ reply: `Could not open the zip: ${zipErr.message}` });
    }
    if (rawFiles.length && !unpacked.files.length) {
      return res.json({ reply: `Nothing to save: no PDF, image, Word or Excel files.${unpacked.skipped.length ? ` Skipped: ${unpacked.skipped.join(', ')}` : ''}` });
    }
    if (rawFiles.length) pending.delete(userKey); // a new upload replaces an unfinished one

    // "new loan" in the message = start another loan for this customer.
    const newLoan = /\bnew\s+loan\b/i.test(text);
    const intent = await parseMessage(stripIds(text.replace(/\bnew\s+loan\b/gi, ' ')), unpacked.files.length);

    if (intent.action === 'leads' && !code && !mobile) {
      const { data } = await supabase.from('leads').select(LEAD_COLS).order('created_at', { ascending: false }).limit(30);
      return res.json({
        reply: 'Recent leads — tap one to see its documents:',
        options: (data || []).map((l) => ({ label: leadButton(l), value: `@show:${l.id}` })),
      });
    }

    const name = intent.lead;
    if (!code && !mobile && !name) {
      return res.json({ reply: unpacked.files.length ? `Whose document is this? ${HELP}` : HELP });
    }

    const leads = await findLeads({ code, mobile, name });

    // ----- show documents -----
    if (!unpacked.files.length) {
      if (!leads.length) return res.json({ reply: `No lead found for "${name || code || mobile}".` });
      if (leads.length === 1) return showLead(res, leads[0], intent.date);
      return res.json({
        reply: `${titleCase(name || leads[0].customer_name)} has ${leads.length} loans. Which one?`,
        options: leads.map((l) => ({ label: leadButton(l), value: `@show:${l.id}` })),
      });
    }

    // ----- save -----
    if (leads.length === 1 && !newLoan) return saveAndReply(res, leads[0], unpacked.files, intent.label);

    const customer = name || leads[0]?.customer_name || '';
    // A new loan for a known customer reuses their number when they have only one.
    const knownMobiles = [...new Set(leads.map((l) => String(l.mobile || '').slice(-10)).filter(Boolean))];
    const base = {
      files: unpacked.files,
      name: customer,
      label: intent.label,
      mobile: mobile || (knownMobiles.length === 1 ? knownMobiles[0] : null),
      expires: Date.now() + PENDING_MS,
    };

    if (newLoan && customer && base.mobile) {
      pending.set(userKey, { ...base, step: 'type' });
      return res.json({ reply: `New loan for ${titleCase(customer)}. Which loan?`, options: loanTypeOptions() });
    }
    if (leads.length > 1) {
      pending.set(userKey, { ...base, step: 'pick' });
      return res.json({
        reply: `${titleCase(customer)} has ${leads.length} loans. Which one are these for?`,
        options: [
          ...leads.map((l) => ({ label: leadButton(l), value: `@lead:${l.id}` })),
          { label: `➕ New loan for ${titleCase(customer)}`, value: '@new' },
        ],
      });
    }
    if (!customer) {
      return res.json({ reply: `No lead found for ${code || mobile}. Add the customer's name too, e.g. "Ravi Kumar ${mobile || '9876543210'}".` });
    }
    if (!base.mobile) {
      pending.set(userKey, { ...base, step: 'mobile' });
      return res.json({ reply: `${titleCase(customer)} is a new customer. Send their 10-digit mobile number to create the lead.` });
    }
    pending.set(userKey, { ...base, step: 'type' });
    return res.json({ reply: `${titleCase(customer)} is a new customer. Which loan?`, options: loanTypeOptions() });
  } catch (err) {
    console.error('[AI-BOT] error:', err);
    res.status(500).json({ error: err.message || 'AI Bot failed' });
  }
});

export default router;
