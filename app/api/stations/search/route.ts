import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Validation schema for station search
const searchStationsSchema = z.object({
  query: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  fuelTypes: z.array(z.enum(['CNG'])).optional(),
  radiusKm: z.number().min(1).max(100).optional().default(50),
  limit: z.number().min(1).max(50).optional().default(20),
});

/**
 * POST /api/stations/search
 * Search for fuel stations like Google Maps
 * Supports text search, location-based filtering, and fuel type filtering
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = searchStationsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { query, lat, lng, fuelTypes, radiusKm, limit } = validation.data;

    // Build search filters
    const where: any = {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { address: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { state: { contains: query, mode: 'insensitive' } },
      ],
    };

    // Filter by fuel types if specified
    if (fuelTypes && fuelTypes.length > 0) {
      where.AND = fuelTypes.map(fuelType => ({
        fuelTypes: { contains: fuelType }
      }));
    }

    // Add location-based filtering if coordinates provided
    if (lat !== undefined && lng !== undefined) {
      const latDelta = radiusKm / 111;
      const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
      
      where.lat = {
        gte: lat - latDelta,
        lte: lat + latDelta,
      };
      where.lng = {
        gte: lng - lngDelta,
        lte: lng + lngDelta,
      };
    }

    // Fetch matching stations
    const stations = await prisma.station.findMany({
      where,
      take: limit * 2, // Fetch more to filter by distance
      orderBy: [
        { isPartner: 'desc' }, // Partner stations first
      ],
    });

    // Calculate distances and filter
    let results = stations.map(station => {
      const distance = lat && lng 
        ? calculateHaversineDistance(lat, lng, station.lat, station.lng)
        : null;

      return {
        id: station.id,
        name: station.name,
        address: station.address,
        city: station.city,
        state: station.state,
        lat: station.lat,
        lng: station.lng,
        fuelTypes: station.fuelTypes,
        isPartner: station.isPartner,
        rating: 0,
        distance: distance ? parseFloat(distance.toFixed(2)) : null,
      };
    });

    // Filter by radius if location provided
    if (lat !== undefined && lng !== undefined) {
      results = results
        .filter(r => r.distance !== null && r.distance <= radiusKm)
        .sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    // Limit results
    results = results.slice(0, limit);

    return NextResponse.json({
      success: true,
      count: results.length,
      query,
      stations: results,
    });
  } catch (error) {
    console.error('Error searching stations:', error);
    return NextResponse.json(
      { error: 'Failed to search stations' },
      { status: 500 }
    );
  }
}

/**
 * Calculate Haversine distance between two coordinates
 */
function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * GET /api/stations/search?q=query&lat=&lng=
 * Alternative GET endpoint for simple searches
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || searchParams.get('query');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const fuelType = searchParams.get('fuelType');

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter "q" is required' },
        { status: 400 }
      );
    }

    const body: any = { query };
    
    if (lat && lng) {
      body.lat = parseFloat(lat);
      body.lng = parseFloat(lng);
    }

    if (fuelType) {
      body.fuelTypes = [fuelType];
    }

    // Reuse POST logic
    return POST(new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  } catch (error) {
    console.error('Error in GET search:', error);
    return NextResponse.json(
      { error: 'Failed to search stations' },
      { status: 500 }
    );
  }
}
