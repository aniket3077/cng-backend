import { NextRequest, NextResponse } from 'next/server';
import { getAllowedOrigin, getCorsHeaders } from './lib/cors';

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const origin = request.headers.get('origin');
  const allowedOrigin = getAllowedOrigin(origin);
  const corsHeaders = getCorsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: origin && !allowedOrigin ? 403 : 204,
      headers: corsHeaders,
    });
  }

  const response = NextResponse.next();

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*'],
};
