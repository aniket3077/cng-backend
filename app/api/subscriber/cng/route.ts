import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY FIX: verify the owner session via the shared auth helper.
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;

    const stations = await prisma.station.findMany({
      where: { ownerId },
      select: {
        id: true,
        name: true,
        city: true,
        cngAvailable: true,
        cngUpdatedAt: true,
      },
    });

    return NextResponse.json({ stations }, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Get CNG availability error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    // SECURITY FIX: verify the owner session via the shared auth helper.
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;
    const body = await request.json();
    const { stationId, cngAvailable } = body;

    if (!stationId || cngAvailable === undefined) {
      return NextResponse.json(
        { error: 'Station ID and CNG available are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const station = await prisma.station.findFirst({
      where: {
        id: stationId,
        ownerId,
      },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found or access denied' },
        { status: 404, headers: corsHeaders }
      );
    }

    const cngAvailableBool =
      typeof cngAvailable === 'boolean'
        ? cngAvailable
        : typeof cngAvailable === 'number'
          ? cngAvailable !== 0
          : typeof cngAvailable === 'string'
            ? ['true', '1', 'yes', 'y'].includes(cngAvailable.trim().toLowerCase())
            : Boolean(cngAvailable);

    const updated = await prisma.station.update({
      where: { id: stationId },
      data: {
        cngAvailable: cngAvailableBool,
        cngUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: 'CNG availability updated successfully',
      station: {
        id: updated.id,
        name: updated.name,
        cngAvailable: updated.cngAvailable,
        cngUpdatedAt: updated.cngUpdatedAt,
      },
    }, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Update CNG availability error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}