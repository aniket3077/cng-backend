import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Validation schema for place autocomplete
const autocompleteSchema = z.object({
  input: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radius: z.number().optional().default(50000), // 50km default
  types: z.string().optional(), // establishment, geocode, address, etc.
});

/**
 * POST /api/places/autocomplete
 * Get place suggestions using Google Places Autocomplete API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = autocompleteSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    const { input, lat, lng, radius, types } = validation.data;

    // Build Google Places Autocomplete API request
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyCuZ7Yw0Qe1gxJt9FUrHFCQvNBymm_XFn0';
    const params = new URLSearchParams({
      input: input,
      key: apiKey,
      components: 'country:in', // Restrict to India
    });

    // Add location bias if coordinates provided
    if (lat !== undefined && lng !== undefined) {
      params.append('location', `${lat},${lng}`);
      params.append('radius', radius.toString());
    }

    // Add types filter if specified
    if (types) {
      params.append('types', types);
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`
    );

    if (!response.ok) {
      console.error('Google API error:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Google Places API request failed', status: response.status },
        { status: 500 }
      );
    }

    const data = await response.json();
    console.log('Google Places API response:', data.status);

    if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
      const predictions = data.predictions?.map((prediction: any) => ({
        placeId: prediction.place_id,
        description: prediction.description,
        mainText: prediction.structured_formatting?.main_text || prediction.description,
        secondaryText: prediction.structured_formatting?.secondary_text || '',
        types: prediction.types,
      })) || [];

      return NextResponse.json({
        success: true,
        count: predictions.length,
        predictions,
      });
    }

    console.error('Google Places API error:', data.status, data.error_message);
    return NextResponse.json(
      { error: data.error_message || 'Failed to get place suggestions', status: data.status },
      { status: 500 }
    );
  } catch (error) {
    console.error('Error in place autocomplete:', error);
    return NextResponse.json(
      { error: 'Failed to get place suggestions' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/places/autocomplete?input=query&lat=&lng=
 * Alternative GET endpoint for autocomplete
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const input = searchParams.get('input');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');

    if (!input) {
      return NextResponse.json(
        { error: 'Input parameter is required' },
        { status: 400 }
      );
    }

    const body: any = { input };
    
    if (lat && lng) {
      body.lat = parseFloat(lat);
      body.lng = parseFloat(lng);
    }

    // Reuse POST logic
    return POST(new NextRequest(request.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  } catch (error) {
    console.error('Error in GET autocomplete:', error);
    return NextResponse.json(
      { error: 'Failed to get place suggestions' },
      { status: 500 }
    );
  }
}
