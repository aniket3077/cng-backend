import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { vehicles: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          vehicles: user.vehicles,
          subscriptionType: user.subscriptionType,
          subscriptionEndsAt: user.subscriptionEndsAt,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Profile fetch error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';

    const status = message.includes('authorization token') || message.includes('Invalid or expired token')
      ? 401
      : 500;

    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}

const updateSchema = z.object({
  name: z.string().min(2).max(100).trim().optional(),
  phone: z.union([z.string().min(10).max(15), z.null()]).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const payload = requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = updateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const updated = await prisma.user.update({
      where: { id: payload.userId },
      data: {
        ...(validation.data.name !== undefined ? { name: validation.data.name } : {}),
        ...(validation.data.phone !== undefined ? { phone: validation.data.phone } : {}),
      },
      include: { vehicles: true },
    });

    return NextResponse.json(
      {
        message: 'Profile updated',
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name,
          phone: updated.phone,
          role: updated.role,
          vehicles: updated.vehicles,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';

    const status = message.includes('authorization token') || message.includes('Invalid or expired token')
      ? 401
      : 500;

    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
