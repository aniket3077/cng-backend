import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma, isPrismaUnavailableError } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { clearFailedLogin, isLoginLocked, registerFailedLogin } from '@/lib/login-lockout';

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimit(request, rateLimitConfigs.auth, { headers: corsHeaders });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { email, password } = validation.data;

    // SECURITY FIX: lock out repeated owner login failures for a short window.
    if (await isLoginLocked(email)) {
      return NextResponse.json(
        { error: 'Account temporarily locked. Try again in 15 minutes.' },
        { status: 429, headers: corsHeaders }
      );
    }

    const owner = await prisma.stationOwner.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        stations: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            approvalStatus: true,
          },
        },
      },
    });

    if (!owner) {
      await registerFailedLogin(email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, owner.passwordHash);
    if (!isPasswordValid) {
      await registerFailedLogin(email);
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders }
      );
    }

    await clearFailedLogin(email);

    const token = signJwt(
      { userId: owner.id, email: owner.email, role: 'owner' }
    );

    await prisma.stationOwner.update({
      where: { id: owner.id },
      data: { lastLoginAt: new Date() },
    });

    try {
      await prisma.activityLog.create({
        data: {
          ownerId: owner.id,
          action: 'login',
          description: 'Station owner logged in',
          ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        },
      });
    } catch (activityLogError) {
      console.warn('Failed to write owner login activity log:', activityLogError);
    }

    const response = NextResponse.json(
      {
        message: 'Login successful',
        token,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          companyName: owner.companyName,
          profileComplete: owner.profileComplete,
          onboardingStep: owner.onboardingStep,
          stations: owner.stations,
        },
      },
      { status: 200, headers: corsHeaders }
    );

    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 2 * 24 * 60 * 60, // 2 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    if (isPrismaUnavailableError(error)) {
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable' },
        { status: 503, headers: corsHeaders }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
