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

const updateOwnerSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  companyName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
  kycStatus: z.enum(['pending', 'verified', 'rejected']).optional(),
  kycRejectionReason: z.string().optional().nullable(),
  subscriptionType: z.string().optional().nullable(),
  subscriptionEndsAt: z.string().optional().nullable(),
});

// GET - Get single owner details
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

    const owner = await prisma.stationOwner.findUnique({
      where: { id: params.id },
      include: {
        stations: true,
        _count: {
          select: {
            stations: true,
            supportTickets: true,
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

    // Remove password hash
    const { passwordHash, ...ownerData } = owner;

    return NextResponse.json({ owner: ownerData }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get owner error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update owner
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
    const validation = updateOwnerSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if owner exists
    const existingOwner = await prisma.stationOwner.findUnique({
      where: { id: params.id },
    });

    if (!existingOwner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const updateData: any = { ...validation.data };
    
    // Convert subscriptionEndsAt string to Date
    if (updateData.subscriptionEndsAt) {
      updateData.subscriptionEndsAt = new Date(updateData.subscriptionEndsAt);
    }

    const updatedOwner = await prisma.stationOwner.update({
      where: { id: params.id },
      data: updateData,
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        ownerId: params.id,
        action: 'owner_updated',
        description: `Owner "${updatedOwner.name}" updated by admin`,
        metadata: JSON.stringify({ changes: Object.keys(validation.data) }),
      },
    });

    // Send notifications based on changes
    if (validation.data.status && validation.data.status !== existingOwner.status) {
      const statusMessages: Record<string, { title: string; message: string; type: string }> = {
        active: { title: 'Account Activated', message: 'Your account has been activated!', type: 'success' },
        suspended: { title: 'Account Suspended', message: 'Your account has been suspended.', type: 'warning' },
        rejected: { title: 'Account Rejected', message: 'Your account registration was rejected.', type: 'error' },
      };

      const notification = statusMessages[validation.data.status];
      if (notification) {
        await prisma.notification.create({
          data: {
            ownerId: params.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            category: 'account',
          },
        });
      }
    }

    if (validation.data.kycStatus && validation.data.kycStatus !== existingOwner.kycStatus) {
      const kycMessages: Record<string, { title: string; message: string; type: string }> = {
        verified: { title: 'KYC Verified', message: 'Your KYC documents have been verified!', type: 'success' },
        rejected: { 
          title: 'KYC Rejected', 
          message: `KYC rejected: ${validation.data.kycRejectionReason || 'Please contact support.'}`, 
          type: 'error' 
        },
      };

      const notification = kycMessages[validation.data.kycStatus];
      if (notification) {
        await prisma.notification.create({
          data: {
            ownerId: params.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            category: 'kyc',
          },
        });
      }
    }

    if (validation.data.subscriptionType && validation.data.subscriptionType !== existingOwner.subscriptionType) {
      await prisma.notification.create({
        data: {
          ownerId: params.id,
          title: 'Subscription Updated',
          message: `Your subscription has been changed to ${validation.data.subscriptionType} plan.`,
          type: 'info',
          category: 'subscription',
        },
      });
    }

    const { passwordHash, ...ownerData } = updatedOwner;

    return NextResponse.json({
      message: 'Owner updated successfully',
      owner: ownerData,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Update owner error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE - Delete owner
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

    // Check if owner exists
    const owner = await prisma.stationOwner.findUnique({
      where: { id: params.id },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Delete owner (cascade will handle related records)
    await prisma.stationOwner.delete({
      where: { id: params.id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        adminId,
        action: 'owner_deleted',
        description: `Owner "${owner.name}" deleted by admin`,
      },
    });

    return NextResponse.json({
      message: 'Owner deleted successfully',
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete owner error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
