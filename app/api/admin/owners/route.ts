import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function verifyAdminToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    if (decoded.role !== 'admin') {
      return null;
    }
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

// GET - List all station owners with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const kycStatus = searchParams.get('kycStatus');
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { companyName: { contains: search } },
      ];
    }

    const [owners, total] = await Promise.all([
      prisma.stationOwner.findMany({
        where,
        include: {
          _count: {
            select: {
              stations: true,
              supportTickets: true,
            },
          },
          stations: {
            select: {
              id: true,
              name: true,
              city: true,
              approvalStatus: true,
            },
            take: 3,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.stationOwner.count({ where }),
    ]);

    // Remove password hashes
    const ownersData = owners.map(({ passwordHash, ...owner }) => owner);

    return NextResponse.json(
      {
        owners: ownersData,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Get owners error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update station owner status/details
export async function PUT(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('id');

    if (!ownerId) {
      return NextResponse.json(
        { error: 'Owner ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const { status, kycStatus, kycRejectionReason, emailVerified, phoneVerified } = body;

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (kycStatus !== undefined) updateData.kycStatus = kycStatus;
    if (kycRejectionReason !== undefined) updateData.kycRejectionReason = kycRejectionReason;
    if (emailVerified !== undefined) updateData.emailVerified = emailVerified;
    if (phoneVerified !== undefined) updateData.phoneVerified = phoneVerified;

    const owner = await prisma.stationOwner.update({
      where: { id: ownerId },
      data: updateData,
    });

    // Create notification for owner
    let notificationMessage = '';
    if (status === 'active') {
      notificationMessage = 'Your account has been activated! You can now add stations.';
    } else if (status === 'suspended') {
      notificationMessage = 'Your account has been suspended. Please contact support.';
    } else if (kycStatus === 'verified') {
      notificationMessage = 'Your KYC verification is complete!';
    } else if (kycStatus === 'rejected') {
      notificationMessage = `KYC verification rejected. Reason: ${kycRejectionReason}`;
    }

    if (notificationMessage) {
      await prisma.notification.create({
        data: {
          ownerId,
          title: 'Account Status Update',
          message: notificationMessage,
          type: status === 'suspended' || kycStatus === 'rejected' ? 'warning' : 'success',
          category: 'general',
        },
      });
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        ownerId,
        action: 'owner_updated',
        description: `Owner status updated by admin`,
        metadata: JSON.stringify(updateData),
      },
    });

    const { passwordHash, ...ownerData } = owner;

    return NextResponse.json(
      {
        message: 'Owner updated successfully',
        owner: ownerData,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Update owner error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE - Delete station owner (soft delete by suspending)
export async function DELETE(request: NextRequest) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('id');

    if (!ownerId) {
      return NextResponse.json(
        { error: 'Owner ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Soft delete by suspending
    await prisma.stationOwner.update({
      where: { id: ownerId },
      data: { status: 'suspended' },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        ownerId,
        action: 'owner_deleted',
        description: 'Owner account suspended/deleted by admin',
      },
    });

    return NextResponse.json(
      { message: 'Owner account suspended successfully' },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Delete owner error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
