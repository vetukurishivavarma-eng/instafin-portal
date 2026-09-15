import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { deriveLeadStatus } from '../utils/statusDerivation.js';
import { getRequiredDocumentIdsForLead } from '../whatsapp-intake/leadChecklistResolver.js';
import { createTrackingToken, verifyTrackingToken, TRACKING_TTL_DAYS } from '../services/trackingToken.js';

const router = express.Router();

// Public endpoint, no login: keep guessing/scraping expensive.
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many requests. Please try again in a minute.' });

// POST /api/track/link/:leadId — staff mint a shareable, login-free progress link for one lead
router.post('/link/:leadId', authenticate, authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: lead } = await supabase
      .from('leads')
      .select('id, assigned_to')
      .eq('id', req.params.leadId)
      .maybeSingle();
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const manager = req.user.role === 'admin' || req.user.role === 'operations_head';
    if (!manager && lead.assigned_to !== req.user.id) {
      const { data: me } = await supabase.from('users').select('name').eq('id', req.user.id).maybeSingle();
      if (!me?.name || lead.assigned_to !== me.name) {
        return res.status(403).json({ error: 'You can only share links for your own leads' });
      }
    }

    res.json({ token: createTrackingToken(lead.id), expiresInDays: TRACKING_TTL_DAYS });
  } catch (error) {
    console.error('Error creating tracking link:', error);
    res.status(500).json({ error: 'Failed to create tracking link' });
  }
});

// GET /api/track/:token — what the customer sees. Deliberately minimal personal data: first name,
// loan type, stage timeline, bank statuses and a document count — no phone, PAN or addresses.
router.get('/:token', publicLimiter, async (req, res) => {
  const invalid = () => res.status(404).json({ error: 'This tracking link is invalid or has expired.' });
  try {
    const verified = verifyTrackingToken(req.params.token);
    if (!verified) return invalid();

    const { data: lead } = await supabase.from('leads').select('*').eq('id', verified.leadId).maybeSingle();
    if (!lead) return invalid();

    const [{ data: history }, { data: banks }, { data: docs }] = await Promise.all([
      supabase.from('status_history').select('new_status, changed_at').eq('lead_id', lead.id).order('changed_at', { ascending: true }),
      supabase.from('lead_banks').select('bank_name, status, sanctioned_amount, updated_at, created_at').eq('lead_id', lead.id),
      supabase.from('lead_checklist_status').select('document_id, status').eq('lead_id', lead.id),
    ]);

    // same derivation the portal's lead list uses
    let status = lead.is_closed ? 'Closed' : lead.status;
    if (!lead.is_closed && (banks || []).length && lead.assigned_to) {
      status = deriveLeadStatus(banks.map((b) => b.status)) || status;
    }

    let required = null;
    try {
      required = getRequiredDocumentIdsForLead(lead).size || null;
    } catch {
      required = null; // incomplete loan profile — show the received count only
    }
    const uploaded = new Set((docs || []).filter((d) => d.status === 'uploaded').map((d) => d.document_id)).size;

    const timeline = (history || []).map((h) => ({ status: h.new_status, at: h.changed_at }));
    const lastChange = [
      ...timeline.map((t) => t.at),
      ...(banks || []).map((b) => b.updated_at || b.created_at),
      lead.entry_date || lead.created_at,
    ].filter(Boolean).sort().at(-1);

    res.json({
      firstName: String(lead.customer_name || '').trim().split(/\s+/)[0] || null,
      leadCode: lead.lead_code || null,
      loanType: lead.loan_type || null,
      status,
      timeline,
      banks: (banks || []).map((b) => ({
        bankName: b.bank_name,
        status: b.status,
        sanctionedAmount: ['Sanctioned', 'Partially Disbursed', 'Disbursed'].includes(b.status) ? b.sanctioned_amount : null,
      })),
      documents: { uploaded, required },
      updatedAt: lastChange || null,
    });
  } catch (error) {
    console.error('Error loading tracking page:', error);
    res.status(500).json({ error: 'Could not load this application right now.' });
  }
});

export default router;
