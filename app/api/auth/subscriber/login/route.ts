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
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find station owner
    const owner = await prisma.stationOwner.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        stations: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            approvalStatus: true,
            cngAvailable: true,
            cngUpdatedAt: true,
          },
        },
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if account is suspended
    if (owner.status === 'suspended') {
      return NextResponse.json(
        { error: 'Your account has been suspended. Please contact support.' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, owner.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { ownerId: owner.id, email: owner.email, type: 'owner' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Update last login
    await prisma.stationOwner.update({
      where: { id: owner.id },
      data: { lastLoginAt: new Date() },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId: owner.id,
        action: 'login',
        description: 'Station owner logged in',
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    });

    return NextResponse.json(
      {
        message: 'Login successful',
        token,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
          companyName: owner.companyName,
          status: owner.status,
          emailVerified: owner.emailVerified,
          phoneVerified: owner.phoneVerified,
          kycStatus: owner.kycStatus,
          profileComplete: owner.profileComplete,
          onboardingStep: owner.onboardingStep,
          stations: owner.stations,
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
