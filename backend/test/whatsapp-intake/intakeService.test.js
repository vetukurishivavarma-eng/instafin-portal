import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { processInboundDocument } from '../../src/whatsapp-intake/intakeService.js';
import { createFakeSupabase } from '../helpers/fakeSupabase.js';

const PDF_BUFFER = Buffer.from('%PDF-1.4 fake but well-formed for testing');

function baseMessage(overrides = {}) {
  return {
    provider: 'whatsapp-web',
    providerMessageId: `msg-${Math.random().toString(36).slice(2)}`,
    senderNumber: '919999999999',
    originalFilename: 'L10001_Aadhaar.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BUFFER,
    timestamp: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

const writtenFiles = [];
afterEach(() => {
  while (writtenFiles.length) {
    const f = writtenFiles.pop();
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

function trackWrittenFile(store) {
  const row = store.lead_checklist_status.at(-1);
  if (row?.file_path) writtenFiles.push(path.join(process.cwd(), 'uploads', row.file_path));
}

describe('processInboundDocument', () => {
  it('uploads a document for a known lead and matched document type', async () => {
    const { supabase, store } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test Customer', assigned_to: null, loan_type: 'home' }],
    });

    const result = await processInboundDocument(baseMessage(), { supabase });
    trackWrittenFile(store);

    expect(result.status).toBe('processed');
    expect(result.leadId).toBe('lead-1');
    expect(result.documentId).toBe('kyc_aadhaar');

    expect(store.lead_checklist_status).toHaveLength(1);
    expect(store.lead_checklist_status[0]).toMatchObject({ lead_id: 'lead-1', document_id: 'kyc_aadhaar', status: 'uploaded' });

    const logRow = store.whatsapp_intake_log[0];
    expect(logRow.status).toBe('processed');
    expect(logRow.matched_lead_id).toBe('lead-1');
    expect(logRow.notified_executive).toBe(false); // no SMTP configured in tests, no assigned executive either
  });

  it('fails clearly on an invalid filename', async () => {
    const { supabase, store } = createFakeSupabase();
    const result = await processInboundDocument(baseMessage({ originalFilename: 'not-a-valid-name.pdf' }), { supabase });

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('INVALID_FILENAME');
    expect(store.whatsapp_intake_log[0].status).toBe('failed');
    expect(store.lead_checklist_status).toHaveLength(0);
  });

  it('fails clearly on an unknown lead ID', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [] });
    const result = await processInboundDocument(baseMessage({ originalFilename: 'L99999_Aadhaar.pdf' }), { supabase });

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('UNKNOWN_LEAD');
    expect(store.whatsapp_intake_log[0].failure_reason).toContain('L99999');
  });

  it('fails clearly on an unsupported file type', async () => {
    const { supabase } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });
    const result = await processInboundDocument(
      baseMessage({ originalFilename: 'L10001_Aadhaar.exe', mimeType: 'application/octet-stream' }),
      { supabase }
    );

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('fails clearly on a corrupted file (content does not match extension)', async () => {
    const { supabase } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });
    const result = await processInboundDocument(
      baseMessage({ buffer: Buffer.from([0xff, 0xd8, 0xff]) }), // JPEG magic bytes, ".pdf" extension
      { supabase }
    );

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('CORRUPTED_FILE');
  });

  it('flags an unrecognized document name instead of guessing', async () => {
    const { supabase } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });
    const result = await processInboundDocument(baseMessage({ originalFilename: 'L10001_RandomStuff.pdf' }), { supabase });

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('DOCUMENT_TYPE_NOT_RECOGNIZED');
  });

  it('treats a provider-redelivered message (same provider_message_id) as a duplicate, not an error', async () => {
    const { supabase, store } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });
    const message = baseMessage();

    const first = await processInboundDocument(message, { supabase });
    trackWrittenFile(store);
    const second = await processInboundDocument(message, { supabase }); // identical providerMessageId

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(store.whatsapp_intake_log).toHaveLength(1); // second attempt never got its own row
    expect(store.lead_checklist_status).toHaveLength(1); // and never touched the checklist
  });

  it('treats identical file content re-sent under a new message as a duplicate upload', async () => {
    const { supabase, store } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });

    const first = await processInboundDocument(baseMessage({ providerMessageId: 'msg-a' }), { supabase });
    trackWrittenFile(store);
    const second = await processInboundDocument(baseMessage({ providerMessageId: 'msg-b' }), { supabase }); // different message, same file

    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(store.lead_checklist_status).toHaveLength(1); // no second checklist row created
  });

  it('allows a genuinely different document for the same lead after a first upload', async () => {
    const { supabase, store } = createFakeSupabase({
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null }],
    });

    await processInboundDocument(baseMessage({ providerMessageId: 'msg-1' }), { supabase });
    trackWrittenFile(store);
    const second = await processInboundDocument(
      baseMessage({ providerMessageId: 'msg-2', originalFilename: 'L10001_PAN.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xaa]) }),
      { supabase }
    );
    trackWrittenFile(store);

    expect(second.status).toBe('processed');
    expect(second.documentId).toBe('kyc_pan');
    expect(store.lead_checklist_status).toHaveLength(2);
  });
});
