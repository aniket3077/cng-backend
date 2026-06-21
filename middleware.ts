import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getCorsHeaders } from '@/lib/cors';


export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const origin = request.headers.get('origin');
  const isApi = url.pathname.startsWith('/api/');

  // Handle preflight OPTIONS requests for API routes
  if (isApi && request.method === 'OPTIONS') {
    const cors = getCorsHeaders(origin);
    return new NextResponse(null, {
      status: 200,
      headers: {
        ...cors,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    });
  }

  const response = NextResponse.next();

  // If it's an API route, dynamically apply the CORS headers
  if (isApi) {
    const cors = getCorsHeaders(origin);
    Object.entries(cors).forEach(([key, val]) => {
      response.headers.set(key, val);
    });
  }

  // Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS - Force HTTPS for 1 year
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires these
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://maps.googleapis.com https://api.razorpay.com",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  // Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=(self)'
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
