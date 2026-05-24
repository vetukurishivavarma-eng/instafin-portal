import nodemailer from 'nodemailer';

// Configure email transporter
// In production, use real SMTP credentials from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'noreply@instafin.com',
    pass: process.env.SMTP_PASS || '',
  },
});

const FROM_EMAIL = process.env.SMTP_FROM || 'noreply@instafin.com';
const APP_NAME = 'InstaFin Portal';

/**
 * Send approval notification email to an executive
 */
export async function sendApprovalEmail({ name, email, password }) {
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

    console.log(`✅ Approval email sent to ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send approval email to ${email}:`, error.message);
    // Don't throw - we don't want to break the approval flow if email fails
    return { success: false, error: error.message };
  }
}

/**
 * Send rejection notification email to an executive
 */
export async function sendRejectionEmail({ name, email }) {
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

    console.log(`✅ Rejection email sent to ${email}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send rejection email to ${email}:`, error.message);
    return { success: false, error: error.message };
  }
}
