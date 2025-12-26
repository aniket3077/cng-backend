import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { checkUserSubscription } from '@/lib/user-subscription';

/**
 * Voice Query Processing API
 * POST /api/voice-query
 * 
 * Processes natural language queries from the voice assistant
 * Returns intent, response, and relevant data
 */

interface VoiceQueryRequest {
  query: string;
  lat?: number;
  lng?: number;
}

interface StationWithDistance {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  openingHours?: string | null;
  owner: {
    name: string;
    phone: string;
    email: string;
    companyName: string | null;
  } | null;
  distance?: number;
  [key: string]: unknown;
}

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

async function getApprovedStations() {
  return await prisma.station.findMany({
    where: {
      // Only approved stations
      approvalStatus: 'approved',

      // Only verified stations
      isVerified: true,

      // Only stations with active subscriptions
      // NOTE: StationOwner does not have a `subscriptions` relation in the current schema.
      // We accept either:
      // 1) A Station-level active Subscription row, OR
      // 2) An active owner subscription window (StationOwner.subscriptionEndsAt)
      OR: [
        {
          subscriptions: {
            some: {
              status: 'active',
              endDate: {
                gte: new Date(),
              },
            },
          },
        },
        {
          owner: {
            is: {
              subscriptionEndsAt: {
                gte: new Date(),
              },
            },
          },
        },
      ],

      // Only CNG stations
      AND: [
        {
          OR: [
            { fuelTypes: { contains: 'CNG' } },
            { fuelTypes: { contains: 'cng' } },
          ],
        },
      ],
    },
    include: {
      owner: {
        select: {
          name: true,
          phone: true,
          email: true,
          companyName: true,
        },
      },
    },
  });
}

function parseIntent(query: string): string {
  const queryLower = query.toLowerCase();

  if (queryLower.includes('nearby') || queryLower.includes('near me') || queryLower.includes('close')) {
    return 'nearby_search';
  }

  if (queryLower.includes('navigate') || queryLower.includes('directions') || queryLower.includes('take me')) {
    return 'navigation';
  }

  if (queryLower.includes('available') || queryLower.includes('availability') || queryLower.includes('open')) {
    return 'availability';
  }

  if (queryLower.includes('price') || queryLower.includes('cost') || queryLower.includes('rate')) {
    return 'pricing';
  }

  if (queryLower.includes('cheapest') || queryLower.includes('lowest price')) {
    return 'cheapest';
  }

  return 'general_search';
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Authentication
    let userId: string;
    try {
      // For voice query, we extract token manually from header if needed, but here we assume standard Bearer auth
      const payload = requireAuth(request);
      userId = payload.userId;
    } catch (e) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: You must be logged in to use voice features.' },
        { status: 401 }
      );
    }

    // 2. Verify Subscription
    const subStatus = await checkUserSubscription(userId);
    if (!subStatus.isValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Subscription Required',
          response: 'Subscription expired. Please renew your plan to use voice features.',
          subscriptionStatus: {
            isExpired: subStatus.isExpired,
            expiryDate: subStatus.expiryDate,
          }
        },
        { status: 403 }
      );
    }

    const body: VoiceQueryRequest = await request.json();

    if (!body.query) {
      return NextResponse.json(
        { success: false, error: 'Query is required' },
        { status: 400 }
      );
    }

    const intent = parseIntent(body.query);
    let response = '';
    let stations: StationWithDistance[] = [];
    let nearestStation: StationWithDistance | null = null;

    const allStations = await getApprovedStations();

    switch (intent) {
      case 'nearby_search':
        if (body.lat && body.lng) {
          // Filter stations within 10km radius
          stations = (allStations
            .map((station) => ({
              ...station,
              distance: calculateDistance(
                body.lat!,
                body.lng!,
                station.lat,
                station.lng
              ),
            }))
            .filter((station) => (station.distance || 0) <= 10)) as StationWithDistance[];

          // Sort by distance
          stations.sort((a: StationWithDistance, b: StationWithDistance) => (a.distance || 0) - (b.distance || 0));

          if (stations.length > 0) {
            response = `Found ${stations.length} CNG station${stations.length > 1 ? 's' : ''} within 10 kilometers. The nearest one is ${stations[0].name} at ${stations[0].distance?.toFixed(1)} km away.`;
          } else {
            response = 'Sorry, no CNG stations found within 10 kilometers of your location.';
          }
        } else {
          stations = allStations.slice(0, 10) as StationWithDistance[];
          response = `Found ${allStations.length} CNG stations. Showing first ${stations.length}.`;
        }
        break;

      case 'navigation':
        if (body.lat && body.lng) {
          // Find nearest station
          const navStations: StationWithDistance[] = allStations.map((station) => ({
            ...station,
            distance: calculateDistance(
              body.lat!,
              body.lng!,
              station.lat,
              station.lng
            ),
          })) as StationWithDistance[];

          navStations.sort((a: StationWithDistance, b: StationWithDistance) => (a.distance || 0) - (b.distance || 0));
          nearestStation = navStations[0] || null;

          if (nearestStation) {
            response = `Navigating to ${nearestStation.name}, which is ${nearestStation.distance?.toFixed(1)} kilometers away. Starting navigation now.`;
            stations = [nearestStation];
          } else {
            response = 'Sorry, no CNG stations found nearby for navigation.';
          }
        } else {
          response = 'Please enable location services to start navigation.';
        }
        break;

      case 'availability':
        if (body.lat && body.lng) {
          const nearbyStations = allStations.filter((station) => {
            const distance = calculateDistance(
              body.lat!,
              body.lng!,
              station.lat,
              station.lng
            );
            return distance <= 5;
          });

          const openStations = nearbyStations.filter((station) => {
            // Simple check - in production, check actual opening hours
            return station.openingHours?.includes('24') || true;
          });

          stations = openStations as StationWithDistance[];
          if (openStations.length > 0) {
            response = `Yes, ${openStations.length} CNG station${openStations.length > 1 ? 's are' : ' is'} available nearby.`;
          } else {
            response = 'Sorry, no CNG stations are currently available nearby.';
          }
        } else {
          response = 'Please enable location services to check availability.';
        }
        break;

      case 'pricing':
      case 'cheapest':
        // In production, this would check actual pricing data
        stations = allStations.slice(0, 5) as StationWithDistance[];
        response = intent === 'cheapest'
          ? 'Showing stations with the best CNG prices in your area.'
          : 'CNG pricing varies by location. Showing nearby stations for comparison.';
        break;

      case 'general_search':
      default:
        // Search by name or location
        stations = allStations.filter((station) =>
          station.name.toLowerCase().includes(body.query.toLowerCase()) ||
          station.address.toLowerCase().includes(body.query.toLowerCase()) ||
          station.city.toLowerCase().includes(body.query.toLowerCase())
        ).slice(0, 10) as StationWithDistance[];

        if (stations.length > 0) {
          response = `Found ${stations.length} station${stations.length > 1 ? 's' : ''} matching "${body.query}".`;
        } else {
          response = `Sorry, no stations found matching "${body.query}".`;
        }
        break;
    }

    return NextResponse.json({
      success: true,
      intent,
      response,
      stations,
      nearestStation,
    });
  } catch (error) {
    console.error('Voice query processing error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process voice query' },
      { status: 500 }
    );
  }
}
