import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAdmin } from '@/lib/auth';
import { roundCurrency } from '@/lib/referral-commission';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * GET /api/admin/payouts
 * Returns paginated list of withdrawals with search and filters, along with dashboard stats.
 */
export async function GET(request: NextRequest) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || '';
    const overdue = searchParams.get('overdue') === 'true';

    const skip = (page - 1) * limit;
    const now = new Date();

    // Build the query where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (overdue) {
      where.payoutDeadline = { lt: now };
      where.status = { in: ['pending', 'processing'] };
    }

    if (search) {
      where.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { upiId: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
        {
          user: {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // Run queries in parallel
    const [withdrawals, totalCount, statsData] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { requestedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.withdrawal.count({ where }),
      // Get statistics for the dashboard
      prisma.withdrawal.findMany({
        select: {
          amount: true,
          status: true,
          payoutDeadline: true,
        },
      }),
    ]);

    // Calculate Admin Dashboard Stats
    let totalPendingAmount = 0;
    let pendingRequestsCount = 0;
    let completedPayoutsCount = 0;
    let rejectedRequestsCount = 0;
    let overdueRequestsCount = 0;

    for (const w of statsData) {
      if (w.status === 'pending' || w.status === 'processing') {
        totalPendingAmount += w.amount;
        pendingRequestsCount += 1;
        
        if (w.payoutDeadline < now) {
          overdueRequestsCount += 1;
        }
      } else if (w.status === 'paid') {
        completedPayoutsCount += 1;
      } else if (w.status === 'rejected') {
        rejectedRequestsCount += 1;
      }
    }

    const totalPages = Math.ceil(totalCount / limit);

    return NextResponse.json(
      {
        withdrawals: withdrawals.map((w) => ({
          id: w.id,
          userId: w.userId,
          userName: w.user.name,
          userEmail: w.user.email,
          userMobile: w.user.phone || 'N/A',
          amount: w.amount,
          paymentMethod: w.paymentMethod,
          upiId: w.upiId,
          bankName: w.bankName,
          accountNumber: w.accountNumber,
          ifscCode: w.ifscCode,
          status: w.status,
          adminRemarks: w.adminRemarks,
          requestedAt: w.requestedAt,
          approvedAt: w.approvedAt,
          paidAt: w.paidAt,
          rejectedAt: w.rejectedAt,
          payoutDeadline: w.payoutDeadline,
          isOverdue: (w.status === 'pending' || w.status === 'processing') && w.payoutDeadline < now,
        })),
        stats: {
          totalPendingAmount: roundCurrency(totalPendingAmount),
          pendingRequests: pendingRequestsCount,
          completedPayouts: completedPayoutsCount,
          rejectedRequests: rejectedRequestsCount,
          overdueRequests: overdueRequestsCount,
        },
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages,
        },
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching admin withdrawals:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
