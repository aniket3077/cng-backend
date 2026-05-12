import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import {
  prisma,
  isPrismaInitialized,
  getPrismaInitError,
  isPrismaUnavailableError,
} from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { rateLimiters } from '@/lib/rate-limiter';
import { securityLogger } from '@/lib/security-logger';

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  return rateLimiters.auth(async (req: NextRequest) => {
    if (!isPrismaInitialized()) {
      const prismaInitError = getPrismaInitError();
      console.error('Prisma not initialized while handling customer login:', prismaInitError);
      return NextResponse.json(
        { error: 'Authentication service temporarily unavailable' },
        { status: 503, headers: corsHeaders }
      );
    }

    try {
      const body = await req.json();
      const validation = loginSchema.safeParse(body);

      if (!validation.success) {
        securityLogger.logAuthenticationAttempt(req, 'unknown', false, 'Invalid input format');
        return NextResponse.json(
          { error: 'Invalid input', details: validation.error.flatten() },
          { status: 400, headers: corsHeaders }
        );
      }

      const { email, password } = validation.data;

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          name: true,
          phone: true,
          role: true,
        },
      });

      if (!user) {
        securityLogger.logAuthenticationAttempt(req, email, false, 'User not found');
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401, headers: corsHeaders }
        );
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        securityLogger.logAuthenticationAttempt(req, email, false, 'Invalid password');
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401, headers: corsHeaders }
        );
      }

      const token = signJwt({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      securityLogger.logAuthenticationAttempt(req, email, true);

      const response = NextResponse.json(
        {
          message: 'Login successful',
          token,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
          },
        },
        { status: 200, headers: corsHeaders }
      );

      // Set HttpOnly cookie for web clients
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
        securityLogger.logAuthenticationAttempt(req, 'unknown', false, 'Database unavailable');
        return NextResponse.json(
          { error: 'Authentication service temporarily unavailable' },
          { status: 503, headers: corsHeaders }
        );
      }
      securityLogger.logAuthenticationAttempt(req, 'unknown', false, 'Internal server error');
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  })(request);
}
