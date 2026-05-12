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

// PUT /api/customer/vehicles/[id] — update plate
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params.id, userId: payload.userId },
    });

    if (!vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404, headers: corsHeaders });
    }

    const body = await request.json();
    const validation = plateSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check for duplicate plate among this user's other vehicles
    const duplicate = await prisma.vehicle.findFirst({
      where: {
        userId: payload.userId,
        plate: validation.data.plate,
        NOT: { id: params.id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: 'Another vehicle with this plate already exists' },
        { status: 409, headers: corsHeaders }
      );
    }

    const updated = await prisma.vehicle.update({
      where: { id: params.id },
      data: { plate: validation.data.plate },
      select: { id: true, plate: true, createdAt: true },
    });

    return NextResponse.json({ message: 'Vehicle updated', vehicle: updated }, { status: 200, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    const status = msg.includes('authorization') || msg.includes('expired') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}

// DELETE /api/customer/vehicles/[id] — remove a vehicle
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: params.id, userId: payload.userId },
    });

    if (!vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404, headers: corsHeaders });
    }

    await prisma.vehicle.delete({ where: { id: params.id } });

    return NextResponse.json({ message: 'Vehicle removed' }, { status: 200, headers: corsHeaders });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    const status = msg.includes('authorization') || msg.includes('expired') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
