import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

// Validation schema
const updateCrowdStatusSchema = z.object({
  stationId: z.string().min(1),
  crowdLevel: z.enum(['low', 'medium', 'high']),
  crowdCount: z.number().int().min(0).optional(),
  estimatedWaitTime: z.number().int().min(0).optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * PUT /api/owner/crowd-status
 * Update crowd information for a station.
 * Requires a valid owner JWT. Only the station's owner may update it.
 */
export async function PUT(request: NextRequest) {
  try {
    // --- Authentication ---
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.slice(7);
    const payload = await verifyJwt(token);

    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    // --- Input validation ---
    const body = await request.json();
    const validation = updateCrowdStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { stationId, crowdLevel, crowdCount, estimatedWaitTime } = validation.data;

    // --- Authorization: station must belong to this owner ---
    const station = await prisma.station.findFirst({
      where: { id: stationId, ownerId: payload.userId },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found or access denied' },
        { status: 404, headers: corsHeaders }
      );
    }

    // --- Update ---
    const updatedStation = await prisma.station.update({
      where: { id: stationId },
      data: {
        crowdLevel,
        crowdCount: crowdCount ?? station.crowdCount,
        estimatedWaitTime: estimatedWaitTime ?? station.estimatedWaitTime,
        crowdUpdatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        crowdLevel: true,
        crowdCount: true,
        estimatedWaitTime: true,
        crowdUpdatedAt: true,
      },
    });

    return NextResponse.json(
      { success: true, message: 'Crowd status updated successfully', station: updatedStation },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error updating crowd status:', error);
    return NextResponse.json(
      { error: 'Failed to update crowd status' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST delegates to PUT for convenience
export async function POST(request: NextRequest) {
  return PUT(request);
}
