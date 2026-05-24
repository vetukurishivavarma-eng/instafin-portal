/**
 * WhatsApp notification service for InstaFin Portal.
 * Uses WhatsApp Cloud API (Meta) to send notifications.
 * In production, configure with your WhatsApp Business Account credentials.
 */

const WHATSAPP_API_VERSION = 'v21.0';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || '';
const WHATSAPP_API_URL = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

/**
 * Send a WhatsApp text message
 */
async function sendWhatsAppMessage(to, message) {
  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.warn('⚠️ WhatsApp not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN env vars.');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const res = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('❌ WhatsApp API error:', data);
      return { success: false, error: data.error?.message || 'WhatsApp API error' };
    }

    console.log(`✅ WhatsApp message sent to ${to}: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send approval notification via WhatsApp to an executive
 */
export async function sendApprovalWhatsApp({ name, email, mobile }) {
  const message = `🎉 *InstaFin Portal - Access Approved!* 🎉

Hello ${name},

Your access request has been *approved* by the administrator! ✅

You can now log in to the portal:
📧 Email: ${email}
🔗 Login: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/login

Start managing leads, checklists, and loan processing right away!

- InstaFin Team`;

  // Note: WhatsApp requires the user to have messaged the business first (opt-in)
  // If mobile is not available, we skip WhatsApp notification
  if (!mobile) {
    console.log('⚠️ No mobile number provided, skipping WhatsApp notification');
    return { success: false, error: 'No mobile number' };
  }

  return sendWhatsAppMessage(mobile, message);
}

/**
 * Send rejection notification via WhatsApp
 */
export async function sendRejectionWhatsApp({ name, mobile }) {
  const message = `❌ *InstaFin Portal - Access Request Update* ❌

Hello ${name},

Unfortunately, your access request has been *rejected* by the administrator.

If you believe this is an error, please contact the administrator directly for assistance.

- InstaFin Team`;

  if (!mobile) {
    console.log('⚠️ No mobile number provided, skipping WhatsApp notification');
    return { success: false, error: 'No mobile number' };
  }

  return sendWhatsAppMessage(mobile, message);
}
