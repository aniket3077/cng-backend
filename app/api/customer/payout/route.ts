import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        earnings: {
          orderBy: { earnedAt: 'desc' },
        },
        payoutRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const availableBalance = user.earnings
      .filter(e => e.status === 'available')
      .reduce((sum, e) => sum + e.amount, 0);

    const pendingEarnings = user.earnings
      .filter(e => e.status === 'pending')
      .reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json(
      {
        availableBalance,
        totalEarnings: user.totalEarnings,
        pendingEarnings,
        earnings: user.earnings,
        payoutRequests: user.payoutRequests,
      },
      { headers: corsHeaders }
    );
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

    // Check user's available balance
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        earnings: {
          where: { status: 'available' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const availableBalance = user.earnings.reduce((sum, e) => sum + e.amount, 0);

    if (availableBalance < amount) {
      return NextResponse.json(
        { error: 'Insufficient balance', availableBalance },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check for pending payout requests
    const existingPendingRequest = await prisma.payoutRequest.findFirst({
      where: {
        userId: payload.userId,
        status: 'pending',
      },
    });

    if (existingPendingRequest) {
      return NextResponse.json(
        { error: 'You already have a pending payout request' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create payout request
    const payoutRequest = await prisma.payoutRequest.create({
      data: {
        userId: payload.userId,
        amount,
        payoutMethod,
        accountDetails: JSON.stringify(accountDetails),
        status: 'processing',
      },
    });

    // Mark earnings as paid
    let remainingAmount = amount;
    const earningsToMarkPaid = [];

    for (const earning of user.earnings) {
      if (remainingAmount <= 0) break;
      
      const earningAmount = Math.min(earning.amount, remainingAmount);
      earningsToMarkPaid.push({
        id: earning.id,
        amount: earningAmount,
      });
      remainingAmount -= earningAmount;
    }

    await prisma.referralEarning.updateMany({
      where: {
        id: { in: earningsToMarkPaid.map(e => e.id) },
      },
      data: {
        status: 'paid',
        paidAt: new Date(),
        payoutId: payoutRequest.id,
      },
    });

    try {
      // Process Razorpay payout
      const payoutData = {
        account_number: accountDetails.accountNumber,
        fund_account: {
          account_type: payoutMethod === 'upi' ? 'vpa' : 'bank_account',
          bank_account: {
            name: accountDetails.accountHolderName,
            account_number: accountDetails.accountNumber,
            ifsc: accountDetails.ifsc,
          },
          vpa: {
            address: accountDetails.upiId,
          },
        },
        amount: amount * 100, // Convert to paise
        currency: 'INR',
        mode: payoutMethod === 'upi' ? 'UPI' : 'IMPS',
        purpose: 'referral_payout',
        queue_if_low_balance: true,
      };

      const razorpayPayout = await razorpay.payouts.create(payoutData);

      // Update payout request with Razorpay details
      await prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          razorpayPayoutId: razorpayPayout.id,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      return NextResponse.json(
        {
          message: 'Payout processed successfully',
          payoutRequest: {
            ...payoutRequest,
            razorpayPayoutId: razorpayPayout.id,
            status: 'completed',
          },
        },
        { headers: corsHeaders }
      );

    } catch (razorpayError: any) {
      console.error('Razorpay payout error:', razorpayError);

      // Update payout request with failure details
      await prisma.payoutRequest.update({
        where: { id: payoutRequest.id },
        data: {
          status: 'failed',
          razorpayFailureReason: razorpayError.error?.description || 'Unknown error',
        },
      });

      // Restore earnings to available status
      await prisma.referralEarning.updateMany({
        where: {
          payoutId: payoutRequest.id,
        },
        data: {
          status: 'available',
          paidAt: null,
          payoutId: null,
        },
      });

      return NextResponse.json(
        {
          error: 'Payout processing failed',
          details: razorpayError.error?.description || 'Unknown error',
          payoutRequest: {
            ...payoutRequest,
            status: 'failed',
            razorpayFailureReason: razorpayError.error?.description || 'Unknown error',
          },
        },
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
