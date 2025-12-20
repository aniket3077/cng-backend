import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for place details
const placeDetailsSchema = z.object({
  placeId: z.string().min(1),
});

/**
 * POST /api/places/details
 * Get detailed information about a place using Google Places Details API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = placeDetailsSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { placeId } = validation.data;

    // Build Google Places Details API request
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Maps API key is not configured' }, { status: 500 });
    }
    const params = new URLSearchParams({
      place_id: placeId,
      key: apiKey,
      fields: 'name,formatted_address,geometry,place_id,types,vicinity',
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`
    );

    const data = await response.json();

    if (data.status === 'OK' && data.result) {
      const place = {
        placeId: data.result.place_id,
        name: data.result.name,
        address: data.result.formatted_address,
        vicinity: data.result.vicinity,
        location: {
          lat: data.result.geometry?.location?.lat,
          lng: data.result.geometry?.location?.lng,
        },
        types: data.result.types,
      };

      return NextResponse.json({
        success: true,
        place,
      });
    }

    return NextResponse.json(
      { error: 'Failed to get place details', status: data.status },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error in place details:', error);
    return NextResponse.json(
      { error: 'Failed to get place details' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/places/details?placeId=
 * Alternative GET endpoint for place details
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const placeId = searchParams.get('placeId');

    if (!placeId) {
      return NextResponse.json(
        { error: 'placeId parameter is required' },
        { status: 400 }
      );
    }

    // Reuse POST logic
    return POST(new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    }));
  } catch (error) {
    console.error('Error in GET place details:', error);
    return NextResponse.json(
      { error: 'Failed to get place details' },
      { status: 500 }
    );
  }
}
