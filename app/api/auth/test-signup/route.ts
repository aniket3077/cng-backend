import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';

/**
 * Test endpoint to diagnose signup issues
 * POST /api/auth/test-signup
 * 
 * This endpoint helps debug signup failures by testing:
 * 1. Database connectivity
 * 2. Prisma connection
 * 3. User creation flow
 */

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // Test 1: Check database connection
    console.log('Test 1: Checking database connection...');
    const dbTest = await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection OK');

    // Test 2: Check if User table exists and is accessible
    console.log('Test 2: Checking User table...');
    const userCount = await prisma.user.count();
    console.log(`✅ User table OK (${userCount} users)`);

    // Test 3: Check if Vehicle table exists and is accessible
    console.log('Test 3: Checking Vehicle table...');
    const vehicleCount = await prisma.vehicle.count();
    console.log(`✅ Vehicle table OK (${vehicleCount} vehicles)`);

    return NextResponse.json(
      {
        status: 'OK',
        checks: {
          database: 'Connected',
          userTable: `${userCount} users`,
          vehicleTable: `${vehicleCount} vehicles`,
          prisma: 'Connected',
        },
        message: 'All systems operational',
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json(
      {
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Diagnostic test failed',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testEmail } = body;

    if (!testEmail) {
      return NextResponse.json(
        { error: 'testEmail parameter required' },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('Creating test user with email:', testEmail);

    // Test creating a user
    const testUser = await prisma.user.create({
      data: {
        name: 'Test User',
        email: testEmail,
        phone: '9876543210',
        passwordHash: 'test_hash_do_not_use',
        role: 'customer',
        vehicles: {
          create: {
            plate: 'DL01AB1234',
            regionCode: 'DL',
          },
        },
      },
      include: {
        vehicles: true,
      },
    });

    console.log('✅ Test user created:', testUser.id);

    return NextResponse.json(
      {
        status: 'SUCCESS',
        message: 'Test user created successfully',
        user: testUser,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Test user creation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      {
        status: 'ERROR',
        error: errorMessage,
        code: (error as any)?.code,
        message: 'Test user creation failed',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
