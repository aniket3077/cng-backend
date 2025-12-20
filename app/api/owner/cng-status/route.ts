import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import { requireActiveSubscription, checkSubscription } from '@/lib/subscription';

const updateStatusSchema = z.object({
  stationId: z.string().optional(),
  cngAvailable: z.boolean().optional(),
  cngQuantityKg: z.number().min(0).optional(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get CNG availability status for owner's stations
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

    const stations = await prisma.station.findMany({
      where: { ownerId: payload.userId },
      select: {
        id: true,
        name: true,
        city: true,
        cngAvailable: true,
        cngQuantityKg: true,
        cngUpdatedAt: true,
      },
    });

    return NextResponse.json({
      stations,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get CNG status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CNG status' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PUT - Update CNG availability status
export async function PUT(request: NextRequest) {
  try {
    // Check subscription first
    const subscriptionCheck = await requireActiveSubscription(request);
    if (subscriptionCheck) return subscriptionCheck;

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
    const validation = updateStatusSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { stationId, cngAvailable, cngQuantityKg } = validation.data;

    // Determine availability based on quantity if provided
    const finalCngAvailable = cngQuantityKg !== undefined 
      ? cngQuantityKg > 0 
      : cngAvailable ?? true;

    // If stationId provided, update that specific station
    if (stationId) {
      // Verify station belongs to owner
      const station = await prisma.station.findFirst({
        where: { 
          id: stationId,
          ownerId: payload.userId 
        },
      });

      if (!station) {
        return NextResponse.json(
          { error: 'Station not found or unauthorized' },
          { status: 404, headers: corsHeaders }
        );
      }

      const updateData: any = {
        cngAvailable: finalCngAvailable,
        cngUpdatedAt: new Date(),
      };
      
      if (cngQuantityKg !== undefined) {
        updateData.cngQuantityKg = cngQuantityKg;
      }

      const updatedStation = await prisma.station.update({
        where: { id: stationId },
        data: updateData,
      });

      // Log activity
      const quantityText = cngQuantityKg !== undefined ? ` (${cngQuantityKg} kg)` : '';
      await prisma.activityLog.create({
        data: {
          ownerId: payload.userId,
          stationId: stationId,
          action: 'cng_status_updated',
          description: `CNG availability set to ${finalCngAvailable ? 'Available' : 'Not Available'}${quantityText}`,
        },
      });

      return NextResponse.json({
        message: 'CNG status updated successfully',
        station: {
          id: updatedStation.id,
          name: updatedStation.name,
          cngAvailable: updatedStation.cngAvailable,
          cngQuantityKg: updatedStation.cngQuantityKg,
          cngUpdatedAt: updatedStation.cngUpdatedAt,
        },
      }, { headers: corsHeaders });
    } else {
      // Update all stations belonging to owner
      const updateData: any = {
        cngAvailable: finalCngAvailable,
        cngUpdatedAt: new Date(),
      };
      
      if (cngQuantityKg !== undefined) {
        updateData.cngQuantityKg = cngQuantityKg;
      }

      const result = await prisma.station.updateMany({
        where: { ownerId: payload.userId },
        data: updateData,
      });

      // Log activity
      const quantityText = cngQuantityKg !== undefined ? ` (${cngQuantityKg} kg)` : '';
      await prisma.activityLog.create({
        data: {
          ownerId: payload.userId,
          action: 'cng_status_updated',
          description: `CNG availability for all stations set to ${finalCngAvailable ? 'Available' : 'Not Available'}${quantityText}`,
        },
      });

      return NextResponse.json({
        message: `CNG status updated for ${result.count} station(s)`,
        updatedCount: result.count,
        cngAvailable: finalCngAvailable,
        cngQuantityKg,
      }, { headers: corsHeaders });
    }
  } catch (error) {
    console.error('Update CNG status error:', error);
    return NextResponse.json(
      { error: 'Failed to update CNG status' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Same as PUT for convenience
export async function POST(request: NextRequest) {
  return PUT(request);
}
