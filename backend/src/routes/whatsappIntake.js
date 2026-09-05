import express from 'express';
import { supabase } from '../lib/supabase.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { getWhatsAppIntakeStatus, getWhatsAppIntakeQr, getCloudApiAdapter } from '../whatsapp-intake/index.js';

const router = express.Router();

// When the WhatsApp session runs in a separate deployed worker (see
// scripts/run-whatsapp-intake-local.js) instead of this process — the usual
// setup, since a real WhatsApp Web session needs more RAM than this API's
// free-tier instance can spare alongside itself — WHATSAPP_INTAKE_WORKER_URL
// points at that worker's own /status.json, and these routes proxy it so the
// portal's admin UI keeps working unmodified either way.
async function fetchWorkerStatus() {
  const workerUrl = process.env.WHATSAPP_INTAKE_WORKER_URL;
  if (!workerUrl) return null;
  const res = await fetch(`${workerUrl}/status.json`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Worker responded ${res.status}`);
  return res.json();
}

// GET /api/whatsapp-intake/status — connection state for the admin monitoring screen
router.get('/status', authenticate, authorize('admin', 'operations_head'), async (req, res) => {
  const local = getWhatsAppIntakeStatus();
  if (local.connectionStatus !== 'not_started') return res.json(local);

  try {
    const worker = await fetchWorkerStatus();
    if (!worker) return res.json(local);
    res.json({
      enabled: true,
      provider: 'whatsapp-web',
      connectionStatus: worker.connectionStatus,
      lastError: worker.lastError,
      qrAvailable: !!worker.qrDataUrl,
    });
  } catch (err) {
    res.json({ ...local, lastError: `Worker unreachable: ${err.message}` });
  }
});

// GET /api/whatsapp-intake/qr — current QR code (data URL) to link a WhatsApp device
router.get('/qr', authenticate, authorize('admin', 'operations_head'), async (req, res) => {
  const localQr = getWhatsAppIntakeQr();
  if (localQr) return res.json({ qr: localQr });

  try {
    const worker = await fetchWorkerStatus();
    if (!worker?.qrDataUrl) return res.status(404).json({ error: 'No QR code available (already connected, or not started)' });
    res.json({ qr: worker.qrDataUrl });
  } catch (err) {
    res.status(502).json({ error: `Worker unreachable: ${err.message}` });
  }
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
      downloadName: row.download_name,
      hasFile: !!row.storage_path,
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

// GET /api/whatsapp-intake/documents/lead/:leadId — raw group-intake files
// captured for a lead and not yet placed into its checklist. Feeds the
// "WhatsApp documents" panel on the lead's checklist page.
router.get('/documents/lead/:leadId', authenticate, authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_intake_log')
      .select('id, original_filename, download_name, mime_type, file_size_bytes, sender_number, received_at, storage_path')
      .eq('matched_lead_id', req.params.leadId)
      .eq('status', 'unassigned')
      .order('received_at', { ascending: false });

    if (error) throw error;

    res.json((data || []).map((row) => ({
      id: row.id,
      fileName: row.download_name || row.original_filename,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      senderNumber: row.sender_number,
      receivedAt: row.received_at,
    })));
  } catch (error) {
    console.error('WhatsApp intake documents error:', error);
    res.status(500).json({ error: 'Failed to fetch WhatsApp intake documents' });
  }
});

// GET /api/whatsapp-intake/file/:logId — download one captured file.
router.get('/file/:logId', authenticate, authorize('admin', 'operations_head', 'executive', 'dsa'), async (req, res) => {
  try {
    const { data: row, error } = await supabase
      .from('whatsapp_intake_log')
      .select('storage_path, download_name, original_filename')
      .eq('id', req.params.logId)
      .maybeSingle();

    if (error) throw error;
    if (!row?.storage_path) return res.status(404).json({ error: 'File not found' });

    const downloadName = row.download_name || row.original_filename || 'document';

    // The intake session usually runs as its own process writing to Supabase
    // Storage; only same-machine local dev (WHATSAPP_INTAKE_STORAGE=local)
    // puts files on this box's disk. Try Storage first, fall back to local.
    const { data: signed, error: signErr } = await supabase.storage
      .from('lead-documents')
      .createSignedUrl(row.storage_path, 3600);

    if (!signErr && signed?.signedUrl) return res.redirect(signed.signedUrl);

    const { default: fs } = await import('fs');
    const { default: path } = await import('path');
    const localPath = path.join(process.cwd(), 'uploads', row.storage_path);
    if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'File not found' });
    return res.download(localPath, downloadName);
  } catch (error) {
    console.error('WhatsApp intake file download error:', error);
    res.status(500).json({ error: 'Failed to download file' });
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
