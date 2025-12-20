import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// Validation schema for route planning
const routePlanSchema = z.object({
  origin: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  destination: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().optional(),
  }),
  travelMode: z.enum(['driving', 'motorcycle', 'transit', 'walking', 'bicycling']).optional().default('driving'),
  fuelType: z.enum(['CNG']).optional(),
  avoidTolls: z.boolean().optional().default(false),
  avoidHighways: z.boolean().optional().default(false),
});

/**
 * POST /api/routes/plan
 * Plan a route between origin and destination with stations along the way
 * Similar to Google Maps route planning
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = routePlanSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { origin, destination, travelMode, fuelType, avoidTolls, avoidHighways } = validation.data;

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!googleMapsApiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_MAPS_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Get route from Google Directions API
    const directions = await getGoogleDirections(
      origin,
      destination,
      travelMode,
      avoidTolls,
      avoidHighways
    );

    if (!directions) {
      return NextResponse.json(
        { error: 'Unable to find route between origin and destination' },
        { status: 404 }
      );
    }

    // Find stations along the route
    const stationsAlongRoute = await findStationsAlongRoute(
      directions.route.overview_polyline,
      fuelType,
      origin,
      destination
    );

    // Calculate route summary
    const summary = {
      distance: directions.route.legs[0].distance,
      duration: directions.route.legs[0].duration,
      startAddress: directions.route.legs[0].start_address,
      endAddress: directions.route.legs[0].end_address,
      steps: directions.route.legs[0].steps.length,
    };

    return NextResponse.json({
      success: true,
      route: {
        summary,
        polyline: directions.route.overview_polyline.points,
        bounds: directions.route.bounds,
        legs: directions.route.legs,
        warnings: directions.route.warnings || [],
      },
      stations: stationsAlongRoute,
      travelMode,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error planning route:', error);
    return NextResponse.json(
      { error: 'Failed to plan route' },
      { status: 500 }
    );
  }
}

/**
 * Get directions from Google Directions API
 */
async function getGoogleDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: string,
  avoidTolls: boolean,
  avoidHighways: boolean
) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    const originStr = `${origin.lat},${origin.lng}`;
    const destinationStr = `${destination.lat},${destination.lng}`;
    
    const params = new URLSearchParams({
      origin: originStr,
      destination: destinationStr,
      mode: mode,
      key: apiKey,
    });

    if (avoidTolls) params.append('avoid', 'tolls');
    if (avoidHighways) params.append('avoid', 'highways');

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.routes && data.routes.length > 0) {
      return {
        route: data.routes[0],
        status: data.status,
      };
    }

    return null;
  } catch (error) {
    console.error('Google Directions API error:', error);
    return null;
  }
}

/**
 * Find stations along the route polyline
 */
async function findStationsAlongRoute(
  polyline: { points: string },
  fuelType: string | undefined,
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
) {
  try {
    // Decode polyline to get route coordinates
    const routePoints = decodePolyline(polyline.points);

    // Calculate bounding box for the route with padding
    const lats = routePoints.map(p => p.latitude);
    const lngs = routePoints.map(p => p.longitude);
    const minLat = Math.min(...lats) - 0.1;
    const maxLat = Math.max(...lats) + 0.1;
    const minLng = Math.min(...lngs) - 0.1;
    const maxLng = Math.max(...lngs) + 0.1;

    // Query for stations within bounding box
    const where: any = {
      lat: { gte: minLat, lte: maxLat },
      lng: { gte: minLng, lte: maxLng },
    };

    if (fuelType) {
      where.fuelTypes = { contains: fuelType };
    }

    const stations = await prisma.station.findMany({ where });

    // Filter stations that are close to the route
    const stationsNearRoute = stations
      .map(station => {
        const distanceToRoute = calculateMinDistanceToRoute(
          { lat: station.lat, lng: station.lng },
          routePoints
        );

        // Only include stations within 5km of the route
        if (distanceToRoute > 5) return null;

        const distanceFromOrigin = calculateHaversineDistance(
          origin.lat,
          origin.lng,
          station.lat,
          station.lng
        );

        return {
          station,
          distanceToRoute: parseFloat(distanceToRoute.toFixed(2)),
          distanceFromOrigin: parseFloat(distanceFromOrigin.toFixed(2)),
        };
      })
      .filter(s => s !== null)
      .sort((a, b) => a!.distanceFromOrigin - b!.distanceFromOrigin)
      .slice(0, 15); // Top 15 stations along route

    return stationsNearRoute;
  } catch (error) {
    console.error('Error finding stations along route:', error);
    return [];
  }
}

/**
 * Decode Google polyline format
 */
function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0, len = encoded.length;
  let lat = 0, lng = 0;

  while (index < len) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }
  return points;
}

/**
 * Calculate minimum distance from a point to a route
 */
function calculateMinDistanceToRoute(
  point: { lat: number; lng: number },
  routePoints: Array<{ latitude: number; longitude: number }>
): number {
  let minDistance = Infinity;

  for (const routePoint of routePoints) {
    const distance = calculateHaversineDistance(
      point.lat,
      point.lng,
      routePoint.latitude,
      routePoint.longitude
    );
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
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
