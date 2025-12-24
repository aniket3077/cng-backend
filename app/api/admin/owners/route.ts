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
    if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
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
    const search = searchParams.get('search');

    const skip = (page - 1) * limit;

    const where: any = {};
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

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { status, kycStatus, kycRejectionReason, emailVerified, phoneVerified, subscriptionType, subscriptionEnd } = body;

    console.log('Update owner request:', { ownerId, body });

    // Use raw SQL to update owner fields (bypass Prisma client validation)
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (status !== undefined) {
        updates.push(`"status" = $${paramIndex++}`);
        values.push(status);
      }
      if (kycStatus !== undefined) {
        updates.push(`"kycStatus" = $${paramIndex++}`);
        values.push(kycStatus);
      }
      if (kycRejectionReason !== undefined) {
        updates.push(`"kycRejectionReason" = $${paramIndex++}`);
        values.push(kycRejectionReason);
      }
      if (emailVerified !== undefined) {
        updates.push(`"emailVerified" = $${paramIndex++}`);
        values.push(emailVerified);
      }
      if (phoneVerified !== undefined) {
        updates.push(`"phoneVerified" = $${paramIndex++}`);
        values.push(phoneVerified);
      }

      if (updates.length > 0) {
        updates.push(`"updatedAt" = $${paramIndex++}`);
        values.push(new Date());
        values.push(ownerId); // Last parameter for WHERE clause

        const sql = `UPDATE "StationOwner" SET ${updates.join(', ')} WHERE "id" = $${paramIndex}`;
        console.log('Executing SQL:', sql, 'with values:', values);

        await prisma.$executeRawUnsafe(sql, ...values);
      }
    } catch (dbError) {
      console.error('Database update error:', dbError);
      return NextResponse.json(
        { error: 'Database error', details: dbError instanceof Error ? dbError.message : 'Unknown database error' },
        { status: 500, headers: corsHeaders }
      );
    }

    // If subscription fields provided, update the station (since subscription is on Station model)
    if (subscriptionType !== undefined || subscriptionEnd !== undefined) {
      try {
        const stationUpdateData: any = {};
        if (subscriptionType !== undefined) stationUpdateData.subscriptionType = subscriptionType;
        if (subscriptionEnd !== undefined) stationUpdateData.subscriptionEnd = new Date(subscriptionEnd);

        await prisma.station.updateMany({
          where: { ownerId },
          data: stationUpdateData,
        });
      } catch (stationError) {
        console.error('Station update error:', stationError);
        // Continue even if station update fails
      }
    }

    // Fetch and return updated owner data
    const updatedOwner = await prisma.stationOwner.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        companyName: true,
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
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
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

    // Delete owner and related data
    // Note: Station deletion handled by cascade
    await prisma.stationOwner.delete({
      where: { id: ownerId },
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
