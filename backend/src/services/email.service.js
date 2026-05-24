import nodemailer from 'nodemailer';

// ──────────────────────────────────────────────
// SMTP Configuration (read from environment)
// ──────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.SMTP_FROM || SMTP_USER || 'noreply@instafin.com';
const APP_NAME = 'InstaFin Portal';

console.log(`[EMAIL] SMTP Config: host=${SMTP_HOST} port=${SMTP_PORT} secure=${SMTP_SECURE} user=${SMTP_USER} from=${FROM_EMAIL}`);
console.log(`[EMAIL] SMTP_PASS is ${SMTP_PASS ? 'SET (' + SMTP_PASS.length + ' chars)' : 'NOT SET — email will fail!'}`);

// Configure email transporter with timeouts so it fails fast instead of hanging
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  connectionTimeout: 10000,  // 10 seconds to connect
  greetingTimeout: 10000,     // 10 seconds for server greeting
  socketTimeout: 15000,       // 15 seconds overall socket timeout
});

// Verify transporter connection on startup (asynchronously)
setTimeout(async () => {
  try {
    await transporter.verify();
    console.log('[EMAIL] ✅ SMTP connection verified successfully');
  } catch (err) {
    console.error('[EMAIL] ❌ SMTP connection verification FAILED:', err.message);
    console.error('[EMAIL] ❌ Full error:', err.stack || err);
  }
}, 1000);

/**
 * Test SMTP connection by sending a test email to the admin
 */
export async function testEmailConnection({ email }) {
  console.log(`[EMAIL] Running SMTP connection test, will send test to ${email}`);

  if (!SMTP_USER || !SMTP_PASS) {
    console.error(`[EMAIL] ❌ SMTP credentials not configured. SMTP_USER=${SMTP_USER ? 'SET' : 'NOT SET'}, SMTP_PASS=${SMTP_PASS ? 'SET' : 'NOT SET'}`);
    return { success: false, error: 'SMTP credentials not configured. Add SMTP_USER and SMTP_PASS env vars.' };
  }

  try {
    // First verify the connection
    console.log('[EMAIL] Verifying SMTP connection...');
    await transporter.verify();
    console.log('[EMAIL] ✅ SMTP connection verified, now sending test email...');

    // Send a test email
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: email,
      subject: `🧪 ${APP_NAME} - SMTP Test Email`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #2563EB, #16a34a); padding: 30px; border-radius: 12px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">✅ SMTP Test Successful!</h1>
          </div>
          <div style="background: white; padding: 30px; border-radius: 12px; margin-top: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">Hello Admin,</h2>
            <p style="color: #475569; line-height: 1.6;">
              This is a test email from your <strong>${APP_NAME}</strong> backend.
              SMTP is configured correctly and working! 🎉
            </p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">Host</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${SMTP_HOST}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">Port</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${SMTP_PORT}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">User</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${SMTP_USER}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold;">From</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${FROM_EMAIL}</td></tr>
            </table>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">${APP_NAME} - Email Service Test</p>
          </div>
        </div>
      `,
    });

    console.log(`[EMAIL] ✅ Test email sent to ${email}: messageId=${info.messageId} response=${info.response}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL] ❌ SMTP test FAILED: ${error.message}`);
    console.error(`[EMAIL] ❌ Error code: ${error.code || 'N/A'}, command: ${error.command || 'N/A'}`);
    console.error(`[EMAIL] ❌ Full stack:`, error.stack || error);
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Send approval notification email to an executive
 */
export async function sendApprovalEmail({ name, email, password }) {
  console.log(`[EMAIL] Attempting to send APPROVAL email to ${email} via ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);

  if (!SMTP_USER || !SMTP_PASS) {
    console.error(`[EMAIL] ❌ SMTP credentials not configured. SMTP_USER=${SMTP_USER ? 'SET' : 'NOT SET'}, SMTP_PASS=${SMTP_PASS ? 'SET' : 'NOT SET'}`);
    return { success: false, error: 'SMTP credentials not configured. Add SMTP_USER and SMTP_PASS env vars.' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: email,
      subject: `🎉 ${APP_NAME} - Your Access Request Has Been Approved!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #2563EB, #7C3AED); padding: 30px; border-radius: 12px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🎉 Access Approved!</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 12px; margin-top: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">Hello ${name},</h2>
            
            <p style="color: #475569; line-height: 1.6;">
              Great news! Your access request for the <strong>InstaFin Portal</strong> has been 
              <strong style="color: #16a34a;">approved</strong> by the administrator.
            </p>
            
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin: 0 0 10px;">Your Login Credentials</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> (the password you set during registration)</p>
            </div>
            
            <p style="color: #475569; line-height: 1.6;">
              You can now log in to the portal and start managing leads, checklists, 
              and other loan processing tasks.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" 
                 style="background: #2563EB; color: white; padding: 14px 32px; border-radius: 12px; 
                        text-decoration: none; font-weight: bold; display: inline-block;">
                Login to Portal →
              </a>
            </div>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              If you did not request this access, please ignore this email.<br />
              ${APP_NAME} - Streamline Your Loan Management
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[EMAIL] ✅ Approval email sent to ${email}: messageId=${info.messageId} response=${info.response}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL] ❌ Failed to send approval email to ${email}: ${error.message}`);
    console.error(`[EMAIL] ❌ Error code: ${error.code || 'N/A'}, command: ${error.command || 'N/A'}`);
    console.error(`[EMAIL] ❌ Full stack:`, error.stack || error);
    // Don't throw - we don't want to break the approval flow if email fails
    return { success: false, error: error.message, code: error.code };
  }
}

/**
 * Send rejection notification email to an executive
 */
export async function sendRejectionEmail({ name, email }) {
  console.log(`[EMAIL] Attempting to send REJECTION email to ${email} via ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);

  if (!SMTP_USER || !SMTP_PASS) {
    console.error(`[EMAIL] ❌ SMTP credentials not configured. SMTP_USER=${SMTP_USER ? 'SET' : 'NOT SET'}, SMTP_PASS=${SMTP_PASS ? 'SET' : 'NOT SET'}`);
    return { success: false, error: 'SMTP credentials not configured. Add SMTP_USER and SMTP_PASS env vars.' };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_EMAIL}>`,
      to: email,
      subject: `❌ ${APP_NAME} - Access Request Update`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8fafc; border-radius: 16px;">
          <div style="background: linear-gradient(135deg, #DC2626, #9333EA); padding: 30px; border-radius: 12px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Access Request Update</h1>
          </div>
          
          <div style="background: white; padding: 30px; border-radius: 12px; margin-top: 20px;">
            <h2 style="color: #1e293b; margin-top: 0;">Hello ${name},</h2>
            
            <p style="color: #475569; line-height: 1.6;">
              Unfortunately, your access request for the <strong>InstaFin Portal</strong> has been 
              <strong style="color: #dc2626;">rejected</strong> by the administrator.
            </p>
            
            <p style="color: #475569; line-height: 1.6;">
              If you believe this is an error, please contact the administrator directly 
              for further assistance.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            
            <p style="color: #94a3b8; font-size: 12px; text-align: center;">
              ${APP_NAME} - Streamline Your Loan Management
            </p>
          </div>
        </div>
      `,
    });

    console.log(`[EMAIL] ✅ Rejection email sent to ${email}: messageId=${info.messageId} response=${info.response}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EMAIL] ❌ Failed to send rejection email to ${email}: ${error.message}`);
    console.error(`[EMAIL] ❌ Error code: ${error.code || 'N/A'}, command: ${error.command || 'N/A'}`);
    console.error(`[EMAIL] ❌ Full stack:`, error.stack || error);
    return { success: false, error: error.message, code: error.code };
  }
}
