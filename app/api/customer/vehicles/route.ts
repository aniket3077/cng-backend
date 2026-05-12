import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

const plateSchema = z.object({
  plate: z
    .string()
    .min(4)
    .max(15)
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9 -]+$/, 'Invalid plate format'),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET /api/customer/vehicles — list user vehicles
export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { userId: payload.userId },
      select: { id: true, plate: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ vehicles }, { status: 200, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    const status = msg.includes('authorization') || msg.includes('expired') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}

// POST /api/customer/vehicles — add a new vehicle
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await request.json();
    const validation = plateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const { plate } = validation.data;

    // Prevent duplicate plates for the same user
    const existing = await prisma.vehicle.findFirst({
      where: { userId: payload.userId, plate },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Vehicle with this plate already exists' },
        { status: 409, headers: corsHeaders }
      );
    }

    // Max 5 vehicles per user
    const count = await prisma.vehicle.count({ where: { userId: payload.userId } });
    if (count >= 5) {
      return NextResponse.json(
        { error: 'Maximum 5 vehicles allowed per account' },
        { status: 400, headers: corsHeaders }
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: { userId: payload.userId, plate },
      select: { id: true, plate: true, createdAt: true },
    });

    return NextResponse.json({ message: 'Vehicle added', vehicle }, { status: 201, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    const status = msg.includes('authorization') || msg.includes('expired') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
