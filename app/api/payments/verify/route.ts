import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret_key';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType } = body;

        const generated_signature = crypto
            .createHmac('sha256', RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generated_signature !== razorpay_signature) {
            return NextResponse.json(
                { error: 'Invalid payment signature' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Payment verified, update subscription
        let durationDays = 30; // Default 1 month
        if (planType === '1_month') durationDays = 30;
        else if (planType === '6_month') durationDays = 180;
        else if (planType === '1_year') durationDays = 365;

        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + durationDays);

        await prisma.user.update({
            where: { id: userId },
            data: {
                subscriptionType: planType,
                subscriptionEndsAt: endDate,
            },
        });

        // Optional: Save transaction record
        // await prisma.payment.create({...})

        return NextResponse.json(
            { message: 'Payment verified and subscription activated' },
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error('Verify payment error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
