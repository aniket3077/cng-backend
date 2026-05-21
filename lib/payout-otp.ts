import crypto from 'crypto';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
export function generatePayoutOtp(): string {
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = randomBytes.readUInt32BE(0);
  return (randomNumber % 1_000_000).toString().padStart(OTP_LENGTH, '0');
}

/**
 * Store a fresh OTP in the database, invalidating any previous unexpired OTPs
 * for the same user to prevent replay.
 */
export async function createPayoutOtp(userId: string): Promise<string> {
  const otp = generatePayoutOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Invalidate existing active OTPs
  await prisma.payoutOtp.updateMany({
    where: { userId, verified: false, expiresAt: { gte: new Date() } },
    data: { verified: true },
  });

  await prisma.payoutOtp.create({
    data: { userId, otp, expiresAt, verified: false },
  });

  return otp;
}

/**
 * Verify OTP and mark it as consumed so it cannot be reused.
 */
export async function verifyPayoutOtp(userId: string, otpCode: string): Promise<boolean> {
  const otpRecord = await prisma.payoutOtp.findFirst({
    where: { userId, otp: otpCode, verified: false, expiresAt: { gte: new Date() } },
  });

  if (!otpRecord) {
    return false;
  }

  await prisma.payoutOtp.update({
    where: { id: otpRecord.id },
    data: { verified: true },
  });

  return true;
}

/**
 * Send the payout OTP to the user's registered email via Resend.
 * Requires RESEND_API_KEY and FROM_EMAIL environment variables.
 */
export async function sendPayoutOtpEmail(
  userId: string,
  email: string,
  otp: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    // Fail loudly in production; silently skip in development so local testing works.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email service is not configured (RESEND_API_KEY / FROM_EMAIL missing)');
    }
    console.warn(`[OTP-DEV] Payout OTP for user ${userId}: ${otp} (email not sent — no RESEND_API_KEY)`);
    return;
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: fromEmail,
    to: email,
    subject: 'CNG Bharat — Your Payout Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Payout Verification</h2>
        <p>Use the code below to confirm your withdrawal request. It expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;text-align:center;
                    padding:24px;background:#f5f5f5;border-radius:8px;margin:24px 0">
          ${otp}
        </div>
        <p style="color:#666;font-size:13px">
          If you did not request a withdrawal, please contact support immediately.<br/>
          Never share this code with anyone.
        </p>
      </div>
    `,
  });
}
