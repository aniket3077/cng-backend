import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { JWTPayload, signJwt, signRefreshToken } from '@/lib/auth';
import { JWT_REFRESH_SECRET } from '@/lib/env';
import { prisma } from '@/lib/prisma';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken.trim() : '';

    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Refresh token is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as JWTPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
      },
    });

    if (!user || user.role !== 'customer') {
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401, headers: corsHeaders },
      );
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return NextResponse.json(
      {
        token: signJwt(tokenPayload),
        refreshToken: signRefreshToken(tokenPayload),
        user,
      },
      { headers: corsHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid refresh token' },
      { status: 401, headers: corsHeaders },
    );
  }
}
