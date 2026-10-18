// AI Bot: turn a staff message ("this is Ravi Kumar's PAN" + attached file)
// into { action, lead, date, label }. Uses Claude Haiku when ANTHROPIC_API_KEY
// is set (one small call, ~500 tokens, thinking off); otherwise a free
// rule-based parser that handles the simple phrasings.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-haiku-5-5';

const SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['save', 'list', 'leads', 'help'] },
    lead: { type: 'string' },
    date: { type: 'string' },
    label: { type: 'string' },
  },
  required: ['action', 'lead', 'date', 'label'],
  additionalProperties: false,
};

// Today in India, as YYYY-MM-DD.
export function todayIST(now = Date.now()) {
  return new Date(now + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export function slugify(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function displayName(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const DOC_LABELS = [
  ['bank statement', 'Bank Statement'], ['salary slip', 'Payslip'], ['payslip', 'Payslip'],
  ['pay slip', 'Payslip'], ['form 16', 'Form 16'], ['aadhaar', 'Aadhaar'], ['aadhar', 'Aadhaar'],
  ['pan', 'PAN'], ['itr', 'ITR'], ['photo', 'Photo'], ['passport', 'Passport'],
  ['voter', 'Voter ID'], ['driving licence', 'Driving Licence'], ['sale deed', 'Sale Deed'],
  ['agreement', 'Agreement'], ['cibil', 'CIBIL'], ['gst', 'GST'], ['electricity bill', 'Electricity Bill'],
];

const FILLER = /\b(this|is|are|these|the|a|an|save|saved|store|upload|add|file|for|to|of|in|into|folder|lead|customer|client|show|get|find|list|give|me|all|send|documents?|docs?|files?|card|copy|received|got|from|on|dated?|today|yesterday|please|pls)\b/gi;

function parseDate(text, now) {
  const t = text.toLowerCase();
  if (/\byesterday\b/.test(t)) return todayIST(now - 86400000);
  if (/\btoday\b/.test(t)) return todayIST(now);
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

// Free fallback. ponytail: keyword heuristics, Haiku covers free-form phrasing.
export function ruleParse(text, fileCount, now = Date.now()) {
  const raw = String(text || '').trim();
  if (/^(list |show |all )*(leads|folders)$/i.test(raw)) return { action: 'leads', lead: '', date: '', label: '' };

  const date = parseDate(raw, now);
  let rest = raw.replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\b/g, ' ');
  let label = '';
  for (const [kw, name] of DOC_LABELS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(rest)) { label = label || name; rest = rest.replace(re, ' '); }
  }
  const lead = rest.replace(/'s\b/gi, ' ').replace(FILLER, ' ').replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();

  if (!lead) return { action: 'help', lead: '', date, label };
  return { action: fileCount > 0 ? 'save' : 'list', lead, date, label };
}

let client = null;

export async function parseMessage(text, fileCount, now = Date.now()) {
  if (!process.env.ANTHROPIC_API_KEY) return { ...ruleParse(text, fileCount, now), via: 'rules' };
  client ||= new Anthropic();
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system:
        `Staff of a loan agency file customer documents into one folder per customer. Today is ${todayIST(now)}. ` +
        'From the message return: action = save (files attached and a customer is named), list (show/find a customer\'s documents), ' +
        'leads (list all customer folders), help (anything else). lead = the customer\'s name only, as written. ' +
        'date = YYYY-MM-DD only if a date is mentioned, else "". label = short document type if mentioned (PAN, Aadhaar, Bank Statement...), else "".',
      messages: [{ role: 'user', content: `[${fileCount} file(s) attached]\n${String(text || '').slice(0, 500)}` }],
    });
    const block = res.content.find((b) => b.type === 'text');
    if (res.stop_reason !== 'end_turn' || !block) throw new Error(`stop_reason ${res.stop_reason}`);
    const parsed = JSON.parse(block.text);
    // A saved file must never be dropped just because the model said "help".
    if (fileCount > 0 && parsed.lead) parsed.action = 'save';
    return { ...parsed, via: 'haiku' };
  } catch (err) {
    console.error('[AI-BOT] Haiku parse failed, using rules:', err.message);
    return { ...ruleParse(text, fileCount, now), via: 'rules' };
  }
}
