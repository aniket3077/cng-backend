import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

const crowdSchema = z.object({
  crowdLevel: z.enum(['low', 'medium', 'high']),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    }

    const body = await request.json();
    const validation = crowdSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'crowdLevel must be low, medium, or high', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const station = await prisma.station.findUnique({
      where: { id },
      select: { id: true, crowdCount: true },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404, headers: corsHeaders });
    }

    const { crowdLevel } = validation.data;

    // Estimate wait time based on level
    const waitTimeMap: Record<string, number> = {
      low: 5,
      medium: 15,
      high: 30,
    };

    const updated = await prisma.station.update({
      where: { id },
      data: {
        crowdLevel,
        crowdCount: { increment: 1 },
        estimatedWaitTime: waitTimeMap[crowdLevel],
        crowdUpdatedAt: new Date(),
      },
      select: {
        id: true,
        crowdLevel: true,
        crowdCount: true,
        estimatedWaitTime: true,
        crowdUpdatedAt: true,
      },
    });

    return NextResponse.json(
      {
        message: 'Crowd level updated. Thank you for your contribution!',
        station: updated,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    const status = msg.includes('authorization') || msg.includes('expired') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal server error' },
      { status, headers: corsHeaders }
    );
  }
}
