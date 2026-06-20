import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma, isPrismaUnavailableError } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { getCorsHeaders } from '@/lib/api-utils';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { clearFailedLogin, isLoginLocked, registerFailedLogin } from '@/lib/login-lockout';

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
});

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(request.headers.get('origin')) });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('origin'));

  const rateLimitResponse = await rateLimit(request, rateLimitConfigs.auth, { headers: corsHeaders });
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

    // SECURITY FIX (M6): use select to avoid leaking passwordHash in response
    const owner = await prisma.stationOwner.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        companyName: true,
        profileComplete: true,
        onboardingStep: true,
        passwordHash: true, // needed for bcrypt.compare below
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
    } catch {
    }

    // SECURITY FIX (M6): destructure passwordHash out so it never reaches the response
    const { passwordHash: _ph, ...safeOwner } = owner;

    const response = NextResponse.json(
      {
        message: 'Login successful',
        token,
        owner: safeOwner,
      },
      { status: 200, headers: corsHeaders }
    );

    response.cookies.set({
      name: 'token',
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60,
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
