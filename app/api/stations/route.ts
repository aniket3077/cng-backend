import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/stations
 * List all stations with optional filtering
 * Query params:
 *   - lat, lng: Filter stations near coordinates (uses bounding box)
 *   - radius: Radius in km (default: 10)
 *   - city: Filter by city
 *   - state: Filter by state
 *   - fuelType: Filter by fuel type
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = parseFloat(searchParams.get('radius') || '10');
    const city = searchParams.get('city');
    const state = searchParams.get('state');
    const fuelType = searchParams.get('fuelType');

    // Build where clause
    const where: any = {};

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (state) {
      where.state = { contains: state, mode: 'insensitive' };
    }

    if (fuelType) {
      where.fuelTypes = { contains: fuelType };
    }

    // If lat/lng provided, filter by bounding box
    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);

      // Calculate bounding box (rough approximation: 1 degree ≈ 111km)
      const latDelta = radius / 111;
      const lngDelta = radius / (111 * Math.cos((latNum * Math.PI) / 180));

      where.lat = {
        gte: latNum - latDelta,
        lte: latNum + latDelta,
      };
      where.lng = {
        gte: lngNum - lngDelta,
        lte: lngNum + lngDelta,
      };
    }

    const stations = await prisma.station.findMany({
      where,
      orderBy: [
        { isPartner: 'desc' }, // Partners first
        { rating: 'desc' }, // Then by rating
      ],
      take: 50, // Limit results
    });

    return NextResponse.json({
      success: true,
      count: stations.length,
      stations,
    });
  } catch (error) {
    console.error('Error fetching stations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stations' },
      { status: 500 }
    );
  }
}
