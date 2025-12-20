import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { requireActiveSubscription } from '@/lib/subscription';

const stationSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  address: z.string().min(5).max(500).trim(),
  city: z.string().min(2).max(100).trim(),
  state: z.string().min(2).max(100).trim(),
  postalCode: z.string().max(10).optional(),
  phone: z.string().max(20).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  fuelTypes: z.array(z.string()).default(['CNG']),
  openingHours: z.string().max(50).optional(),
  amenities: z.array(z.string()).default([]),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - List owner's stations
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    
    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const stations = await prisma.station.findMany({
      where: { ownerId: payload.userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ stations }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get stations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stations' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Create new station
export async function POST(request: NextRequest) {
  try {
    // Check subscription first
    const subscriptionCheck = await requireActiveSubscription(request);
    if (subscriptionCheck) return subscriptionCheck;

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    
    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = stationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const data = validation.data;

    // Create station with pending approval status
    const station = await prisma.station.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode || null,
        phone: data.phone || null,
        lat: data.lat ?? 0,
        lng: data.lng ?? 0,
        fuelTypes: JSON.stringify(data.fuelTypes),
        openingHours: data.openingHours || '24/7',
        amenities: JSON.stringify(data.amenities),
        ownerId: payload.userId,
        approvalStatus: 'pending',
        isVerified: false,
        isPartner: false,
      },
    });

    return NextResponse.json(
      { 
        message: 'Station created successfully',
        station: {
          id: station.id,
          name: station.name,
          city: station.city,
          state: station.state,
          approvalStatus: station.approvalStatus,
        }
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Create station error:', error);
    return NextResponse.json(
      { error: 'Failed to create station' },
      { status: 500, headers: corsHeaders }
    );
  }
}
