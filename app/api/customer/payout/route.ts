import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

const payoutRequestSchema = z.object({
  amount: z.number().min(100).max(50000), // Min 100, Max 50000 INR
  payoutMethod: z.enum(['bank_transfer', 'upi']),
  accountDetails: z.object({
    accountNumber: z.string().min(10).max(18),
    ifsc: z.string().min(11).max(11),
    accountHolderName: z.string().min(2).max(100),
    upiId: z.string().optional(),
  }),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get payout history and available balance
export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get user's earnings and payout history
    const [user, earnings, payoutRequests] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
      }),
      prisma.referralEarning.findMany({
        where: { userId: payload.userId },
        orderBy: { id: 'desc' as const },
      }),
      prisma.payoutRequest.findMany({
        where: { userId: payload.userId },
        orderBy: { id: 'desc' as const },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const availableBalance = earnings
      .filter((earning: any) => earning.status === 'available')
      .reduce((sum: number, earning: any) => sum + earning.amount, 0);

    const totalEarnings = earnings
      .reduce((sum: number, earning: any) => sum + earning.amount, 0);

    const pendingEarnings = earnings
      .filter((earning: any) => earning.status === 'pending')
      .reduce((sum: number, earning: any) => sum + earning.amount, 0);

    return NextResponse.json({
      availableBalance,
      totalEarnings,
      pendingEarnings,
      earnings,
      payoutRequests,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Payout GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Request payout
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = payoutRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.errors },
        { status: 400, headers: corsHeaders }
      );
    }

    const { amount, payoutMethod, accountDetails } = validation.data;

    // Check if user has sufficient balance
    const userEarnings = await prisma.referralEarning.findMany({
      where: { userId: payload.userId },
    });

    const availableBalance = userEarnings
      .filter((earning: any) => earning.status === 'available')
      .reduce((sum: number, earning: any) => sum + earning.amount, 0);

    if (availableBalance < amount) {
      return NextResponse.json(
        { error: 'Insufficient balance' },
        { status: 400, headers: corsHeaders }
      );
    }

    try {
      // Create payout request record (will be processed by admin)
      const payoutRequest = await prisma.payoutRequest.create({
        data: {
          userId: payload.userId,
          amount,
          payoutMethod,
          accountDetails: JSON.stringify(accountDetails),
          status: 'pending', // Will be processed by admin
          createdAt: new Date(),
        },
      });

      // Mark earnings as withdrawn (placeholder for Razorpay integration)
      const earningsToDeduct = userEarnings
        .filter((earning: any) => earning.status === 'available')
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let remainingAmount = amount;
      for (const earning of earningsToDeduct) {
        if (remainingAmount <= 0) break;
        
        const deductAmount = Math.min(remainingAmount, earning.amount);
        await prisma.referralEarning.update({
          where: { id: earning.id },
          data: {
            amount: earning.amount - deductAmount,
            status: deductAmount === earning.amount ? 'withdrawn' : 'available',
          },
        });
        
        remainingAmount -= deductAmount;
      }

      return NextResponse.json(
        {
          message: 'Payout request submitted successfully',
          payoutRequest: {
            id: payoutRequest.id,
            amount,
            status: payoutRequest.status,
            payoutMethod,
            createdAt: payoutRequest.createdAt,
          },
        },
        { headers: corsHeaders }
      );

    } catch (error: any) {
      console.error('Payout processing error:', error);
      return NextResponse.json(
        { error: 'Payout processing failed', details: error.message },
        { status: 500, headers: corsHeaders }
      );
    }

  } catch (error) {
    console.error('Payout POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
