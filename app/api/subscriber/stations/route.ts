import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
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

export async function POST(request: NextRequest) {
  try {
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

    if (!name || !address || !city || !state || !lat || !lng || !fuelTypes) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      );
    }

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

    await prisma.activityLog.create({
      data: {
        ownerId,
        stationId: station.id,
        action: 'station_created',
        description: `Station "${name}" registered for approval`,
      },
    });

    await prisma.notification.create({
      data: {
        ownerId,
        title: 'Station submitted',
        message: `Your station "${name}" has been submitted for approval.`,
        type: 'info',
        isRead: false,
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

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireAuth(request);
    if (payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const ownerId = payload.userId;
    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('id');

    if (!stationId) {
      return NextResponse.json(
        { error: 'Station ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const existingStation = await prisma.station.findFirst({
      where: { id: stationId, ownerId },
    });

    if (!existingStation) {
      return NextResponse.json(
        { error: 'Station not found or access denied' },
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

    // SECURITY FIX: owners cannot self-approve their stations
    const station = await prisma.station.update({
      where: { id: stationId },
      data: {
        ...(name && { name }),
        ...(address && { address }),
        ...(city && { city }),
        ...(state && { state }),
        ...(postalCode !== undefined && { postalCode }),
        ...(lat !== undefined && { lat: parseFloat(lat) }),
        ...(lng !== undefined && { lng: parseFloat(lng) }),
        ...(fuelTypes && { fuelTypes }),
        ...(phone !== undefined && { phone }),
        ...(openingHours !== undefined && { openingHours }),
        ...(amenities !== undefined && { amenities }),
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