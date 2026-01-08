import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Subscription plan pricing configuration
export const PLAN_CONFIG = {
    free_trial: { price: 0, duration: 15, name: 'Free Trial' },
    '1_month': { price: 15, duration: 30, name: '1 Month' },
    '6_month': { price: 79, duration: 180, name: '6 Months' },
    '1_year': { price: 150, duration: 365, name: '1 Year' },
} as const;

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

function verifyUserToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        // Allow distinct roles if necessary, but essentially check ID
        if (!decoded.userId) return null;
        return decoded.userId;
    } catch (error) {
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const userId = verifyUserToken(request);
        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: corsHeaders }
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
        if (!PLAN_CONFIG[planType as keyof typeof PLAN_CONFIG]) {
            return NextResponse.json(
                { error: 'Invalid plan type' },
                { status: 400, headers: corsHeaders }
            );
        }

        const plan = PLAN_CONFIG[planType as keyof typeof PLAN_CONFIG];
        const durationDays = plan.duration;

        // Calculate expire date
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + durationDays);

        // For free trial with auto-pay, set auto-renew to 1_month plan
        const autoRenewPlan = planType === 'free_trial' && autoPay ? '1_month' : (autoPay ? planType : null);

        // Update user subscription
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                subscriptionType: planType,
                subscriptionEndsAt: endDate,
                autoRenewPlan: autoRenewPlan,
            },
        });

        // Log activity (optional, if you track sales)
        // await prisma.paymentHistory.create({...})

        return NextResponse.json(
            {
                message: 'Subscription activated successfully',
                subscription: {
                    type: planType,
                    expiresAt: endDate,
                    autoRenewPlan: autoRenewPlan,
                }
            },
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error('Subscription error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
