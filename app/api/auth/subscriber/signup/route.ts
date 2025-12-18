import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, password, companyName, gstNumber, panNumber, stationName, address, city, state, lat, lng } = body;

    // Validation
    if (!name || !email || !phone || !password) {
      return NextResponse.json(
        { error: 'Name, email, phone, and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

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
        status: 'pending',
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
    const token = jwt.sign(
      { ownerId: owner.id, email: owner.email, type: 'owner' },
      JWT_SECRET,
      { expiresIn: '30d' }
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
          status: owner.status,
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
