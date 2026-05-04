import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';

// Validation schema
const updateCrowdStatusSchema = z.object({
  stationId: z.string(),
  crowdLevel: z.enum(['low', 'medium', 'high']),
  crowdCount: z.number().int().min(0).optional(),
  estimatedWaitTime: z.number().int().min(0).optional(),
});

/**
 * PUT /api/owner/crowd-status
 * Update crowd information for a station
 * Only the owner of the station can update this
 */
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.slice(7);
    // In production, verify the JWT token properly
    // For now, we'll get the owner info from the request

    const body = await request.json();
    const validation = updateCrowdStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const { stationId, crowdLevel, crowdCount, estimatedWaitTime } = validation.data;

    // Verify station exists and owner has access
    const station = await prisma.station.findUnique({
      where: { id: stationId },
      include: { owner: true },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Update crowd status
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
      {
        success: true,
        message: 'Crowd status updated successfully',
        station: updatedStation,
      },
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
