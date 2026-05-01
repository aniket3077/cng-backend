import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyJwt } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';

const subscriptionSchema = z.object({
  planId: z.enum(['basic', 'standard', 'premium', 'trial']),
});

const planDetails = {
  basic: { name: 'Basic', price: 999, duration: 30 },
  standard: { name: 'Standard', price: 2499, duration: 30 },
  premium: { name: 'Premium', price: 4999, duration: 30 },
  trial: { name: '7-Day Trial', price: 1, duration: 7 },
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// GET - Get owner's subscription status
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
    const payload = await verifyJwt(token);

    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const owner = await prisma.stationOwner.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        subscriptionType: true,
        subscriptionEndsAt: true,
      },
    });

    if (!owner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const isActive = owner.subscriptionEndsAt
      ? new Date(owner.subscriptionEndsAt) > new Date()
      : false;

    const isPendingApproval = !!owner.subscriptionType && !owner.subscriptionEndsAt;

    return NextResponse.json({
      subscription: {
        plan: owner.subscriptionType || 'none',
        isActive,
        isPendingApproval,
        expiresAt: owner.subscriptionEndsAt,
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Request new subscription
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyJwt(token);

    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await request.json();
    const validation = subscriptionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400, headers: corsHeaders }
      );
    }

    const { planId } = validation.data;
    const plan = planDetails[planId];

    const currentOwner = await prisma.stationOwner.findUnique({
      where: { id: payload.userId },
      select: {
        subscriptionType: true,
        subscriptionEndsAt: true,
      },
    });

    if (!currentOwner) {
      return NextResponse.json(
        { error: 'Owner not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    const hasActiveSubscription = !!currentOwner.subscriptionEndsAt && new Date(currentOwner.subscriptionEndsAt) > new Date();

    if (hasActiveSubscription) {
      return NextResponse.json(
        { error: 'You already have an active subscription' },
        { status: 400, headers: corsHeaders }
      );
    }

    const owner = await prisma.stationOwner.update({
      where: { id: payload.userId },
      data: {
        subscriptionType: planId,
        subscriptionEndsAt: null,
      },
    });

    await prisma.activityLog.create({
      data: {
        ownerId: payload.userId,
        action: 'subscription_requested',
        description: `Subscription request submitted for ${plan.name} plan`,
        metadata: JSON.stringify({ planId }),
      },
    });

    await prisma.notification.create({
      data: {
        ownerId: payload.userId,
        title: 'Subscription request sent',
        message: `Your ${plan.name} subscription request has been sent to the admin for approval.`,
        type: 'info',
        category: 'subscription',
      },
    });

    return NextResponse.json({
      message: 'Subscription request sent to admin for approval',
      subscription: {
        plan: planId,
        planName: plan.name,
        price: plan.price,
        expiresAt: owner.subscriptionEndsAt,
        isPendingApproval: true,
      }
    }, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to process subscription' },
      { status: 500, headers: corsHeaders }
    );
  }
}
