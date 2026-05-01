import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { generateOTP, sendPasswordResetOTP } from '@/lib/email';

const requestOTPSchema = z.object({
  action: z.string(),
  email: z.string().email().trim().toLowerCase(),
});

const verifyOTPSchema = z.object({
  action: z.string(),
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6),
});

const resetPasswordSchema = z.object({
  action: z.string(),
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6),
  newPassword: z.string().min(6).max(100),
});

// In-memory OTP storage (in production, use Redis)
const otpStorage = new Map<string, { otp: string; expiresAt: number }>();

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'send') {
      const validation = requestOTPSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.errors },
          { status: 400, headers: corsHeaders }
        );
      }

      const { email } = validation.data;

      // Check if user exists (for now, we'll check StationOwner table since that's what we have)
      const owner = await prisma.stationOwner.findUnique({
        where: { email },
      });

      if (!owner) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404, headers: corsHeaders }
        );
      }

      // Generate OTP
      const otp = generateOTP();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Store OTP
      otpStorage.set(email, { otp, expiresAt });

      // Send OTP email
      const emailSent = await sendPasswordResetOTP(email, otp);

      if (!emailSent) {
        return NextResponse.json(
          { error: 'Failed to send reset email' },
          { status: 500, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { message: 'OTP sent successfully' },
        { status: 200, headers: corsHeaders }
      );
    }

    if (action === 'verify') {
      const validation = verifyOTPSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.errors },
          { status: 400, headers: corsHeaders }
        );
      }

      const { email, otp } = validation.data;

      // Check OTP
      const storedOTP = otpStorage.get(email);
      if (!storedOTP) {
        return NextResponse.json(
          { error: 'Invalid or expired OTP' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (storedOTP.otp !== otp) {
        return NextResponse.json(
          { error: 'Invalid OTP' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (Date.now() > storedOTP.expiresAt) {
        otpStorage.delete(email);
        return NextResponse.json(
          { error: 'OTP expired' },
          { status: 401, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        { message: 'OTP verified successfully' },
        { status: 200, headers: corsHeaders }
      );
    }

    if (action === 'reset') {
      const validation = resetPasswordSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.errors },
          { status: 400, headers: corsHeaders }
        );
      }

      const { email, otp, newPassword } = validation.data;

      // Check OTP
      const storedOTP = otpStorage.get(email);
      if (!storedOTP) {
        return NextResponse.json(
          { error: 'Invalid or expired OTP' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (storedOTP.otp !== otp) {
        return NextResponse.json(
          { error: 'Invalid OTP' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (Date.now() > storedOTP.expiresAt) {
        otpStorage.delete(email);
        return NextResponse.json(
          { error: 'OTP expired' },
          { status: 401, headers: corsHeaders }
        );
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update password in StationOwner table
      await prisma.stationOwner.update({
        where: { email },
        data: { passwordHash },
      });

      // Remove OTP from storage
      otpStorage.delete(email);

      return NextResponse.json(
        { message: 'Password reset successfully' },
        { status: 200, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Password reset error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
