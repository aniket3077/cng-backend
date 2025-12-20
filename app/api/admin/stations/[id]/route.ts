import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { extractToken, verifyJwt } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

function verifyAdminToken(request: NextRequest): string | null {
  const token = extractToken(request);
  if (!token) {
    return null;
  }

  const decoded = verifyJwt(token);
  if (!decoded || decoded.role !== 'admin') {
    return null;
  }
  return decoded.userId;
}

const updateStationSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  postalCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  fuelTypes: z.string().optional(),
  phone: z.string().optional(),
  openingHours: z.string().optional(),
  amenities: z.string().optional(),
  isPartner: z.boolean().optional(),
  isVerified: z.boolean().optional(),
  subscriptionType: z.string().optional(),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  rejectionReason: z.string().optional(),
});

// GET - Get single station details
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const station = await prisma.station.findUnique({
      where: { id: params.id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            companyName: true,
          },
        },
      },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json({ station }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get station error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update station
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = updateStationSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if station exists
    const existingStation = await prisma.station.findUnique({
      where: { id: params.id },
    });

    if (!existingStation) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const { rejectionReason, ...updateData } = validation.data;

    const updatedStation = await prisma.station.update({
      where: { id: params.id },
      data: updateData,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        stationId: params.id,
        action: 'station_updated',
        description: `Station "${updatedStation.name}" updated by admin`,
        metadata: JSON.stringify({ changes: Object.keys(updateData) }),
      },
    });

    // If approval status changed, notify owner
    if (updateData.approvalStatus && existingStation.ownerId) {
      const statusMessages: Record<string, string> = {
        approved: 'Your station has been approved!',
        rejected: `Your station was rejected. ${rejectionReason || ''}`,
      };

      if (statusMessages[updateData.approvalStatus]) {
        await prisma.notification.create({
          data: {
            ownerId: existingStation.ownerId,
            title: `Station ${updateData.approvalStatus}`,
            message: statusMessages[updateData.approvalStatus],
            type: updateData.approvalStatus === 'approved' ? 'success' : 'warning',
            category: 'station',
          },
        });
      }
    }

    return NextResponse.json({
      message: 'Station updated successfully',
      station: updatedStation,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update station error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE - Delete station
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminId = verifyAdminToken(request);
    if (!adminId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if station exists
    const station = await prisma.station.findUnique({
      where: { id: params.id },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Delete station
    await prisma.station.delete({
      where: { id: params.id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        action: 'station_deleted',
        description: `Station "${station.name}" deleted by admin`,
      },
    });

    return NextResponse.json({
      message: 'Station deleted successfully',
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete station error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
