import { NextRequest, NextResponse } from 'next/server';

/**
 * Test endpoint to diagnose signup issues — DEVELOPMENT / LOCAL TESTING ONLY.
 * BLOCKED IN PRODUCTION: this endpoint is a security risk (no auth, no rate limit).
 *
 * In production, use the health check endpoint at /api/health instead.
 */

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(
    {
      message: 'This diagnostic endpoint is disabled in production.',
      docs: 'Use /api/health for liveness checks.',
    },
    { status: 200 },
  );
}

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(
    {
      message: 'This diagnostic endpoint is disabled in production.',
      docs: 'Use /api/health for liveness checks.',
    },
    { status: 200 },
  );
}
