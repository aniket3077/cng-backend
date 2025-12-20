import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';

const signupSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().trim().toLowerCase(),
  phone: z.string().min(10).max(20).regex(/^[0-9+\-\s()]+$/, 'Invalid phone number'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  companyName: z.string().max(200).trim().optional(),
  gstNumber: z.string().optional(),
  panNumber: z.string().optional(),
  stationName: z.string().max(200).trim().optional(),
  address: z.string().max(500).trim().optional(),
  city: z.string().max(100).trim().optional(),
  state: z.string().max(100).trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResponse = rateLimit(request, rateLimitConfigs.auth, { headers: corsHeaders });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await request.json();
    const validation = signupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { name, email, phone, password, companyName, gstNumber, panNumber, stationName, address, city, state, lat, lng } = validation.data;

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if email already exists
    const existingOwner = await prisma.stationOwner.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingOwner) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409, headers: corsHeaders }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create station owner
    const owner = await prisma.stationOwner.create({
      data: {
        name,
        email: email.toLowerCase(),
        phone,
        passwordHash,
        companyName: companyName || stationName || null,
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        onboardingStep: stationName ? 2 : 1,
      },
    });

    // Create station if details provided
    let station = null;
    if (stationName && address && city && state && lat && lng) {
      station = await prisma.station.create({
        data: {
          name: stationName,
          address,
          city,
          state,
          lat: parseFloat(lat.toString()),
          lng: parseFloat(lng.toString()),
          fuelTypes: 'CNG',
          ownerId: owner.id,
          approvalStatus: 'pending',
          isVerified: false,
        },
      });

      // Log station creation
      await prisma.activityLog.create({
        data: {
          ownerId: owner.id,
          stationId: station.id,
          action: 'station_created',
          description: `Station "${stationName}" registered during signup`,
        },
      });
    }

    // Generate JWT token
    const token = signJwt(
      { userId: owner.id, email: owner.email, role: 'owner' }
    );

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId: owner.id,
        action: 'signup',
        description: 'Station owner registered',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    });

    // Create welcome notification
    await prisma.notification.create({
      data: {
        ownerId: owner.id,
        title: 'Welcome to CNG Bharat!',
        message: station 
          ? `Your account and station "${stationName}" have been created. Waiting for admin approval to appear on the map.`
          : 'Your account has been created successfully. Complete your profile to start adding your CNG station.',
        type: 'success',
        category: 'general',
      },
    });

    return NextResponse.json(
      {
        message: 'Registration successful',
        token,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          onboardingStep: owner.onboardingStep,
          profileComplete: owner.profileComplete,
        },
        station: station ? {
          id: station.id,
          name: station.name,
          approvalStatus: station.approvalStatus,
        } : null,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
