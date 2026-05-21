import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPlanConfig, getPublicSubscriptionPlans, normalizePlanType } from '@/lib/subscription';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

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
            select: {
                id: true,
                subscriptionType: true,
                subscriptionEndsAt: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const now = new Date();
        const expiresAt = user.subscriptionEndsAt;
        const isActive = Boolean(
            user.subscriptionType &&
            expiresAt &&
            new Date(expiresAt) > now
        );

        const millisecondsRemaining = expiresAt
            ? new Date(expiresAt).getTime() - now.getTime()
            : 0;
        const daysRemaining = isActive
            ? Math.max(0, Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24)))
            : 0;

        return NextResponse.json(
            {
                subscription: {
                    plan: user.subscriptionType || 'none',
                    isActive,
                    expiresAt,
                    daysRemaining,
                },
            },
            { status: 200, headers: corsHeaders }
        );
    } catch (error) {
        console.error('Get customer subscription error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}

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
        const { planType, autoPay } = body;

        if (!planType) {
            return NextResponse.json(
                { error: 'Plan type is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Validate plan type
        const normalizedPlan = normalizePlanType(planType);
        const plan = normalizedPlan ? getPlanConfig(normalizedPlan) : null;
        if (!plan) {
            return NextResponse.json(
                { error: 'Invalid plan type' },
                { status: 400, headers: corsHeaders }
            );
        }

        if (plan.id !== 'free_trial') {
            return NextResponse.json(
                { error: 'Paid subscriptions must be activated through verified payment only' },
                { status: 403, headers: corsHeaders }
            );
        }

        // Calculate expire date
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + plan.duration);

        // For free trial with auto-pay, set auto-renew to 1_month plan
        const autoRenewPlan = plan.id === 'free_trial' && autoPay
          ? 'monthly'
          : (autoPay ? plan.id : null);

        // Update user subscription
        // NOTE: autoRenewPlan field requires migration - run: npx prisma migrate deploy
        const updatedUser = await prisma.user.update({
            where: { id: payload.userId },
            data: {
                subscriptionType: plan.id,
                subscriptionEndsAt: endDate,
                // autoRenewPlan: autoRenewPlan, // Uncomment after migration is applied
            },
        });

        // Log activity (optional, if you track sales)
        // await prisma.paymentHistory.create({...})

        return NextResponse.json(
            {
                message: 'Subscription activated successfully',
                subscription: {
                    type: plan.id,
                    planName: plan.name,
                    expiresAt: endDate,
                    autoRenewPlan: autoRenewPlan,
                },
                referralCommissionPolicy: {
                    commissionRate: '20%',
                    trigger: 'First paid subscription only',
                    eligible: plan.commissionEligible,
                },
                availablePlans: getPublicSubscriptionPlans(),
            },
            { status: 200, headers: corsHeaders }
        );

    } catch (_error) {
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
