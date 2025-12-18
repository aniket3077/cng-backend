import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function verifySubscriberToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { ownerId: string };
    return decoded.ownerId;
  } catch (error) {
    return null;
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get CNG availability for subscriber's stations
export async function GET(request: NextRequest) {
  try {
    const ownerId = verifySubscriberToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

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

// PUT - Update CNG availability for a station
export async function PUT(request: NextRequest) {
  try {
    const ownerId = verifySubscriberToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { stationId, cngAvailable } = body;

    if (!stationId || cngAvailable === undefined) {
      return NextResponse.json(
        { error: 'Station ID and CNG available are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify the station belongs to this owner
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

    // Update CNG availability
    const updated = await prisma.station.update({
      where: { id: stationId },
      data: {
        cngAvailable: parseFloat(cngAvailable),
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
