import { NextRequest, NextResponse } from 'next/server';
import { env, getEnvValidationError } from '@/lib/env';
import { corsHeaders } from '@/lib/api-utils';
import { isPrismaInitialized, getPrismaInitError } from '@/lib/prisma';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const envError = getEnvValidationError();
  const prismaReady = isPrismaInitialized();
  const prismaError = prismaReady ? null : getPrismaInitError();

  const status = envError || (!prismaReady && prismaError) ? 'unhealthy' : 'healthy';
  const statusCode = envError ? 503 : prismaReady ? 200 : 502;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        env: {
          ok: !envError,
          error: envError?.message || null,
        },
        database: {
          ok: prismaReady,
          error: prismaError?.message || null,
        },
      },
      version: '1.0.0',
      uptime: process.uptime(),
    },
    { status: statusCode, headers: corsHeaders }
  );
}
