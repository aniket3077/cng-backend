import { NextRequest, NextResponse } from 'next/server';

/**
 * Navigation Route API
 * POST /api/navigation/route
 * 
 * Provides turn-by-turn directions between two points
 * Can integrate with Google Directions API or use simple calculations
 */

interface RouteRequest {
  origin: {
    lat: number;
    lng: number;
  };
  destination: {
    lat: number;
    lng: number;
  };
  mode?: 'driving' | 'walking';
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
  return R * c; // Distance in km
}

function generateSimpleRoute(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const distance = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  const duration = Math.ceil(distance * 2); // Rough estimate: 2 minutes per km in city
  
  // Generate waypoints for a simple route
  const steps = 10;
  const waypoints = [];
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    waypoints.push({
      latitude: origin.lat + (destination.lat - origin.lat) * fraction,
      longitude: origin.lng + (destination.lng - origin.lng) * fraction,
    });
  }

  // Generate simple instructions
  const instructions = [
    {
      instruction: `Head towards destination`,
      distance: `${(distance * 0.3).toFixed(1)} km`,
      duration: `${Math.ceil(duration * 0.3)} min`,
    },
    {
      instruction: `Continue straight`,
      distance: `${(distance * 0.4).toFixed(1)} km`,
      duration: `${Math.ceil(duration * 0.4)} min`,
    },
    {
      instruction: `Arrive at destination`,
      distance: `${(distance * 0.3).toFixed(1)} km`,
      duration: `${Math.ceil(duration * 0.3)} min`,
    },
  ];

  return {
    distance: `${distance.toFixed(1)} km`,
    duration: `${duration} min`,
    waypoints,
    steps: instructions,
  };
}

async function getGoogleDirections(origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey) {
    // Fallback to simple route if no API key
    return generateSimpleRoute(origin, destination);
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json`;
    const params = new URLSearchParams({
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      key: apiKey,
      mode: 'driving',
    });

    const response = await fetch(`${url}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      return generateSimpleRoute(origin, destination);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    // Decode polyline to waypoints (simplified version)
    // In production, use a proper polyline decoder library
    const waypoints = [origin, destination]; // Simplified

    return {
      distance: leg.distance.text,
      duration: leg.duration.text,
      waypoints,
      steps: leg.steps.map((step: any) => ({
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
        distance: step.distance.text,
        duration: step.duration.text,
      })),
    };
  } catch (error) {
    console.error('Google Directions API error:', error);
    return generateSimpleRoute(origin, destination);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: RouteRequest = await request.json();

    if (!body.origin || !body.destination) {
      return NextResponse.json(
        { success: false, error: 'Origin and destination are required' },
        { status: 400 }
      );
    }

    if (
      typeof body.origin.lat !== 'number' ||
      typeof body.origin.lng !== 'number' ||
      typeof body.destination.lat !== 'number' ||
      typeof body.destination.lng !== 'number'
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    const route = await getGoogleDirections(body.origin, body.destination);

    return NextResponse.json({
      success: true,
      route,
    });
  } catch (error) {
    console.error('Route calculation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate route' },
      { status: 500 }
    );
  }
}
