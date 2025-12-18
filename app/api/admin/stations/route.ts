import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function verifyAdminToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    if (decoded.role !== 'admin') {
      return null;
    }
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

const stationSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  fuelTypes: z.string(), // Comma-separated
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  amenities: z.string().optional(),
  isPartner: z.boolean().optional(),
  subscriptionType: z.enum(['free', 'basic', 'premium']).optional(),
});

// Schema for update - all fields optional except id
const updateStationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  fuelTypes: z.string().optional(),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  amenities: z.string().optional(),
  isPartner: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  subscriptionType: z.enum(['free', 'basic', 'premium']).optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  rejectionReason: z.string().optional(),
});

/**
 * GET /api/admin/stations
 * List all stations (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { city: { contains: search } },
        { state: { contains: search } },
        { address: { contains: search } },
      ];
    }
    if (status === 'verified') where.isVerified = true;
    if (status === 'unverified') where.isVerified = false;

    const [stations, total] = await Promise.all([
      prisma.station.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subscriptions: {
            where: { status: 'active' },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.station.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      stations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get stations error:', error);
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * POST /api/admin/stations
 * Create new station (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
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

    // Create station
    const station = await prisma.station.create({
      data: {
        name: data.name,
        address: data.address,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        lat: data.lat,
        lng: data.lng,
        fuelTypes: data.fuelTypes,
        phone: data.phone,
        openingHours: data.openingHours,
        amenities: data.amenities,
        isPartner: data.isPartner || false,
        isVerified: true, // Auto-verify admin-added stations
        subscriptionType: data.subscriptionType || 'free',
        addedBy: adminId,
      },
    });

    // Create subscription if not free
    if (data.subscriptionType && (data.subscriptionType === 'basic' || data.subscriptionType === 'premium')) {
      const durationMonths = data.subscriptionType === 'basic' ? 1 : 12;
      const amount = data.subscriptionType === 'basic' ? 999 : 9999;
      
      await prisma.subscription.create({
        data: {
          stationId: station.id,
          planType: data.subscriptionType,
          startDate: new Date(),
          endDate: new Date(Date.now() + durationMonths * 30 * 24 * 60 * 60 * 1000),
          amount,
          status: 'active',
          features: JSON.stringify({
            priority: data.subscriptionType === 'premium',
            analytics: data.subscriptionType === 'premium',
            promotions: true,
          }),
        },
      });
    }

    return NextResponse.json({
      success: true,
      station,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Create station error:', error);
    return NextResponse.json({ error: 'Failed to create station' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * PUT /api/admin/stations
 * Update station (admin only)
 */
export async function PUT(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    
    // Validate update data
    const validation = updateStationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { id, ...updateData } = validation.data;

    const station = await prisma.station.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      station,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update station error:', error);
    return NextResponse.json({ error: 'Failed to update station' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * DELETE /api/admin/stations
 * Delete station (admin only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = request.nextUrl;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Station ID required' }, { status: 400, headers: corsHeaders });
    }

    await prisma.station.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Station deleted successfully',
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete station error:', error);
    return NextResponse.json({ error: 'Failed to delete station' }, { status: 500, headers: corsHeaders });
  }
}
