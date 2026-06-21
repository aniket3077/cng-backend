import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { corsHeaders } from '@/lib/api-utils';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/places/geocode?address=query
 * Backend proxy endpoint to call Google Maps Geocoding API securely.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address parameter is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Places geocoding service is unavailable' },
        { status: 503, headers: corsHeaders }
      );
    }

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch geocoding data from Google' },
        { status: 500, headers: corsHeaders }
      );
    }

    const data = await response.json();
    
    // Return Google response as-is (contains results and status)
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Geocoding proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to get geocoding data' },
      { status: 500, headers: corsHeaders }
    );
  }
}
