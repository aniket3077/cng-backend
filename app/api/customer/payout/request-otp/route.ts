import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { createPayoutOtp, sendPayoutOtpEmail } from '@/lib/payout-otp';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST /api/customer/payout/request-otp
 * Request OTP for payout verification
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders },
      );
    }

    // Rate limit OTP requests
    const rateLimitResponse = await rateLimit(request, rateLimitConfigs.auth, {
      headers: corsHeaders,
      identifier: `otp:${payload.userId}`,
      errorMessage: 'Too many OTP requests. Please wait before requesting another.',
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    // Generate and store OTP
    const otp = await createPayoutOtp(user.id);

    // Send OTP via email
    await sendPayoutOtpEmail(user.id, user.email, otp);

    return NextResponse.json(
      {
        message: 'OTP sent successfully',
        email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mask email
        expiryMinutes: 10,
      },
      { headers: corsHeaders },
    );
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to send OTP' },
      { status: 500, headers: corsHeaders },
    );
  }
}
