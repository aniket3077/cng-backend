import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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
    const radius = Math.min(100, Math.max(1, parseFloat(searchParams.get('radius') || '10'))); // Max 100km radius
    const city = searchParams.get('city');
    const state = searchParams.get('state');
    const fuelType = searchParams.get('fuelType');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50'))); // Max 100 items

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      approvalStatus: 'approved', // Only show approved stations
      isVerified: true, // Only show verified stations
    };

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
        { createdAt: 'desc' }, // Then by creation date
      ],
      skip,
      take: limit,
      include: {
        owner: {
          select: {
            name: true,
            companyName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    // Calculate distance if lat/lng provided
    let stationsWithDistance = stations;
    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);

      stationsWithDistance = stations.map((station) => {
        const distance = calculateDistance(
          latNum,
          lngNum,
          station.lat,
          station.lng
        );
        return { ...station, distance };
      }).sort((a, b) => a.distance - b.distance); // Sort by distance
    }

    // Get total count for pagination
    const total = await prisma.station.count({ where });

    return NextResponse.json({
      success: true,
      count: stationsWithDistance.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      stations: stationsWithDistance,
    }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch stations' },
      { status: 500, headers: corsHeaders }
    );
  }
}
