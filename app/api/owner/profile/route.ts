import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get owner profile
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    
    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const owner = await prisma.stationOwner.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        companyName: true,
        gstNumber: true,
        panNumber: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        status: true,
        emailVerified: true,
        phoneVerified: true,
        kycStatus: true,
        profileComplete: true,
        onboardingStep: true,
        subscriptionType: true,
        subscriptionEndsAt: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        stations: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            state: true,
            lat: true,
            lng: true,
            approvalStatus: true,
            isVerified: true,
            cngAvailable: true,
            cngQuantityKg: true,
            cngUpdatedAt: true,
          },
        },
        _count: {
          select: {
            supportTickets: true,
            notifications: true,
            paymentHistory: true,
          },
        },
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { owner },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get owner profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update owner profile
export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    
    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const {
      name,
      phone,
      companyName,
      gstNumber,
      panNumber,
      address,
      city,
      state,
      postalCode,
    } = body;

    // Build update data dynamically
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;
    if (panNumber !== undefined) updateData.panNumber = panNumber;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (postalCode !== undefined) updateData.postalCode = postalCode;

    const owner = await prisma.stationOwner.update({
      where: { id: payload.userId },
      data: updateData,
    });

    // Check if profile is complete
    const isComplete = !!(
      owner.name &&
      owner.phone &&
      owner.companyName &&
      owner.address &&
      owner.city &&
      owner.state
    );

    if (isComplete && !owner.profileComplete) {
      await prisma.stationOwner.update({
        where: { id: payload.userId },
        data: { profileComplete: true },
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        ownerId: payload.userId,
        action: 'profile_updated',
        description: 'Profile information updated',
      },
    });

    return NextResponse.json(
      { 
        owner: {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          phone: owner.phone,
          companyName: owner.companyName,
          gstNumber: owner.gstNumber,
          panNumber: owner.panNumber,
          address: owner.address,
          city: owner.city,
          state: owner.state,
          postalCode: owner.postalCode,
          profileComplete: isComplete ? true : owner.profileComplete,
        },
        message: 'Profile updated successfully' 
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Update owner profile error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
