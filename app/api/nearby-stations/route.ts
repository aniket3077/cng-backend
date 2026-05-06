import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { calculateHaversineDistance, corsHeaders } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';

const DEFAULT_RADIUS_METERS = 25_000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const MAX_DIRECTION_CANDIDATES = 12;

const nearbyStationsSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius: z.coerce.number().int().min(100).max(50_000).optional(),
    radiusMeters: z.coerce.number().int().min(100).max(50_000).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    includeTravelTimes: z.coerce.boolean().optional(),
    googleOnly: z.coerce.boolean().optional(),
  })
  .transform(({ radius, radiusMeters, limit, includeTravelTimes, googleOnly, ...rest }) => ({
    ...rest,
    radiusMeters: radiusMeters ?? radius ?? DEFAULT_RADIUS_METERS,
    limit: limit ?? DEFAULT_LIMIT,
    includeTravelTimes: includeTravelTimes ?? false,
    googleOnly: googleOnly ?? false,
  }));

type NearbyStationsInput = z.infer<typeof nearbyStationsSchema>;

interface GooglePlacesNearbyResponse {
  status: string;
  error_message?: string;
  next_page_token?: string;
  results?: GooglePlaceResult[];
}

interface GooglePlaceResult {
  place_id?: string;
  name?: string;
  rating?: number;
  vicinity?: string;
  business_status?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  opening_hours?: {
    open_now?: boolean;
  };
}

interface GoogleDirectionsResponse {
  status: string;
  error_message?: string;
  routes?: Array<{
    legs?: Array<{
      distance?: {
        text: string;
        value: number;
      };
      duration?: {
        text: string;
        value: number;
      };
      duration_in_traffic?: {
        text: string;
        value: number;
      };
    }>;
  }>;
}

interface StationCandidate {
  placeId: string;
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  rating: number | null;
  openNow: boolean | null;
  distanceKm: number;
}

interface TravelMetrics {
  routeDistanceText: string;
  routeDistanceMeters: number;
  travelTimeText: string;
  travelTimeSeconds: number;
  trafficAware: boolean;
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = nearbyStationsSchema.safeParse(body);

    if (!validation.success) {
      return validationErrorResponse(validation.error.errors);
    }

    return await handleNearbyStationsRequest(validation.data);
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch nearby stations');
  }
}

export async function GET(request: NextRequest) {
  try {
    const validation = nearbyStationsSchema.safeParse({
      lat: request.nextUrl.searchParams.get('lat'),
      lng: request.nextUrl.searchParams.get('lng'),
      radius: request.nextUrl.searchParams.get('radius'),
      radiusMeters: request.nextUrl.searchParams.get('radiusMeters'),
      limit: request.nextUrl.searchParams.get('limit'),
    });

    if (!validation.success) {
      return validationErrorResponse(validation.error.errors);
    }

    return await handleNearbyStationsRequest(validation.data);
  } catch (error) {
    return handleRouteError(error, 'Failed to process nearby stations request');
  }
}

async function handleNearbyStationsRequest(input: NearbyStationsInput) {
  const apiKey = getGoogleMapsApiKey();
  let candidates: StationCandidate[] = [];
  try {
    candidates = await fetchNearbyStationCandidates(input, apiKey);
  } catch (err) {
    // If Google is unavailable and caller explicitly requested Google-only results,
    // return an empty successful response instead of an error so the client can
    // show an empty map or message.
    if (input.googleOnly && err instanceof HttpError && err.status === 502) {
      return NextResponse.json(
        {
          success: true,
          count: 0,
          userLocation: { lat: input.lat, lng: input.lng },
          searchRadiusMeters: input.radiusMeters,
          stations: [],
          googlePlacesUnavailable: true,
        },
        { headers: corsHeaders }
      );
    }

    throw err;
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        success: true,
        count: 0,
        userLocation: { lat: input.lat, lng: input.lng },
        searchRadiusMeters: input.radiusMeters,
        stations: [],
      },
      { headers: corsHeaders }
    );
  }

  if (!input.includeTravelTimes) {
    const stations = candidates
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, input.limit)
      .map((station, index) => ({
        rank: index + 1,
        placeId: station.placeId,
        name: station.name,
        coordinates: station.coordinates,
        rating: station.rating,
        openNow: station.openNow,
        openStatus: getOpenStatus(station.openNow),
        distanceKm: roundToTwoDecimals(station.distanceKm),
        routeDistanceKm: roundToTwoDecimals(station.distanceKm),
        routeDistanceText: `${roundToTwoDecimals(station.distanceKm)} km`,
        travelTime: {
          text: null,
          seconds: null,
          trafficAware: false,
        },
        address: station.address,
      }));

    return NextResponse.json(
      {
        success: true,
        count: stations.length,
        userLocation: { lat: input.lat, lng: input.lng },
        searchRadiusMeters: input.radiusMeters,
        ranking: ['distanceKm'],
        stations,
      },
      { headers: corsHeaders }
    );
  }

  const rankedStations = await rankStationsByTravelTime(input, candidates, apiKey);

  return NextResponse.json(
    {
      success: true,
      count: rankedStations.length,
      userLocation: { lat: input.lat, lng: input.lng },
      searchRadiusMeters: input.radiusMeters,
      ranking: ['travelTimeSeconds', 'distanceKm'],
      stations: rankedStations.map((station, index) => ({
        rank: index + 1,
        placeId: station.placeId,
        name: station.name,
        coordinates: station.coordinates,
        rating: station.rating,
        openNow: station.openNow,
        openStatus: getOpenStatus(station.openNow),
        distanceKm: roundToTwoDecimals(station.distanceKm),
        routeDistanceKm: roundToTwoDecimals(station.routeDistanceMeters / 1000),
        routeDistanceText: station.routeDistanceText,
        travelTime: {
          text: station.travelTimeText,
          seconds: station.travelTimeSeconds,
          trafficAware: station.trafficAware,
        },
        address: station.address,
      })),
    },
    { headers: corsHeaders }
  );
}

function getGoogleMapsApiKey(): string {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new HttpError(500, 'Google Maps API key is not configured');
  }

  return apiKey;
}

async function fetchNearbyStationCandidates(
  input: NearbyStationsInput,
  apiKey: string
): Promise<StationCandidate[]> {
  const uniqueStations = new Map<string, StationCandidate>();
  let nextPageToken: string | undefined;
  let pageCount = 0;
  const maxPages = Math.min(3, Math.ceil(input.limit / 20));
  const maxDistanceKm = input.radiusMeters / 1000;

  while (pageCount < maxPages && uniqueStations.size < input.limit) {
    const nearbySearchUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');

    if (nextPageToken) {
      nearbySearchUrl.searchParams.set('pagetoken', nextPageToken);
      await sleep(1800);
    } else {
      nearbySearchUrl.searchParams.set('location', `${input.lat},${input.lng}`);
      nearbySearchUrl.searchParams.set('rankby', 'distance');
      nearbySearchUrl.searchParams.set('type', 'gas_station');
      nearbySearchUrl.searchParams.set('keyword', 'CNG');
      nearbySearchUrl.searchParams.set('language', 'en');
    }

    nearbySearchUrl.searchParams.set('key', apiKey);

    const response = await fetch(nearbySearchUrl.toString(), {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new HttpError(502, `Google Places API request failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as GooglePlacesNearbyResponse;

    if (data.status === 'ZERO_RESULTS') {
      break;
    }

    if (data.status === 'INVALID_REQUEST' && nextPageToken) {
      await sleep(1200);
      continue;
    }

    if (data.status !== 'OK') {
      throw new HttpError(
        502,
        data.error_message
          ? `Google Places API error: ${data.status} - ${data.error_message}`
          : `Google Places API error: ${data.status}`
      );
    }

    for (const place of data.results ?? []) {
      const normalizedStation = normalizeStationCandidate(place, input.lat, input.lng);

      if (!normalizedStation) {
        continue;
      }

      if (normalizedStation.distanceKm > maxDistanceKm) {
        continue;
      }

      if (!uniqueStations.has(normalizedStation.placeId)) {
        uniqueStations.set(normalizedStation.placeId, normalizedStation);
      }
    }

    nextPageToken = data.next_page_token;
    pageCount += 1;

    if (!nextPageToken) {
      break;
    }
  }

  return Array.from(uniqueStations.values())
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, input.includeTravelTimes ? MAX_DIRECTION_CANDIDATES : input.limit);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStationCandidate(
  place: GooglePlaceResult,
  userLat: number,
  userLng: number
): StationCandidate | null {
  const lat = place.geometry?.location?.lat;
  const lng = place.geometry?.location?.lng;

  if (
    !place.place_id ||
    !place.name ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(lng) ||
    place.business_status === 'CLOSED_PERMANENTLY'
  ) {
    return null;
  }

  return {
    placeId: place.place_id,
    name: place.name,
    address: place.vicinity || '',
    coordinates: { lat, lng },
    rating: typeof place.rating === 'number' ? place.rating : null,
    openNow: typeof place.opening_hours?.open_now === 'boolean' ? place.opening_hours.open_now : null,
    distanceKm: calculateHaversineDistance(userLat, userLng, lat, lng),
  };
}

async function rankStationsByTravelTime(
  input: NearbyStationsInput,
  candidates: StationCandidate[],
  apiKey: string
) {
  const travelResults = await Promise.allSettled(
    candidates.map((candidate) =>
      fetchTrafficAwareTravelMetrics(
        { lat: input.lat, lng: input.lng },
        candidate.placeId,
        apiKey
      )
    )
  );

  const rankedStations = candidates.flatMap((candidate, index) => {
    const result = travelResults[index];

    if (result.status !== 'fulfilled') {
      console.warn(`Skipping station ${candidate.placeId}:`, result.reason);
      return [];
    }

    return [{ ...candidate, ...result.value }];
  });

  if (rankedStations.length === 0) {
    throw new HttpError(502, 'Unable to fetch travel times for nearby CNG stations');
  }

  return rankedStations
    .sort((a, b) => {
      if (a.travelTimeSeconds !== b.travelTimeSeconds) {
        return a.travelTimeSeconds - b.travelTimeSeconds;
      }

      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }

      return a.routeDistanceMeters - b.routeDistanceMeters;
    })
    .slice(0, input.limit);
}

async function fetchTrafficAwareTravelMetrics(
  origin: { lat: number; lng: number },
  placeId: string,
  apiKey: string
): Promise<TravelMetrics> {
  const directionsUrl = new URL('https://maps.googleapis.com/maps/api/directions/json');
  directionsUrl.searchParams.set('origin', `${origin.lat},${origin.lng}`);
  directionsUrl.searchParams.set('destination', `place_id:${placeId}`);
  directionsUrl.searchParams.set('mode', 'driving');
  directionsUrl.searchParams.set('departure_time', 'now');
  directionsUrl.searchParams.set('traffic_model', 'best_guess');
  directionsUrl.searchParams.set('key', apiKey);

  const response = await fetch(directionsUrl.toString(), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new HttpError(502, `Google Directions API request failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as GoogleDirectionsResponse;
  const leg = data.routes?.[0]?.legs?.[0];

  if (data.status !== 'OK' || !leg?.distance || !leg.duration) {
    throw new HttpError(
      502,
      data.error_message
        ? `Google Directions API error: ${data.status} - ${data.error_message}`
        : `Google Directions API error: ${data.status}`
    );
  }

  const travelDuration = leg.duration_in_traffic ?? leg.duration;

  return {
    routeDistanceText: leg.distance.text,
    routeDistanceMeters: leg.distance.value,
    travelTimeText: travelDuration.text,
    travelTimeSeconds: travelDuration.value,
    trafficAware: Boolean(leg.duration_in_traffic),
  };
}

function validationErrorResponse(details: unknown) {
  return NextResponse.json(
    {
      error: 'Validation failed',
      details,
    },
    { status: 400, headers: corsHeaders }
  );
}

function handleRouteError(error: unknown, fallbackMessage: string) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: corsHeaders }
    );
  }

  console.error(fallbackMessage, error);

  return NextResponse.json(
    { error: fallbackMessage },
    { status: 500, headers: corsHeaders }
  );
}

function getOpenStatus(openNow: boolean | null): 'OPEN' | 'CLOSED' | 'UNKNOWN' {
  if (openNow === true) {
    return 'OPEN';
  }

  if (openNow === false) {
    return 'CLOSED';
  }

  return 'UNKNOWN';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function roundToTwoDecimals(value: number): number {
  return Number(value.toFixed(2));
}
