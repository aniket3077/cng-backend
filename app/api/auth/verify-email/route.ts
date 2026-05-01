import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { generateOTP, sendVerificationOTP } from '@/lib/email';

const requestOTPSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

const verifyOTPSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6),
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

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
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
      const emailSent = await sendVerificationOTP(email, otp);

      if (!emailSent) {
        return NextResponse.json(
          { error: 'Failed to send verification email' },
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

      // Remove OTP from storage
      otpStorage.delete(email);

      return NextResponse.json(
        { message: 'Email verified successfully' },
        { status: 200, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
