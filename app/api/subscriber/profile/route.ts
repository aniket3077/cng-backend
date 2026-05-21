import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

const prisma = new PrismaClient();

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

    const owner = await prisma.stationOwner.findUnique({
      where: { id: ownerId },
      include: {
        stations: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            address: true,
            lat: true,
            lng: true,
            approvalStatus: true,
            isVerified: true,
            cngAvailable: true,
            cngQuantityKg: true,
            cngUpdatedAt: true,
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

export async function POST(request: NextRequest) {
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

    if (lat !== undefined && lng !== undefined && address && city && state) {
      const stations = await prisma.station.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'asc' },
        take: 1,
      });

      if (stations.length > 0) {
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

        await prisma.activityLog.create({
          data: {
            ownerId,
            action: 'station_created',
            description: `Station "${stationName}" created via profile update`,
          },
        });
      }
    }

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

export async function PUT(request: NextRequest) {
  return POST(request);
}