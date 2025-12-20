import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { activateSubscription } from '@/lib/subscription-activation';
import crypto from 'crypto';

/**
 * Razorpay Webhook Handler
 * Handles payment events from Razorpay to automatically activate subscriptions
 * 
 * Webhook URL: https://your-domain.com/api/webhooks/razorpay
 * Events to subscribe: payment.authorized, payment.captured
 * 
 * Configure this webhook in your Razorpay dashboard:
 * 1. Go to Settings > Webhooks
 * 2. Create new webhook with the above URL
 * 3. Select events: payment.authorized, payment.captured
 * 4. Copy the webhook secret and add to .env as RAZORPAY_WEBHOOK_SECRET
 */

export async function POST(request: NextRequest) {
  try {
    // Get webhook signature from headers
    const webhookSignature = request.headers.get('x-razorpay-signature');
    
    if (!webhookSignature) {
      console.error('Missing Razorpay webhook signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // Get webhook secret from environment
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await request.text();
    
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== webhookSignature) {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    // Log webhook event
    console.log('Razorpay webhook received:', {
      event,
      orderId: paymentEntity?.order_id,
      paymentId: paymentEntity?.id,
      status: paymentEntity?.status,
    });

    // Handle payment.captured event (payment successful)
    if (event === 'payment.captured' && paymentEntity) {
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      // Find payment record
      const paymentRecord = await prisma.paymentHistory.findUnique({
        where: { razorpayOrderId },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!paymentRecord) {
        console.error('Payment record not found:', razorpayOrderId);
        // Return 200 to prevent Razorpay from retrying
        return NextResponse.json({
          received: true,
          error: 'Payment record not found',
        });
      }

      // Check if payment already processed
      if (paymentRecord.status === 'success') {
        console.log('Payment already processed:', razorpayOrderId);
        return NextResponse.json({
          received: true,
          message: 'Payment already processed',
        });
      }

      // Activate subscription
      const result = await activateSubscription(
        paymentRecord.ownerId,
        paymentRecord.planId as 'basic' | 'standard' | 'premium',
        razorpayOrderId,
        razorpayPaymentId
      );

      if (!result.success) {
        console.error('Failed to activate subscription:', result.error);
        // Still return 200 to prevent retries, but log the error
        return NextResponse.json({
          received: true,
          error: result.error,
        });
      }

      console.log('Subscription activated successfully:', {
        ownerId: paymentRecord.ownerId,
        ownerEmail: paymentRecord.owner.email,
        planId: paymentRecord.planId,
        orderId: razorpayOrderId,
      });

      return NextResponse.json({
        received: true,
        message: 'Subscription activated',
        owner: result.owner,
      });
    }

    // Handle payment.authorized event (for debugging)
    if (event === 'payment.authorized') {
      console.log('Payment authorized (waiting for capture):', paymentEntity?.id);
      return NextResponse.json({
        received: true,
        message: 'Payment authorized',
      });
    }

    // Handle payment.failed event
    if (event === 'payment.failed' && paymentEntity) {
      const razorpayOrderId = paymentEntity.order_id;
      
      // Update payment status to failed
      await prisma.paymentHistory.updateMany({
        where: { 
          razorpayOrderId,
          status: 'pending',
        },
        data: {
          status: 'failed',
          razorpayPaymentId: paymentEntity.id,
        },
      });

      console.log('Payment failed:', razorpayOrderId);
      
      return NextResponse.json({
        received: true,
        message: 'Payment failed',
      });
    }

    // Acknowledge other events
    return NextResponse.json({
      received: true,
      message: `Event ${event} acknowledged`,
    });

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // Return 200 to prevent Razorpay from retrying on our errors
    return NextResponse.json({
      received: true,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 200 });
  }
}
