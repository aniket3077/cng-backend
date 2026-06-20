import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth';
import { syncUserCommissionBalances } from '@/lib/referral-commission';
import { sendWithdrawalStatusEmail } from '@/lib/email';
import { z } from 'zod';

const updatePayoutSchema = z.object({
  status: z.enum(['processing', 'paid', 'rejected']),
  adminRemarks: z.string().max(500, 'Remarks cannot exceed 500 characters').optional().nullable(),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/admin/payouts/[id]
 * Get details of a single withdrawal request.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { id } = await params;

    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            availableBalance: true,
            pendingWithdrawals: true,
          },
        },
      },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json(
      {
        withdrawal: {
          id: withdrawal.id,
          userId: withdrawal.userId,
          userName: withdrawal.user.name,
          userEmail: withdrawal.user.email,
          userMobile: withdrawal.user.phone || 'N/A',
          availableBalance: withdrawal.user.availableBalance,
          pendingWithdrawals: withdrawal.user.pendingWithdrawals,
          amount: withdrawal.amount,
          paymentMethod: withdrawal.paymentMethod,
          upiId: withdrawal.upiId,
          bankName: withdrawal.bankName,
          accountNumber: withdrawal.accountNumber,
          ifscCode: withdrawal.ifscCode,
          status: withdrawal.status,
          adminRemarks: withdrawal.adminRemarks,
          requestedAt: withdrawal.requestedAt,
          approvedAt: withdrawal.approvedAt,
          paidAt: withdrawal.paidAt,
          rejectedAt: withdrawal.rejectedAt,
          payoutDeadline: withdrawal.payoutDeadline,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching admin withdrawal details:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}

/**
 * PUT /api/admin/payouts/[id]
 * Update status of a withdrawal request (Approve/Process, Mark as Paid, Reject).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    const { id } = await params;
    const body = await request.json();
    const validation = updatePayoutSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const { status: targetStatus, adminRemarks } = validation.data;

    // Fetch the current withdrawal request
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404, headers: corsHeaders });
    }

    const currentStatus = withdrawal.status;

    // Prevent duplicate processing
    if (currentStatus === targetStatus) {
      return NextResponse.json(
        { error: `Withdrawal is already in '${targetStatus}' status.` },
        { status: 400, headers: corsHeaders }
      );
    }

    if (currentStatus === 'paid' || currentStatus === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot update withdrawal status. Payout is already finalized (paid or rejected).' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate state transitions
    // Pending -> Processing
    // Pending -> Rejected
    // Processing -> Paid
    // Processing -> Rejected
    if (currentStatus === 'processing' && targetStatus === 'processing') {
      return NextResponse.json({ error: 'Invalid state transition' }, { status: 400, headers: corsHeaders });
    }

    // Execute state transition in database transaction
    const updatedWithdrawal = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const updateData: any = {
        status: targetStatus,
        adminRemarks: adminRemarks || withdrawal.adminRemarks,
      };

      let action = 'UPDATE_WITHDRAWAL';
      let description = '';

      if (targetStatus === 'processing') {
        updateData.approvedAt = now;
        action = 'APPROVE_WITHDRAWAL';
        description = `Approved withdrawal request ${id} (marked as Processing).`;
      } else if (targetStatus === 'paid') {
        updateData.paidAt = now;
        
        // Deduct from User pending balance (since payout is completed)
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            pendingWithdrawals: { decrement: withdrawal.amount },
          },
        });

        action = 'COMPLETE_WITHDRAWAL';
        description = `Marked withdrawal request ${id} as Paid.`;
      } else if (targetStatus === 'rejected') {
        updateData.rejectedAt = now;

        // Refund: deduct from User pending balance and add back to availableBalance
        await tx.user.update({
          where: { id: withdrawal.userId },
          data: {
            pendingWithdrawals: { decrement: withdrawal.amount },
            availableBalance: { increment: withdrawal.amount },
          },
        });

        action = 'REJECT_WITHDRAWAL';
        description = `Rejected withdrawal request ${id}. Remarks: ${adminRemarks || 'None'}`;
      }

      // Update withdrawal record
      const result = await tx.withdrawal.update({
        where: { id },
        data: updateData,
      });

      // Synchronize balances
      await syncUserCommissionBalances(tx, withdrawal.userId);

      // Create admin audit log
      await tx.activityLog.create({
        data: {
          adminId: adminPayload.userId,
          action,
          description,
          metadata: JSON.stringify({
            withdrawalId: id,
            amount: withdrawal.amount,
            targetStatus,
            adminRemarks,
            timestamp: now.toISOString(),
          }),
        },
      });

      return result;
    });

    // Send email notification to user asynchronously
    try {
      await sendWithdrawalStatusEmail(
        withdrawal.user.email,
        withdrawal.user.name,
        withdrawal.amount,
        targetStatus,
        withdrawal.paymentMethod,
        adminRemarks
      );
    } catch (err) {
      console.error('Failed to send status update email:', err);
    }

    return NextResponse.json(
      {
        message: `Withdrawal successfully updated to '${targetStatus}'.`,
        withdrawal: updatedWithdrawal,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error processing admin withdrawal action:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
  }
}
