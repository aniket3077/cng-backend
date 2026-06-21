import { NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } from '@/lib/env';
import { getPlanConfig } from '@/lib/subscription';

const isRazorpayConfigured =
    RAZORPAY_KEY_ID &&
    RAZORPAY_KEY_SECRET &&
    RAZORPAY_KEY_ID !== 'REPLACE_WITH_NEW_KEY_ID' &&
    RAZORPAY_KEY_SECRET !== 'REPLACE_WITH_NEW_KEY_SECRET';

const razorpay = isRazorpayConfigured
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
    })
    : null;

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
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
        const { planId, amount } = body;

        if (!planId || amount === undefined) {
            return NextResponse.json(
                { error: 'Plan ID and amount are required' },
                { status: 400, headers: corsHeaders }
            );
        }

        // Validate plan exists and price matches (security check)
        const plan = getPlanConfig(planId);
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
                userId: payload.userId,
                planId: plan.id,
                planName: plan.name,
                commissionEligible: String(plan.commissionEligible),
            }
        };

        if (!razorpay) {
            if (process.env.NODE_ENV === 'development') {
                return NextResponse.json(
                    {
                        success: true,
                        orderId: `order_dev_sim_${Date.now()}`,
                        amount: Math.round(parseFloat(amount) * 100),
                        currency: 'INR',
                        keyId: 'rzp_test_dev_simulated',
                        plan: {
                            id: plan.id,
                            name: plan.name,
                            price: plan.price,
                            cashbackHighlight: plan.cashbackHighlight,
                        },
                    },
                    { status: 200, headers: corsHeaders }
                );
            }
            throw new Error('Razorpay credentials not configured');
        }

        const order = await razorpay.orders.create(options);

        if (!order) {
            return NextResponse.json(
                { error: 'Failed to create Razorpay order' },
                { status: 500, headers: corsHeaders }
            );
        }

        return NextResponse.json(
            {
                success: true,
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: RAZORPAY_KEY_ID,
                plan: {
                    id: plan.id,
                    name: plan.name,
                    price: plan.price,
                    cashbackHighlight: plan.cashbackHighlight,
                },
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
