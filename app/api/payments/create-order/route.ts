import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_1234567890',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret_key',
});

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Subscription plan pricing configuration
const PLAN_CONFIG = {
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
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
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
        const { planId, amount } = body;

        if (!planId || amount === undefined) {
            return NextResponse.json(
                { error: 'Plan ID and amount are required' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Validate plan exists and price matches (security check)
        const plan = PLAN_CONFIG[planId as keyof typeof PLAN_CONFIG];
        if (!plan) {
            return NextResponse.json(
                { error: 'Invalid plan ID' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Verify amount matches server-side price (prevent price manipulation)
        const expectedPrice = plan.price;
        if (parseFloat(amount) !== expectedPrice) {
            return NextResponse.json(
                { error: 'Price mismatch. Please refresh and try again.' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Don't create order for free trial
        if (planId === 'free_trial') {
            return NextResponse.json(
                { error: 'Free trial does not require payment' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Amount in paise
        const options = {
            amount: Math.round(parseFloat(amount) * 100),
            currency: 'INR',
            receipt: `rcpt_${Date.now().toString().slice(-8)}`,
            notes: {
                userId,
                planId,
            }
        };

        const order = await razorpay.orders.create(options);

        if (!order) {
            return NextResponse.json(
                { error: 'Failed to create Razorpay order' },
                { status: 500, headers: corsHeaders }
            );
        }

        return NextResponse.json(
            {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            },
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error('Create order error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
