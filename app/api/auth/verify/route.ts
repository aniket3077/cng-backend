import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
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
