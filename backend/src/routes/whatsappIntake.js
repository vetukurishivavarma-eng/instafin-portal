import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { getWhatsAppIntakeStatus, getWhatsAppIntakeQr, getCloudApiAdapter } from '../whatsapp-intake/index.js';

const router = express.Router();

// GET /api/whatsapp-intake/status — connection state for the admin monitoring screen
router.get('/status', authenticate, authorize('admin', 'operations_head'), (req, res) => {
  res.json(getWhatsAppIntakeStatus());
});

// GET /api/whatsapp-intake/qr — current QR code (data URL) to link a WhatsApp device
router.get('/qr', authenticate, authorize('admin', 'operations_head'), (req, res) => {
  const qr = getWhatsAppIntakeQr();
  if (!qr) return res.status(404).json({ error: 'No QR code available (already connected, or not started)' });
  res.json({ qr });
});

// GET /api/whatsapp-intake/logs — recent inbound messages and their outcome
router.get('/logs', authenticate, authorize('admin', 'operations_head', 'executive'), async (req, res) => {
  try {
    const { status, leadId, limit = 50 } = req.query;

    let query = supabase
      .from('whatsapp_intake_log')
      .select('*')
      .order('received_at', { ascending: false })
      .limit(Math.min(parseInt(limit, 10) || 50, 200));

    if (status) query = query.eq('status', status);
    if (leadId) query = query.eq('matched_lead_id', leadId);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data.map((row) => ({
      id: row.id,
      status: row.status,
      failureCode: row.failure_code,
      failureReason: row.failure_reason,
      senderNumber: row.sender_number,
      originalFilename: row.original_filename,
      parsedLeadCode: row.parsed_lead_code,
      parsedDocumentName: row.parsed_document_name,
      matchedLeadId: row.matched_lead_id,
      matchedDocumentId: row.matched_document_id,
      notifiedExecutive: row.notified_executive,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
    })));
  } catch (error) {
    console.error('WhatsApp intake logs error:', error);
    res.status(500).json({ error: 'Failed to fetch WhatsApp intake logs' });
  }
});

// GET /api/whatsapp-intake/logs/:leadCode/summary — quick per-lead counts, for a lead detail badge
router.get('/logs/lead/:leadId/summary', authenticate, authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_intake_log')
      .select('status')
      .eq('matched_lead_id', req.params.leadId);

    if (error) throw error;

    const summary = { processed: 0, failed: 0, duplicate: 0, received: 0 };
    (data || []).forEach((row) => { summary[row.status] = (summary[row.status] || 0) + 1; });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ── Official WhatsApp Business Cloud API webhook (future migration target) ──
// Only functional once WHATSAPP_INTAKE_PROVIDER=whatsapp-cloud is set; kept
// here, unauthenticated (Meta calls it directly), and signature-verified
// inside CloudApiAdapter itself. See docs/WHATSAPP_INTAKE.md.
router.get('/webhook', (req, res) => {
  const adapter = getCloudApiAdapter();
  if (!adapter) return res.sendStatus(404);
  adapter.handleVerificationRequest(req, res);
});

router.post('/webhook', (req, res) => {
  const adapter = getCloudApiAdapter();
  if (!adapter) return res.sendStatus(404);
  adapter.handleWebhookRequest(req, res);
});

export default router;
