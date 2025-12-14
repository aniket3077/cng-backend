import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Verify JWT token and extract owner ID
function verifyToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { ownerId: string; type: string };
    if (decoded.type !== 'owner') {
      return null;
    }
    return decoded.ownerId;
  } catch (error) {
    return null;
  }
}

// GET - List owner's stations
export async function GET(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const stations = await prisma.station.findMany({
      where: { ownerId },
      include: {
        subscriptions: {
          where: { status: 'active' },
          orderBy: { endDate: 'desc' },
          take: 1,
        },
        documents: {
          select: {
            id: true,
            documentType: true,
            status: true,
            uploadedAt: true,
          },
        },
        _count: {
          select: {
            orders: true,
            supportTickets: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      { stations },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get stations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Register new station
export async function POST(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const {
      name,
      address,
      city,
      state,
      postalCode,
      lat,
      lng,
      fuelTypes,
      phone,
      openingHours,
      amenities,
    } = body;

    // Validation
    if (!name || !address || !city || !state || !lat || !lng || !fuelTypes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create station
    const station = await prisma.station.create({
      data: {
        name,
        address,
        city,
        state,
        postalCode: postalCode || null,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        fuelTypes,
        phone: phone || null,
        openingHours: openingHours || null,
        amenities: amenities || null,
        ownerId,
        approvalStatus: 'pending',
        isVerified: false,
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId,
        stationId: station.id,
        action: 'station_created',
        description: `Station "${name}" registered for approval`,
      },
    });

    // Create notification
    await prisma.notification.create({
      data: {
        ownerId,
        title: 'Station Submitted for Review',
        message: `Your station "${name}" has been submitted and is pending admin approval.`,
        type: 'info',
        category: 'station_approval',
      },
    });

    return NextResponse.json(
      {
        message: 'Station registered successfully and pending approval',
        station,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Create station error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update station
export async function PUT(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('id');

    if (!stationId) {
      return NextResponse.json(
        { error: 'Station ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify ownership
    const existingStation = await prisma.station.findFirst({
      where: { id: stationId, ownerId },
    });

    if (!existingStation) {
      return NextResponse.json(
        { error: 'Station not found or unauthorized' },
        { status: 404, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const {
      name,
      address,
      city,
      state,
      postalCode,
      lat,
      lng,
      fuelTypes,
      phone,
      openingHours,
      amenities,
    } = body;

    // Update station
    const station = await prisma.station.update({
      where: { id: stationId },
      data: {
        ...(name && { name }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(postalCode !== undefined && { postalCode }),
        ...(lat && { lat: parseFloat(lat) }),
        ...(lng && { lng: parseFloat(lng) }),
        ...(fuelTypes && { fuelTypes }),
        ...(phone !== undefined && { phone }),
        ...(openingHours !== undefined && { openingHours }),
        ...(amenities !== undefined && { amenities }),
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId,
        stationId: station.id,
        action: 'station_updated',
        description: `Station "${station.name}" details updated`,
      },
    });

    return NextResponse.json(
      {
        message: 'Station updated successfully',
        station,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Update station error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
