import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { calculateHaversineDistance } from '@/lib/api-utils';

// Validation schema
const suggestPumpsSchema = z.object({
  plate: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  fuelType: z.enum(['CNG']).optional(),
  radiusKm: z.number().min(1).max(100).optional(),
  searchQuery: z.string().optional(), // Search by station name
  sortBy: z.enum(['distance', 'rating', 'name']).optional().default('distance'),
});

interface StationSuggestion {
  station: any;
  distance: number;
  score: number;
  reason: string;
}

/**
 * POST /api/suggest-pumps
 * Suggest fuel stations based on location and vehicle plate
 * Uses Indian plate parsing + Haversine distance + scoring algorithm
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = suggestPumpsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { plate, lat, lng, fuelType, radiusKm = 20, searchQuery, sortBy = 'distance' } = validation.data;

    // Parse plate to extract region if provided
    const regionInfo = plate ? parseIndianPlate(plate) : null;

    // Calculate bounding box for initial filtering (optimization)
    const latDelta = radiusKm / 111; // 1 degree ≈ 111km
    const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    // Build query filters
    const where: any = {
      lat: {
        gte: lat - latDelta,
        lte: lat + latDelta,
      },
      lng: {
        gte: lng - lngDelta,
        lte: lng + lngDelta,
      },
    };

    // Filter by fuel type if specified
    if (fuelType) {
      where.fuelTypes = { contains: fuelType };
    }

    // Filter by search query if provided
    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { address: { contains: searchQuery, mode: 'insensitive' } },
        { city: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    // Fetch candidate stations within bounding box
    const stations = await prisma.station.findMany({
      where,
    });

    if (stations.length === 0) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        message: 'No stations found within the specified radius',
      });
    }

    // Calculate distance and score for each station
    let suggestions: StationSuggestion[] = stations.map((station) => {
      const distance = calculateHaversineDistance(lat, lng, station.lat, station.lng);

      // Skip stations outside the radius
      if (distance > radiusKm) {
        return null;
      }

      // Calculate score based on multiple factors
      const score = calculateStationScore(station, distance, regionInfo?.state);

      // Generate reason text
      const reason = generateReason(station, distance, regionInfo?.state);

      return {
        station,
        distance: parseFloat(distance.toFixed(2)),
        score: parseFloat(score.toFixed(2)),
        reason,
      };
    })
      .filter((s): s is StationSuggestion => s !== null);

    // Sort based on user preference
    if (sortBy === 'distance') {
      suggestions.sort((a, b) => a.distance - b.distance);
    } else if (sortBy === 'rating') {
      suggestions.sort((a, b) => (b.station.rating || 0) - (a.station.rating || 0));
    } else if (sortBy === 'name') {
      suggestions.sort((a, b) => a.station.name.localeCompare(b.station.name));
    } else {
      suggestions.sort((a, b) => b.score - a.score); // Default: by score
    }

    // Limit to top results
    suggestions = suggestions.slice(0, 30);

    return NextResponse.json({
      success: true,
      count: suggestions.length,
      regionDetected: regionInfo?.state || null,
      searchQuery: searchQuery || null,
      sortBy,
      radiusKm,
      center: { lat, lng },
      suggestions,
    });
  } catch (error) {
    console.error('Error suggesting pumps:', error);
    return NextResponse.json(
      { error: 'Failed to suggest pumps' },
      { status: 500 }
    );
  }
}

/**
 * Parse Indian vehicle number plate
 * Supports formats:
 *   - Standard: MH12AB1234 (State-RTO-Series-Number)
 *   - Commercial: MH12T1234
 *   - New BH series: BH01AB1234
 * @returns Region code and state
 */
function parseIndianPlate(plate: string): { regionCode: string; state: string } | null {
  const cleaned = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Indian state codes mapping
  const stateMap: Record<string, string> = {
    AP: 'Andhra Pradesh',
    AR: 'Arunachal Pradesh',
    AS: 'Assam',
    BR: 'Bihar',
    CG: 'Chhattisgarh',
    GA: 'Goa',
    GJ: 'Gujarat',
    HR: 'Haryana',
    HP: 'Himachal Pradesh',
    JH: 'Jharkhand',
    KA: 'Karnataka',
    KL: 'Kerala',
    MP: 'Madhya Pradesh',
    MH: 'Maharashtra',
    MN: 'Manipur',
    ML: 'Meghalaya',
    MZ: 'Mizoram',
    NL: 'Nagaland',
    OD: 'Odisha',
    OR: 'Odisha',
    PB: 'Punjab',
    RJ: 'Rajasthan',
    SK: 'Sikkim',
    TN: 'Tamil Nadu',
    TS: 'Telangana',
    TR: 'Tripura',
    UP: 'Uttar Pradesh',
    UK: 'Uttarakhand',
    WB: 'West Bengal',
    DL: 'Delhi',
    AN: 'Andaman and Nicobar',
    CH: 'Chandigarh',
    DN: 'Dadra and Nagar Haveli',
    DD: 'Daman and Diu',
    LD: 'Lakshadweep',
    PY: 'Puducherry',
    BH: 'India', // New BH series (all India)
  };

  // Try to extract state code (first 2 letters)
  const stateCode = cleaned.substring(0, 2);
  const state = stateMap[stateCode];

  if (state) {
    return { regionCode: stateCode, state };
  }

  return null;
}

/**
 * Calculate score for a station based on multiple factors
 * Scoring algorithm:
 *   - Base score: 100 - (distance * 2) [closer = higher]
 *   - Partner bonus: +20
 *   - Rating boost: rating * 5
 *   - Same state bonus: +10
 * @returns Score (higher is better)
 */
function calculateStationScore(
  station: any,
  distance: number,
  userState: string | undefined
): number {
  // Base score inversely proportional to distance
  let score = 100 - distance * 2;

  // Partner stations get priority
  if (station.isPartner) {
    score += 20;
  }

  // Rating contributes to score
  score += station.rating * 5;

  // Same state bonus (helps users stay in their state)
  if (userState && station.state === userState) {
    score += 10;
  }

  return Math.max(0, score); // Ensure non-negative
}

/**
 * Generate human-readable reason for suggestion
 */
function generateReason(
  station: any,
  distance: number,
  userState: string | undefined
): string {
  const reasons: string[] = [];

  if (distance < 2) {
    reasons.push('Very close');
  } else if (distance < 5) {
    reasons.push('Nearby');
  }

  if (station.isPartner) {
    reasons.push('Partner station');
  }

  if (station.rating >= 4.5) {
    reasons.push('Highly rated');
  }

  if (userState && station.state === userState) {
    reasons.push('In your state');
  }

  if (reasons.length === 0) {
    return `${distance.toFixed(1)}km away`;
  }

  return reasons.join(' • ');
}

// PRODUCTION OPTIMIZATION NOTE:
// For scale (10k+ stations), migrate to PostGIS for efficient geospatial queries:
//
// 1. Add PostGIS extension to Postgres:
//    CREATE EXTENSION postgis;
//
// 2. Add geometry column to Station table:
//    ALTER TABLE "Station" ADD COLUMN location GEOGRAPHY(POINT, 4326);
//    UPDATE "Station" SET location = ST_SetSRID(ST_MakePoint(lng, lat), 4326);
//    CREATE INDEX idx_station_location ON "Station" USING GIST(location);
//
// 3. Use PostGIS distance query:
//    SELECT *, ST_Distance(location, ST_MakePoint($lng, $lat)::geography) / 1000 as distance_km
//    FROM "Station"
//    WHERE ST_DWithin(location, ST_MakePoint($lng, $lat)::geography, $radiusKm * 1000)
//    ORDER BY distance_km
//    LIMIT 20;
//
// This provides 100x+ performance improvement for large datasets.
