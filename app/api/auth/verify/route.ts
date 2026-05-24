import { NextRequest, NextResponse } from 'next/server';
import { getCorsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: getCorsHeaders(request.headers.get('origin')) });
}

export async function GET(request: NextRequest) {
  const corsHeaders = getCorsHeaders(request.headers.get('origin'));

  try {
    const payload = await requireAuth(request);
    return NextResponse.json(
      { valid: true, role: payload.role },
      { headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      { valid: false },
      { status: 401, headers: corsHeaders }
    );
  }
}
