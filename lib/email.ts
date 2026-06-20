import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@cngbharat.com';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using Resend
 */
export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    if (!resend) {
      return false;
    }
    
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate OTP
 */
export function generateOTP(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Send OTP email for verification
 */
export async function sendVerificationOTP(email: string, otp: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; position: relative;">
          <div style="background: white; width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.15); padding: 10px;">
            <img src="https://cngbharat.com/logo.png" alt="CNG Bharat Logo" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
          </div>
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">CNG Bharat</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Clean Energy Solutions</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #10b981; padding: 30px; border-radius: 16px; margin: 20px 0;">
              <h2 style="color: #059669; margin: 0 0 15px; font-size: 24px; font-weight: 600;">Email Verification</h2>
              <p style="color: #6b7280; margin: 0 0 25px; font-size: 16px;">Thank you for registering with CNG Bharat. Please use the verification code below to complete your email verification:</p>
              <div style="background: white; border: 2px dashed #10b981; padding: 25px; border-radius: 12px; margin: 25px 0;">
                <span style="font-size: 42px; font-weight: bold; color: #059669; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 20px 0 0;">
                <strong>Important:</strong> This verification code is valid for <strong>10 minutes</strong> only.
              </p>
            </div>
          </div>
          
          <!-- Security Notice -->
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0; border-radius: 8px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              <strong>🔒 Security Notice:</strong> If you didn't request this verification, please ignore this email. Your account will remain secure.
            </p>
          </div>
          
          <!-- Support Info -->
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px;">Need help? Contact our support team</p>
            <p style="color: #10b981; font-size: 14px; margin: 0; font-weight: 600;">support@cngbharat.com</p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 10px;">&copy; 2024 CNG Bharat. All rights reserved.</p>
          <p style="color: #9ca3af; font-size: 11px; margin: 0;">This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify Your Email - CNG Bharat',
    html,
  });
}

/**
 * Send OTP email for password reset
 */
export async function sendPasswordResetOTP(email: string, otp: string): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f8fafc;">
      <div style="max-width: 600px; margin: 20px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
        <!-- Header with Logo -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; position: relative;">
          <div style="background: white; width: 100px; height: 100px; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.15); padding: 10px;">
            <img src="https://cngbharat.com/logo.png" alt="CNG Bharat Logo" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover;" />
          </div>
          <h1 style="color: white; margin: 0; font-size: 32px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">CNG Bharat</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Clean Energy Solutions</p>
        </div>
        
        <!-- Content -->
        <div style="padding: 40px 30px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #10b981; padding: 30px; border-radius: 16px; margin: 20px 0;">
              <h2 style="color: #059669; margin: 0 0 15px; font-size: 24px; font-weight: 600;">Password Reset Request</h2>
              <p style="color: #6b7280; margin: 0 0 25px; font-size: 16px;">We received a request to reset your password. Please use the verification code below to proceed:</p>
              <div style="background: white; border: 2px dashed #10b981; padding: 25px; border-radius: 12px; margin: 25px 0;">
                <span style="font-size: 42px; font-weight: bold; color: #059669; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</span>
              </div>
              <p style="color: #6b7280; font-size: 14px; margin: 20px 0 0;">
                <strong>Important:</strong> This reset code is valid for <strong>10 minutes</strong> only.
              </p>
            </div>
          </div>
          
          <!-- Security Notice -->
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0; border-radius: 8px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              <strong>🔒 Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </p>
          </div>
          
          <!-- Steps -->
          <div style="background: #f0f9ff; border: 1px solid #0ea5e9; padding: 20px; margin: 30px 0; border-radius: 8px;">
            <h3 style="color: #0c4a6e; margin: 0 0 15px; font-size: 16px; font-weight: 600;">📋 Next Steps:</h3>
            <ol style="color: #6b7280; margin: 0; padding-left: 20px; font-size: 14px;">
              <li style="margin-bottom: 8px;">Enter this verification code in the app</li>
              <li style="margin-bottom: 8px;">Create your new password</li>
              <li>Log in with your new password</li>
            </ol>
          </div>
          
          <!-- Support Info -->
          <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px; margin: 0 0 10px;">Need help? Contact our support team</p>
            <p style="color: #10b981; font-size: 14px; margin: 0; font-weight: 600;">support@cngbharat.com</p>
          </div>
        </div>
        
        <!-- Footer -->
        <div style="background: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 10px;">&copy; 2024 CNG Bharat. All rights reserved.</p>
          <p style="color: #9ca3af; font-size: 11px; margin: 0;">This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Reset Your Password - CNG Bharat',
    html,
  });
}

/**
 * Send email when withdrawal request is submitted
 */
export async function sendWithdrawalSubmittedEmail(
  email: string,
  name: string,
  amount: number,
  method: string,
  deadline: Date
): Promise<boolean> {
  const formattedDeadline = deadline.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Withdrawal Request Submitted</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Withdrawal Submitted</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${name},</p>
          <p>Your withdrawal request has been successfully submitted and is currently <strong>Pending Review</strong>.</p>
          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px;"><strong>Amount:</strong> ₹${amount}</p>
            <p style="margin: 0 0 10px;"><strong>Payment Method:</strong> ${method === 'upi' ? 'UPI' : 'Bank Account'}</p>
            <p style="margin: 0;"><strong>Estimated Processed By:</strong> ${formattedDeadline}</p>
          </div>
          <p>Our team manually reviews and processes all withdrawals within 24 hours. You will receive another notification once your request has been updated.</p>
          <p style="color: #64748b; font-size: 14px;">If you did not request this withdrawal, please contact our support team immediately.</p>
        </div>
        <div style="background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <p>&copy; ${new Date().getFullYear()} CNG Bharat. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: `Withdrawal Request Submitted - ₹${amount}`,
    html,
  });
}

/**
 * Send email when withdrawal request status updates
 */
export async function sendWithdrawalStatusEmail(
  email: string,
  name: string,
  amount: number,
  status: 'processing' | 'paid' | 'rejected',
  method: string,
  remarks?: string | null
): Promise<boolean> {
  let statusTitle = '';
  let statusText = '';
  let statusColor = '';
  let subject = '';

  if (status === 'processing') {
    statusTitle = 'Withdrawal Approved';
    statusText = `Your withdrawal request of ₹${amount} has been approved and is now being processed. It should be credited to your account shortly.`;
    statusColor = '#3b82f6';
    subject = `Withdrawal Approved & Processing - ₹${amount}`;
  } else if (status === 'paid') {
    statusTitle = 'Withdrawal Completed';
    statusText = `Congratulations! Your withdrawal request of ₹${amount} has been processed and paid successfully to your ${method === 'upi' ? 'UPI ID' : 'Bank Account'}.`;
    statusColor = '#10b981';
    subject = `Withdrawal Paid Successfully - ₹${amount}`;
  } else {
    statusTitle = 'Withdrawal Rejected';
    statusText = `Your withdrawal request of ₹${amount} has been rejected by admin.`;
    statusColor = '#ef4444';
    subject = `Withdrawal Request Rejected - ₹${amount}`;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${statusTitle}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
        <div style="background: ${statusColor}; padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">${statusTitle}</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hi ${name},</p>
          <p>${statusText}</p>
          
          <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px;"><strong>Amount:</strong> ₹${amount}</p>
            <p style="margin: 0 0 10px;"><strong>Payment Method:</strong> ${method === 'upi' ? 'UPI' : 'Bank Account'}</p>
            <p style="margin: 0 0 10px;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${status}</span></p>
            ${remarks ? `<p style="margin: 0;"><strong>Admin Remarks:</strong> ${remarks}</p>` : ''}
          </div>
          
          ${status === 'rejected' ? '<p>The requested amount has been refunded back to your available wallet balance.</p>' : ''}
          
          <p>If you have any questions, please contact our support team at support@cngbharat.com.</p>
        </div>
        <div style="background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          <p>&copy; ${new Date().getFullYear()} CNG Bharat. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject,
    html,
  });
}

