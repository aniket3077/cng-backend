import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

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

// GET - Get owner profile
export async function GET(request: NextRequest) {
  try {
    const ownerId = verifyToken(request);
    if (!ownerId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const owner = await prisma.stationOwner.findUnique({
      where: { id: ownerId },
      include: {
        stations: {
          select: {
            id: true,
            name: true,
            city: true,
            approvalStatus: true,
            isVerified: true,
          },
        },
        _count: {
          select: {
            supportTickets: true,
            notifications: true,
          },
        },
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Remove passwordHash from response
    const { passwordHash, ...ownerData } = owner;

    return NextResponse.json(
      { owner: ownerData },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Update owner profile
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
      phone,
      companyName,
      gstNumber,
      panNumber,
      address,
      city,
      state,
      postalCode,
      lat,
      lng,
    } = body;

    // Update owner profile
    const owner = await prisma.stationOwner.update({
      where: { id: ownerId },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(companyName !== undefined && { companyName }),
        ...(gstNumber !== undefined && { gstNumber }),
        ...(panNumber !== undefined && { panNumber }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(postalCode !== undefined && { postalCode }),
      },
    });

    // If coordinates are provided, update or create the owner's station
    if (lat !== undefined && lng !== undefined && address && city && state) {
      const stations = await prisma.station.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });

      if (stations.length > 0) {
        // Update existing station
        await prisma.station.update({
          where: { id: stations[0].id },
          data: {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            address,
            city,
            state,
          },
        });
      } else {
        // Create new station if none exists
        const stationName = companyName || `${name}'s Station`;
        await prisma.station.create({
          data: {
            name: stationName,
            address,
            city,
            state,
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            fuelTypes: 'CNG',
            ownerId,
            approvalStatus: 'pending',
            isVerified: false,
          },
        });

        // Log station creation
        await prisma.activityLog.create({
          data: {
            ownerId,
            action: 'station_created',
            description: `Station "${stationName}" created via profile update`,
          },
        });
      }
    }

    // Check if profile is complete
    const isComplete = !!(
      owner.name &&
      owner.phone &&
      owner.companyName &&
      owner.address &&
      owner.city &&
      owner.state
    );

    if (isComplete && !owner.profileComplete) {
      await prisma.stationOwner.update({
        where: { id: ownerId },
        data: { profileComplete: true, onboardingStep: 2 },
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId,
        action: 'profile_updated',
        description: 'Profile information updated',
      },
    });

    const { passwordHash, ...ownerData } = owner;

    return NextResponse.json(
      {
        message: 'Profile updated successfully',
        owner: ownerData,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Update profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update owner profile (alias for POST)
export async function PUT(request: NextRequest) {
  return POST(request);
}
