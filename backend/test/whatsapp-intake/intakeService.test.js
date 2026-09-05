import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { processInboundDocument, processInboundBySender } from '../../src/whatsapp-intake/intakeService.js';
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
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test Customer', assigned_to: null, loan_type: 'home_loan', loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' }],
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

  it('flags a real document type that is not part of this lead\'s checklist', async () => {
    const { supabase } = createFakeSupabase({
      // MSME leads never have a property checklist, so a home-loan-only
      // document type (Sale Deed) is real but not required here.
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null, loan_type: 'msme', loan_status: 'new' }],
    });
    const result = await processInboundDocument(baseMessage({ originalFilename: 'L10001_Sale_Deed.pdf' }), { supabase });

    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('DOCUMENT_NOT_REQUIRED_FOR_LEAD');
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
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null, loan_type: 'home_loan', loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' }],
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
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null, loan_type: 'home_loan', loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' }],
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
      leads: [{ id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null, loan_type: 'home_loan', loan_status: 'new', income_source: 'salaried', resident_type: 'indian_resident' }],
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

function senderMessage(overrides = {}) {
  return {
    provider: 'whatsapp-cloud',
    providerMessageId: `s-${Math.random().toString(36).slice(2)}`,
    senderNumber: '919812345678',
    originalFilename: 'whatsapp-2026-01-01.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BUFFER,
    timestamp: new Date('2026-01-01T10:00:00Z'),
    ...overrides,
  };
}

const LEAD = { id: 'lead-1', lead_code: 'L10001', customer_name: 'Test', assigned_to: null, mobile: '9812345678' };

function trackGroupFile(store) {
  const row = store.whatsapp_intake_log.at(-1);
  if (row?.storage_path) writtenFiles.push(path.join(process.cwd(), 'uploads', row.storage_path));
}

describe('processInboundBySender', () => {
  it('captures a file, matching the lead by the sender phone number, as unassigned', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [LEAD] });

    const result = await processInboundBySender(senderMessage(), { supabase });
    trackGroupFile(store);

    expect(result.status).toBe('unassigned');
    expect(result.leadId).toBe('lead-1');
    expect(store.lead_checklist_status).toHaveLength(0); // not placed yet
    const log = store.whatsapp_intake_log[0];
    expect(log.status).toBe('unassigned');
    expect(log.matched_lead_id).toBe('lead-1');
    expect(log.parsed_lead_code).toBe('L10001');
    expect(log.storage_path).toBeTruthy();
    expect(log.download_name).toBe('whatsapp-2026-01-01.pdf');
  });

  it('matches on the last 10 digits when mobile is stored with a country code', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [{ ...LEAD, mobile: '919812345678' }] });
    const result = await processInboundBySender(senderMessage(), { supabase });
    trackGroupFile(store);
    expect(result.status).toBe('unassigned');
  });

  it('captures a photo (synthesized filename, no naming convention needed)', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [LEAD] });
    const result = await processInboundBySender(
      senderMessage({ originalFilename: 'whatsapp-2026-01-01.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01]) }),
      { supabase }
    );
    trackGroupFile(store);
    expect(result.status).toBe('unassigned');
  });

  it('routes through processInboundDocument when WHATSAPP_INTAKE_MATCH=sender', async () => {
    const prev = process.env.WHATSAPP_INTAKE_MATCH;
    process.env.WHATSAPP_INTAKE_MATCH = 'sender';
    try {
      const { supabase, store } = createFakeSupabase({ leads: [LEAD] });
      const result = await processInboundDocument(senderMessage(), { supabase });
      trackGroupFile(store);
      expect(result.status).toBe('unassigned');
    } finally {
      if (prev === undefined) delete process.env.WHATSAPP_INTAKE_MATCH;
      else process.env.WHATSAPP_INTAKE_MATCH = prev;
    }
  });

  it('fails when no lead has the sender phone number', async () => {
    const { supabase } = createFakeSupabase({ leads: [] });
    const result = await processInboundBySender(senderMessage(), { supabase });
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('UNKNOWN_SENDER');
  });

  it('fails when more than one lead shares the sender phone number', async () => {
    const { supabase } = createFakeSupabase({
      leads: [LEAD, { ...LEAD, id: 'lead-2', lead_code: 'L10002' }],
    });
    const result = await processInboundBySender(senderMessage(), { supabase });
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('AMBIGUOUS_SENDER');
  });

  it('rejects an unsupported file type', async () => {
    const { supabase } = createFakeSupabase({ leads: [LEAD] });
    const result = await processInboundBySender(
      senderMessage({ originalFilename: 'whatsapp.bin', mimeType: 'application/octet-stream' }),
      { supabase }
    );
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('treats the same file content re-sent by the sender as a duplicate', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [LEAD] });
    const first = await processInboundBySender(senderMessage({ providerMessageId: 's-1' }), { supabase });
    trackGroupFile(store);
    const second = await processInboundBySender(senderMessage({ providerMessageId: 's-2' }), { supabase });

    expect(first.status).toBe('unassigned');
    expect(second.status).toBe('duplicate');
    expect(store.whatsapp_intake_log.filter((r) => r.status === 'unassigned')).toHaveLength(1);
  });

  it('treats a provider-redelivered message as a duplicate', async () => {
    const { supabase, store } = createFakeSupabase({ leads: [LEAD] });
    const msg = senderMessage({ providerMessageId: 's-same' });
    const first = await processInboundBySender(msg, { supabase });
    trackGroupFile(store);
    const second = await processInboundBySender(msg, { supabase });
    expect(first.status).toBe('unassigned');
    expect(second.status).toBe('duplicate');
    expect(store.whatsapp_intake_log).toHaveLength(1);
  });
});
