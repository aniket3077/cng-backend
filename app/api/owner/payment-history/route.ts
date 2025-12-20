import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get owner's payment history
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

    // Get payment history for the owner
    const payments = await prisma.paymentHistory.findMany({
      where: { ownerId: payload.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        razorpayOrderId: true,
        razorpayPaymentId: true,
        planId: true,
        planName: true,
        amount: true,
        currency: true,
        status: true,
        subscriptionStartsAt: true,
        subscriptionEndsAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      payments,
      total: payments.length,
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get payment history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payment history' },
      { status: 500, headers: corsHeaders }
    );
  }
}
