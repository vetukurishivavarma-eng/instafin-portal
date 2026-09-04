import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { parseInboundFilename } from './filenameParser.js';
import { matchDocumentName } from './documentCatalog.js';
import { validateInboundFile } from './fileValidation.js';
import { notifyExecutiveOfUpload } from './notifyExecutive.js';

const uploadsDir = path.join(process.cwd(), 'uploads');

/**
 * @typedef {Object} IntakeResult
 * @property {'processed'|'duplicate'|'failed'} status
 * @property {string} [failureCode]
 * @property {string} [message]
 * @property {string} [leadId]
 * @property {string} [documentId]
 */

/**
 * Turns one NormalizedInboundMessage into a stored, checklist-linked
 * document — or a clearly-reasoned failure. Every outcome, success or not,
 * is written to whatsapp_intake_log so nothing is silently dropped.
 *
 * @param {import('./inboundAdapter.js').NormalizedInboundMessage} message
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 * @returns {Promise<IntakeResult>}
 */
export async function processInboundDocument(message, { supabase }) {
  const receivedAt = message.timestamp?.toISOString?.() || new Date().toISOString();

  // 1. Record receipt immediately, before any processing — if we crash
  // mid-way, the message is still on record as "received", not lost.
  const { data: logRow, error: logInsertError } = await supabase
    .from('whatsapp_intake_log')
    .insert({
      provider: message.provider,
      provider_message_id: message.providerMessageId,
      sender_number: message.senderNumber,
      original_filename: message.originalFilename,
      mime_type: message.mimeType,
      file_size_bytes: message.buffer?.length ?? 0,
      file_hash: message.buffer ? crypto.createHash('sha256').update(message.buffer).digest('hex') : null,
      status: 'received',
      received_at: receivedAt,
    })
    .select()
    .single();

  if (logInsertError) {
    // Unique violation on (provider, provider_message_id) means the provider
    // redelivered a message we already have on record — treat as a no-op,
    // not a failure.
    if (logInsertError.code === '23505') {
      console.log(`[WHATSAPP-INTAKE] Ignoring redelivered message ${message.providerMessageId}`);
      return { status: 'duplicate', message: 'Message already recorded (provider redelivery)' };
    }
    console.error('[WHATSAPP-INTAKE] Failed to write intake log:', logInsertError.message);
    return { status: 'failed', failureCode: 'LOG_WRITE_FAILED', message: logInsertError.message };
  }

  const fail = async (failureCode, humanMessage, extra = {}) => {
    console.warn(`[WHATSAPP-INTAKE] ${failureCode}: ${humanMessage} (message ${message.providerMessageId})`);
    await supabase
      .from('whatsapp_intake_log')
      .update({ status: 'failed', failure_code: failureCode, failure_reason: humanMessage, processed_at: new Date().toISOString(), ...extra })
      .eq('id', logRow.id);
    return { status: 'failed', failureCode, message: humanMessage };
  };

  // 2. Parse "<LeadID>_<DocumentName>.<ext>"
  const parsed = parseInboundFilename(message.originalFilename);
  if (!parsed.valid) {
    return fail(parsed.errorCode, parsed.error);
  }
  await supabase
    .from('whatsapp_intake_log')
    .update({ parsed_lead_code: parsed.leadCode, parsed_document_name: parsed.documentName })
    .eq('id', logRow.id);

  // 3. File integrity / type / size — independent of the lead, so check
  // before spending a DB round trip on lead lookup.
  const fileCheck = validateInboundFile({ buffer: message.buffer, extension: parsed.extension });
  if (!fileCheck.valid) {
    return fail(fileCheck.errorCode, fileCheck.error);
  }

  // 4. Resolve the lead
  const { data: lead, error: leadLookupError } = await supabase
    .from('leads')
    .select('id, lead_code, customer_name, assigned_to, loan_type')
    .eq('lead_code', parsed.leadCode)
    .maybeSingle();

  if (leadLookupError) {
    return fail('LEAD_LOOKUP_FAILED', leadLookupError.message);
  }
  if (!lead) {
    return fail('UNKNOWN_LEAD', `No lead found with ID ${parsed.leadCode}`);
  }

  // 5. Resolve the document type against the known catalog. See
  // documentCatalog.js for the scoping note on why this checks "is this a
  // real document type" rather than "is this required for this exact lead".
  const match = matchDocumentName(parsed.documentName);
  if (!match) {
    return fail(
      'DOCUMENT_TYPE_NOT_RECOGNIZED',
      `"${parsed.documentName}" does not match any known document type`,
      { matched_lead_id: lead.id }
    );
  }

  // 6. Duplicate detection — same lead, same resolved document type, same
  // file content, already processed successfully before.
  const { data: priorMatch } = await supabase
    .from('whatsapp_intake_log')
    .select('id')
    .eq('matched_lead_id', lead.id)
    .eq('matched_document_id', match.documentId)
    .eq('file_hash', logRow.file_hash)
    .eq('status', 'processed')
    .limit(1)
    .maybeSingle();

  if (priorMatch) {
    await supabase
      .from('whatsapp_intake_log')
      .update({ status: 'duplicate', matched_lead_id: lead.id, matched_document_id: match.documentId, processed_at: new Date().toISOString() })
      .eq('id', logRow.id);
    return { status: 'duplicate', message: 'Identical file already uploaded for this document type', leadId: lead.id, documentId: match.documentId };
  }

  // 7. Persist the file. Unlike the manual checklist upload (routes/
  // checklistStatus.js), this can NOT key off NODE_ENV === 'production':
  // the whole point of scripts/run-whatsapp-intake-local.js is running the
  // intake process on a different machine than the one serving the portal
  // (Render). "Save locally" there means the customer's PC, invisible to
  // the deployed API's own local disk — the portal's file-download route
  // would 404/error trying to find it (observed 2026-09-05). Always use
  // Supabase Storage so the file is visible regardless of where intake ran,
  // unless explicitly opted out for same-machine local dev.
  let storedFilePath;
  if (process.env.WHATSAPP_INTAKE_STORAGE !== 'local') {
    const storagePath = `${lead.id}/${uuidv4()}-${message.originalFilename}`;
    const { error: storageError } = await supabase.storage
      .from('lead-documents')
      .upload(storagePath, message.buffer, { contentType: message.mimeType });
    if (storageError) {
      return fail('STORAGE_WRITE_FAILED', storageError.message, { matched_lead_id: lead.id, matched_document_id: match.documentId });
    }
    storedFilePath = storagePath;
  } else {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const localName = `${uuidv4()}-${message.originalFilename}`;
    fs.writeFileSync(path.join(uploadsDir, localName), message.buffer);
    storedFilePath = localName;
  }

  // 8. Link it to the lead's checklist, exactly as a manual upload would.
  const documentName = JSON.stringify({
    name: match.documentId,
    description: `Received via WhatsApp from ${message.senderNumber}`,
    originalFile: message.originalFilename,
  });

  const { data: checklistRow, error: checklistInsertError } = await supabase
    .from('lead_checklist_status')
    .insert({
      lead_id: lead.id,
      document_id: match.documentId,
      document_name: documentName,
      status: 'uploaded',
      file_path: storedFilePath,
      uploaded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (checklistInsertError) {
    return fail('CHECKLIST_WRITE_FAILED', checklistInsertError.message, { matched_lead_id: lead.id, matched_document_id: match.documentId });
  }

  // 9. Notify the assigned executive (best-effort — never fails the upload).
  const notified = await notifyExecutiveOfUpload({
    supabase,
    lead,
    documentLabel: match.documentId,
    senderNumber: message.senderNumber,
  });

  await supabase
    .from('whatsapp_intake_log')
    .update({
      status: 'processed',
      matched_lead_id: lead.id,
      matched_document_id: match.documentId,
      checklist_status_id: checklistRow.id,
      notified_executive: notified,
      processed_at: new Date().toISOString(),
    })
    .eq('id', logRow.id);

  console.log(`[WHATSAPP-INTAKE] Processed ${message.originalFilename} → lead ${lead.lead_code}, document ${match.documentId}`);

  return { status: 'processed', leadId: lead.id, documentId: match.documentId };
}

/**
 * Records an inbound WhatsApp attachment that had no usable filename — sent
 * as a Photo rather than a Document, so there was nothing to parse a Lead ID
 * from. Kept separate from processInboundDocument() since there is no file
 * to validate or store; this exists purely so the failure is visible on the
 * portal's WhatsApp Intake page instead of only in server/terminal logs.
 *
 * @param {{ providerMessageId: string, senderNumber: string, messageType?: string, mimeType?: string }} info
 * @param {{ supabase: import('@supabase/supabase-js').SupabaseClient }} deps
 */
export async function logIgnoredMessage({ providerMessageId, senderNumber, messageType, mimeType }, { supabase }) {
  const { error } = await supabase.from('whatsapp_intake_log').insert({
    provider: 'whatsapp-web',
    provider_message_id: providerMessageId,
    sender_number: senderNumber,
    original_filename: '(no filename — likely sent as a Photo, not a Document)',
    mime_type: mimeType || null,
    status: 'failed',
    failure_code: 'NO_FILENAME',
    failure_reason: `WhatsApp did not preserve an original filename for this attachment (message type: ${messageType || 'unknown'}). Ask the sender to resend it using the paperclip's "Document" option, not "Photo".`,
    received_at: new Date().toISOString(),
    processed_at: new Date().toISOString(),
  });

  if (error && error.code !== '23505') {
    // 23505 = provider redelivered the same message; anything else is worth knowing about.
    console.error('[WHATSAPP-INTAKE] Failed to log ignored message:', error.message);
  }
}
