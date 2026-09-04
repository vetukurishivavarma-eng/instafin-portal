import { sendEmail } from '../services/email.service.js';

/**
 * Resolves the executive assigned to a lead. `leads.assigned_to` historically
 * stores either a users.id (uuid) or, for older rows, the executive's plain
 * name — mirrors the fallback already used in routes/leads.js.
 */
export async function resolveAssignedExecutive(supabase, lead) {
  if (!lead?.assigned_to) return null;

  const byId = await supabase.from('users').select('id, name, email').eq('id', lead.assigned_to).maybeSingle();
  if (byId.data) return byId.data;

  const byName = await supabase.from('users').select('id, name, email').eq('name', lead.assigned_to).maybeSingle();
  return byName.data || null;
}

/**
 * Best-effort notification — a failure here must never fail the upload
 * itself, since the document is already safely stored by the time this runs.
 * @returns {Promise<boolean>} whether a notification was sent
 */
export async function notifyExecutiveOfUpload({ supabase, lead, documentLabel, senderNumber }) {
  try {
    const executive = await resolveAssignedExecutive(supabase, lead);
    if (!executive?.email) return false;

    const result = await sendEmail({
      to: executive.email,
      subject: `📄 New document via WhatsApp — ${lead.customer_name} (${lead.lead_code})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
          <h2 style="color:#1e293b;">New document received</h2>
          <p style="color:#475569;">
            <strong>${lead.customer_name}</strong> (Lead ${lead.lead_code}) sent
            <strong>${documentLabel}</strong> over WhatsApp from ${senderNumber}.
          </p>
          <p style="color:#475569;">It has been uploaded to their checklist and marked as received.</p>
          <p style="color:#94a3b8; font-size:12px;">InstaFin Portal — automated WhatsApp intake</p>
        </div>
      `,
    });

    return result.success;
  } catch (err) {
    console.error('[WHATSAPP-INTAKE] Failed to notify executive:', err.message);
    return false;
  }
}
