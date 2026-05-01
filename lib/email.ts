import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
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
    console.log('Sending email to:', to);
    console.log('From:', FROM_EMAIL);
    console.log('Subject:', subject);
    
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    
    console.log('Email sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
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
