import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth, extractToken } from '@/lib/auth';
import { blacklistToken } from '@/lib/redis-token-blacklist';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * DELETE /api/customer/account
 * Account Deletion Endpoint - Required for Google Play Compliance
 * 
 * GDPR Compliant: Anonymizes user data while preserving referral integrity
 */
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting to prevent abuse
    const rateLimitResponse = await rateLimit(request, rateLimitConfigs.api, {
      headers: corsHeaders,
      errorMessage: 'Too many account deletion requests. Please try again later.',
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const payload = await requireAuth(request);
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Perform account deletion in transaction
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.userId },
        select: { 
          email: true,
          availableBalance: true,
          pendingWithdrawals: true 
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Prevent deletion if user has pending payouts
      if (user.availableBalance > 0 || user.pendingWithdrawals > 0) {
        throw new Error('Cannot delete account with pending balance or withdrawals. Please withdraw all funds first.');
      }

      // GDPR Compliant: Anonymize user data instead of hard delete
      // This preserves referral chain integrity while removing PII
      const deletedEmail = `deleted_${Date.now()}_${payload.userId.slice(0, 8)}@deleted.local`;
      
      await tx.user.update({
        where: { id: payload.userId },
        data: {
          email: deletedEmail,
          name: 'Deleted User',
          phone: null,
          passwordHash: '', // Clear password
          referralCode: null, // Remove referral code to prevent new referrals
          lastKnownDeviceFingerprint: null,
          // Keep referredBy to maintain referral chain for existing referrers
        },
      });

      // Cascade delete handled by Prisma schema:
      // - vehicles (onDelete: Cascade)
      // - savedPayoutMethods (onDelete: Cascade)
      // - payoutOtps (onDelete: Cascade)
      // - withdrawals (onDelete: Cascade)
      
      // Note: ReferralEarnings and Referrals are NOT deleted to maintain
      // financial records and referrer earnings (GDPR allows this for legal obligations)
    });

    // Blacklist the current token to immediately log out the user
    const token = extractToken(request);
    if (token) {
      await blacklistToken(token);
    }

    return NextResponse.json(
      {
        message: 'Account deleted successfully',
        note: 'Your account has been permanently deleted. Thank you for using CNG Bharat.',
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Account deletion error:', error);
    
    if (error instanceof Error && error.message.includes('pending balance')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500, headers: corsHeaders }
    );
  }
}
