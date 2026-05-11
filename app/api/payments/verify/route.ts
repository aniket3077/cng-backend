import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { getPlanConfig } from '@/lib/subscription';
import {
  REFERRAL_COMMISSION_RATE,
  calculateCommission,
  syncUserCommissionBalances,
} from '@/lib/referral-commission';

const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'your_razorpay_secret_key';

const verificationSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  planType: z.string().min(1),
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request);
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders },
      );
    }

    const body = await request.json();
    const validation = verificationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders },
      );
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType } = validation.data;
    const plan = getPlanConfig(planType);

    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan type' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (!plan.commissionEligible) {
      return NextResponse.json(
        { error: 'Free trial does not generate a paid subscription commission' },
        { status: 400, headers: corsHeaders },
      );
    }

    const generatedSignature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const isSimulatedPayment =
      process.env.NODE_ENV !== 'production' &&
      razorpay_payment_id.startsWith('pay_simulated_') &&
      razorpay_signature === 'sim_sig';

    if (!isSimulatedPayment && generatedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Invalid payment signature' },
        { status: 400, headers: corsHeaders },
      );
    }

    const subscriptionEndDate = new Date();
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + plan.duration);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          name: true,
          subscriptionType: true,
          referredBy: true,
          referralFraudStatus: true,
        },
      });

      if (!user) {
        throw new Error('User not found');
      }

      const referral = await tx.referral.findFirst({
        where: { referredId: payload.userId },
        include: {
          referrer: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      const alreadyPaidSubscriber =
        Boolean(user.subscriptionType) && user.subscriptionType !== 'free_trial';
      const hasCommissionAlreadyCredited = referral
        ? Boolean(
            await tx.referralEarning.findFirst({
              where: { referralId: referral.id },
              select: { id: true },
            }),
          )
        : false;

      await tx.user.update({
        where: { id: payload.userId },
        data: {
          subscriptionType: plan.id,
          subscriptionEndsAt: subscriptionEndDate,
        },
      });

      let commission:
        | {
            amount: number;
            status: 'available' | 'pending' | 'blocked';
            referrerName: string;
            payoutReady: boolean;
            reason: string;
          }
        | null = null;

      if (referral) {
        const blockedReason = !referral.eligibleForCommission
          ? referral.ineligibleReason || 'Referral is not eligible for commission'
          : alreadyPaidSubscriber
            ? 'Commission is paid only on the first successful paid subscription'
            : hasCommissionAlreadyCredited
              ? 'First subscription commission already processed'
              : null;

        if (blockedReason) {
          await tx.referral.update({
            where: { id: referral.id },
            data: {
              paymentStatus: 'paid',
              subscriptionPlan: plan.id,
              subscriptionAmount: plan.price,
              commissionEarned: 0,
              rewardAmount: 0,
              conversionAt: now,
              completedAt: now,
              status: referral.eligibleForCommission ? referral.status : 'expired',
              eligibleForCommission: false,
              ineligibleReason: referral.ineligibleReason || blockedReason,
            },
          });

          commission = {
            amount: 0,
            status: 'blocked',
            referrerName: referral.referrer.name,
            payoutReady: false,
            reason: blockedReason,
          };
        } else {
          const commissionAmount = calculateCommission(plan.price);
          const commissionStatus =
            referral.suspicious || user.referralFraudStatus === 'review'
              ? 'pending'
              : 'available';

          await tx.referralEarning.create({
            data: {
              userId: referral.referrerId,
              referralId: referral.id,
              amount: commissionAmount,
              remainingAmount: commissionAmount,
              sourceAmount: plan.price,
              commissionRate: referral.commissionRate || REFERRAL_COMMISSION_RATE,
              type: 'subscription_commission',
              status: commissionStatus,
              description: `${plan.name} referral commission from ${user.name}`,
              metadata: JSON.stringify({
                planId: plan.id,
                planName: plan.name,
                sourceAmount: plan.price,
                referredUserId: payload.userId,
                paidAt: now.toISOString(),
                verification: isSimulatedPayment ? 'simulated' : 'razorpay_signature',
              }),
              earnedAt: now,
              availableAt: commissionStatus === 'available' ? now : null,
            },
          });

          await tx.referral.update({
            where: { id: referral.id },
            data: {
              status: 'completed',
              paymentStatus: 'paid',
              rewardAmount: commissionAmount,
              commissionEarned: commissionAmount,
              subscriptionAmount: plan.price,
              subscriptionPlan: plan.id,
              conversionAt: now,
              completedAt: now,
            },
          });

          const balanceSync = await syncUserCommissionBalances(tx, referral.referrerId);

          commission = {
            amount: commissionAmount,
            status: commissionStatus,
            referrerName: referral.referrer.name,
            payoutReady: commissionStatus === 'available',
            reason:
              commissionStatus === 'pending'
                ? 'Commission is awaiting fraud review before becoming withdrawable'
                : `Commission credited to ${referral.referrer.name}'s wallet`,
          };

          return {
            commission,
            walletBalance: balanceSync.availableBalance,
          };
        }
      }

      return {
        commission,
        walletBalance: null,
      };
    });

    return NextResponse.json(
      {
        message: 'Payment verified and subscription activated',
        subscription: {
          type: plan.id,
          name: plan.name,
          amount: plan.price,
          expiresAt: subscriptionEndDate,
        },
        commission: result.commission,
        referrerWalletBalance: result.walletBalance,
      },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Verify payment error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
