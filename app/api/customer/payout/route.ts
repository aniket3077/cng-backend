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

    // For now, return mock data since Prisma models aren't properly generated
    const mockData = {
      availableBalance: 0,
      totalEarnings: 0,
      pendingEarnings: 0,
      earnings: [],
      payoutRequests: [],
    };

    return NextResponse.json(mockData, { headers: corsHeaders });
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

    // For now, just return a success message without actual payout processing
    // This will be implemented once the database models are properly set up
    return NextResponse.json(
      {
        message: 'Payout request submitted successfully',
        payoutRequest: {
          id: 'mock-' + Date.now(),
          amount,
          status: 'pending',
          payoutMethod,
          createdAt: new Date().toISOString(),
        },
      },
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error('Payout POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
