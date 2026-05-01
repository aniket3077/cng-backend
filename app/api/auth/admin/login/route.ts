import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
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

      const admin = await prisma.admin.findUnique({
        where: { email },
      });

      if (!admin) {
        securityLogger.logAuthenticationAttempt(req, email, false, 'Admin not found');
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401, headers: corsHeaders }
        );
      }

      const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
      if (!isPasswordValid) {
        securityLogger.logAuthenticationAttempt(req, email, false, 'Invalid password');
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401, headers: corsHeaders }
        );
      }

      const token = signJwt({
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      });

      securityLogger.logAuthenticationAttempt(req, email, true);

      return NextResponse.json(
        {
          message: 'Login successful',
          token,
          admin: {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            role: admin.role,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error('Admin login error:', error);
      securityLogger.logAuthenticationAttempt(req, 'unknown', false, 'Internal server error');
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  })(request);
}
