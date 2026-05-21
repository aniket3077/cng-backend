import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { extractToken, verifyJwt } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

async function verifyAdminToken(request: NextRequest): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;
  const decoded = await verifyJwt(token);
  if (!decoded || decoded.role !== 'admin') return null;
  return decoded.userId;
}

const updateOwnerSchema = z.object({
  status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  kycRejectionReason: z.string().optional().nullable(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  subscriptionType: z.string().optional().nullable(),
  subscriptionEnd: z.string().optional().nullable(),
});

// GET - List all station owners with filters and pagination
export async function GET(request: NextRequest) {
  try {
    const adminId = await verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const kycStatus = searchParams.get('kycStatus');

    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (kycStatus) where.kycStatus = kycStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [owners, total] = await Promise.all([
      prisma.stationOwner.findMany({
        where,
        include: {
          _count: { select: { stations: true, supportTickets: true } },
          stations: {
            select: {
              id: true,
              name: true,
              city: true,
              lat: true,
              lng: true,
              cngAvailable: true,
              cngUpdatedAt: true,
              approvalStatus: true,
              isVerified: true,
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

    // Strip password hashes before returning
    const ownersData = owners.map(({ passwordHash: _ph, ...owner }) => owner);

    return NextResponse.json(
      {
        owners: ownersData,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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
    const adminId = await verifyAdminToken(request);
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: corsHeaders }
      );
    }

    const validation = updateOwnerSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const { subscriptionType, subscriptionEnd, ...ownerFields } = validation.data;

    // Build typed update data — no raw SQL
    const ownerUpdateData: Record<string, unknown> = {};
    if (ownerFields.status !== undefined) ownerUpdateData.status = ownerFields.status;
    if (ownerFields.kycStatus !== undefined) ownerUpdateData.kycStatus = ownerFields.kycStatus;
    if (ownerFields.kycRejectionReason !== undefined) ownerUpdateData.kycRejectionReason = ownerFields.kycRejectionReason;
    if (ownerFields.emailVerified !== undefined) ownerUpdateData.emailVerified = ownerFields.emailVerified;
    if (ownerFields.phoneVerified !== undefined) ownerUpdateData.phoneVerified = ownerFields.phoneVerified;

    if (Object.keys(ownerUpdateData).length > 0) {
      await prisma.stationOwner.update({
        where: { id: ownerId },
        data: ownerUpdateData,
      });
    }

    // Update subscription fields on the owner's stations if provided
    if (subscriptionType !== undefined || subscriptionEnd !== undefined) {
      const stationUpdateData: Record<string, unknown> = {};
      if (subscriptionType !== undefined) stationUpdateData.subscriptionType = subscriptionType;
      if (subscriptionEnd !== undefined) stationUpdateData.subscriptionEnd = subscriptionEnd ? new Date(subscriptionEnd) : null;

      await prisma.station.updateMany({
        where: { ownerId },
        data: stationUpdateData,
      });
    }

    const updatedOwner = await prisma.stationOwner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        companyName: true,
        status: true,
        kycStatus: true,
        kycRejectionReason: true,
        emailVerified: true,
        phoneVerified: true,
        profileComplete: true,
        onboardingStep: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      { owner: updatedOwner, message: 'Owner updated successfully' },
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

// DELETE - Delete station owner
export async function DELETE(request: NextRequest) {
  try {
    const adminId = await verifyAdminToken(request);
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

    await prisma.stationOwner.delete({ where: { id: ownerId } });

    await prisma.activityLog.create({
      data: {
        adminId,
        ownerId,
        action: 'owner_deleted',
        description: 'Owner account deleted by admin',
      },
    });

    return NextResponse.json(
      { message: 'Owner account deleted successfully' },
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
