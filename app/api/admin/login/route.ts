import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(6).max(100),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  return NextResponse.redirect(new URL('/api/auth/admin/login', request.url), 308);
}
