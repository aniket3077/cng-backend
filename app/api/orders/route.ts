import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';

// Validation schema for creating orders
const createOrderSchema = z.object({
  stationId: z.string().optional(),
  fuelType: z.enum(['Petrol', 'Diesel', 'CNG', 'EV']),
  quantity: z.number().min(1).max(1000),
  address1: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  scheduledAt: z.string().datetime().optional(),
});

/**
 * POST /api/orders
 * Create a new fuel order (requires authentication)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const user = requireAuth(request);

    const body = await request.json();

    // Validate input
    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const data = validation.data;

    // If stationId provided, validate it exists and check distance
    if (data.stationId) {
      const station = await prisma.station.findUnique({
        where: { id: data.stationId },
      });

      if (!station) {
        return NextResponse.json(
          { error: 'Station not found' },
          { status: 404 }
        );
      }

      // If user location provided, validate distance (max 50km)
      if (data.lat && data.lng) {
        const distance = calculateHaversineDistance(
          data.lat,
          data.lng,
          station.lat,
          station.lng
        );

        if (distance > 50) {
          return NextResponse.json(
            { error: 'Station is too far from delivery location (max 50km)' },
            { status: 400 }
          );
        }
      }
    }

    // Create order
    const order = await prisma.fuelOrder.create({
      data: {
        userId: user.userId,
        stationId: data.stationId || null,
        fuelType: data.fuelType,
        quantity: data.quantity,
        address1: data.address1,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode || null,
        lat: data.lat || null,
        lng: data.lng || null,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        status: 'pending',
      },
      include: {
        station: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        order,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating order:', error);

    if (error.message?.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/orders
 * Get user's orders (requires authentication)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = requireAuth(request);

    const orders = await prisma.fuelOrder.findMany({
      where: {
        userId: user.userId,
      },
      include: {
        station: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error: any) {
    console.error('Error fetching orders:', error);

    if (error.message?.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

/**
 * Calculate Haversine distance between two coordinates
 * @returns Distance in kilometers
 */
function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
