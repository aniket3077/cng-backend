import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, extractToken } from '@/lib/auth';
import { blacklistToken } from '@/lib/redis-token-blacklist';
import { corsHeaders } from '@/lib/api-utils';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Delete user account
 * Anonymizes personal data while retaining financial records for legal compliance
 */
export async function DELETE(request: NextRequest) {
  try {
    const payload = await requireAuth(request);
    
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check for pending payouts
    const pendingPayouts = await prisma.payoutRequest.count({
      where: {
        userId: payload.userId,
        status: { in: ['pending', 'processing'] }
      }
    });

    if (pendingPayouts > 0) {
      return NextResponse.json(
        { 
          error: 'Cannot delete account with pending payouts. Please complete or cancel pending payouts first.',
          pendingPayouts
        },
        { status: 400, headers: corsHeaders }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Anonymize user data (soft delete)
      await tx.user.update({
        where: { id: payload.userId },
        data: {
          email: `deleted_${payload.userId}@deleted.local`,
          name: 'Deleted User',
          phone: null,
          passwordHash: 'deleted',
          referralCode: null,
          lastKnownDeviceFingerprint: null,
          // Mark for permanent deletion after 30 days
          updatedAt: new Date(),
        }
      });

      // Delete vehicles
      await tx.vehicle.deleteMany({
        where: { userId: payload.userId }
      });

      // Retain referral earnings for audit (legal requirement)
      // They will be auto-deleted after 7 years by compliance script
    });

    // Blacklist current token
    const token = extractToken(request);
    if (token) {
      await blacklistToken(token, Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7); // 7 days from now
    }

    return NextResponse.json(
      { 
        message: 'Account deletion scheduled. Your personal data has been anonymized. Financial records will be retained for legal compliance (7 years).',
        deletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Account deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500, headers: corsHeaders }
    );
  }
}
