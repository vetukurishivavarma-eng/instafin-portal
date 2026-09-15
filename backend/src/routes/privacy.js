import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { inChunks } from '../utils/inChunks.js';
import { usingFallbackSecret } from '../config/secrets.js';

const router = express.Router();
router.use(authenticate);

const DAY_MS = 24 * 60 * 60 * 1000;

// GET /api/privacy/overview — admin data-protection checklist:
//  - whether the server is still signing logins with the public fallback secret
//  - rejected/closed files older than the retention window that still hold customer documents
// Report only: nothing is deleted from here (DPDP purges are a deliberate, reviewed action).
router.get('/overview', authorize('admin'), async (req, res) => {
  try {
    const retentionDays = Number(process.env.DOC_RETENTION_DAYS) || 180;
    const cutoff = Date.now() - retentionDays * DAY_MS;

    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .or('status.in.(Rejected,Closed),is_closed.eq.true');
    if (error) throw error;

    const aged = (leads || [])
      .map((l) => ({ lead: l, since: new Date(l.closed_at || l.entry_date || l.created_at) }))
      .filter(({ since }) => !Number.isNaN(since.getTime()) && since.getTime() < cutoff);

    const docs = aged.length
      ? await inChunks(aged.map(({ lead }) => lead.id), (chunk) =>
          supabase.from('lead_checklist_status').select('lead_id, file_path').in('lead_id', chunk))
      : [];
    const docCount = {};
    for (const d of docs) if (d.file_path) docCount[d.lead_id] = (docCount[d.lead_id] || 0) + 1;

    const candidates = aged
      .filter(({ lead }) => docCount[lead.id])
      .map(({ lead, since }) => ({
        leadId: lead.id,
        leadCode: lead.lead_code || null,
        customerName: lead.customer_name,
        status: lead.is_closed ? 'Closed' : lead.status,
        since: since.toISOString(),
        ageDays: Math.floor((Date.now() - since.getTime()) / DAY_MS),
        documents: docCount[lead.id],
      }))
      .sort((a, b) => b.ageDays - a.ageDays);

    res.json({
      jwtSecretConfigured: !usingFallbackSecret,
      retentionDays,
      candidates,
      totalDocuments: candidates.reduce((s, c) => s + c.documents, 0),
    });
  } catch (error) {
    console.error('Error building privacy overview:', error);
    res.status(500).json({ error: 'Failed to load privacy overview' });
  }
});

export default router;
