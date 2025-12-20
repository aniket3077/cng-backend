import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-utils';
import { extractToken, verifyJwt } from '@/lib/auth';
import { blacklistToken } from '@/lib/token-blacklist';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    
    if (!token) {
      return NextResponse.json(
        { error: 'No token provided' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Verify token is valid before blacklisting
    const decoded = verifyJwt(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Blacklist the token
    blacklistToken(token);

    return NextResponse.json(
      { success: true, message: 'Logged out successfully' },
      { headers: corsHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}
