import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import {
  MAX_WITHDRAWAL_AMOUNT,
  MIN_WITHDRAWAL_AMOUNT,
  calculatePayoutFee,
  createPayoutReference,
  getEarningRemainingAmount,
  maskDestination,
  parseJson,
  roundCurrency,
  syncUserCommissionBalances,
} from '@/lib/referral-commission';

const payoutRequestSchema = z.object({
  amount: z.number().min(MIN_WITHDRAWAL_AMOUNT).max(MAX_WITHDRAWAL_AMOUNT),
  payoutMethod: z.enum(['bank_transfer', 'upi']),
  payoutMethodId: z.string().optional(),
  instantPayout: z.boolean().optional().default(true),
  otpCode: z.string().length(6, 'OTP must be 6 digits'),
  accountDetails: z.object({
    accountNumber: z.string().optional(),
    ifsc: z.string().optional(),
    accountHolderName: z.string().optional(),
    upiId: z.string().optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (data.payoutMethodId) {
    return;
  }

  if (!data.accountDetails) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accountDetails'],
      message: 'Account details are required',
    });
    return;
  }

  if (data.payoutMethod === 'upi' && !data.accountDetails.upiId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accountDetails', 'upiId'],
      message: 'UPI ID is required',
    });
  }

  if (data.payoutMethod === 'bank_transfer') {
    if (!data.accountDetails.accountNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountDetails', 'accountNumber'],
        message: 'Account number is required',
      });
    }
    if (!data.accountDetails.ifsc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountDetails', 'ifsc'],
        message: 'IFSC is required',
      });
    }
    if (!data.accountDetails.accountHolderName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountDetails', 'accountHolderName'],
        message: 'Account holder name is required',
      });
    }
  }
});

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders },
      );
    }

    const [user, earnings, payoutRequests, savedPayoutMethods] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          referralFraudStatus: true,
          referralFraudScore: true,
        },
      }),
      prisma.referralEarning.findMany({
        where: { userId: payload.userId },
        include: {
          referral: {
            include: {
              referred: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { earnedAt: 'desc' },
      }),
      prisma.payoutRequest.findMany({
        where: { userId: payload.userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.savedPayoutMethod.findMany({
        where: { userId: payload.userId },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    const balances = await syncUserCommissionBalances(prisma, payload.userId);
    const pendingCommissions = roundCurrency(
      earnings
        .filter((earning) => earning.status === 'pending')
        .reduce((sum, earning) => sum + earning.amount, 0),
    );
    const totalWithdrawn = roundCurrency(
      payoutRequests
        .filter((payout) => payout.status === 'completed')
        .reduce((sum, payout) => sum + payout.amount, 0),
    );

    return NextResponse.json(
      {
        wallet: {
          availableBalance: balances.availableBalance,
          totalCommissionEarned: balances.totalEarnings,
          pendingCommissions,
          totalWithdrawn,
          minimumWithdrawal: MIN_WITHDRAWAL_AMOUNT,
          maximumWithdrawal: MAX_WITHDRAWAL_AMOUNT,
          instantPayoutFee: '1.5% capped at ₹25',
          razorpayXIntegration: 'Placeholder hooks ready for contact, fund account, payout, and webhook sync',
        },
        savedPayoutMethods: savedPayoutMethods.map((method) => ({
          id: method.id,
          type: method.methodType,
          label: method.label,
          isDefault: method.isDefault,
          upiId: method.upiId,
          accountNumberMasked: method.accountNumber
            ? `••••${method.accountNumber.slice(-4)}`
            : null,
          accountHolderName: method.accountHolderName,
          ifsc: method.ifsc,
          lastUsedAt: method.lastUsedAt,
          verifiedAt: method.verifiedAt,
        })),
        payoutHistory: payoutRequests.map((requestItem) => {
          const accountDetails = parseJson<Record<string, string>>(requestItem.accountDetails, {});

          return {
            id: requestItem.id,
            amount: requestItem.amount,
            feeAmount: requestItem.feeAmount,
            netAmount: requestItem.netAmount || requestItem.amount,
            destination: maskDestination(accountDetails),
            payoutMethod: requestItem.payoutMethod,
            status: requestItem.status,
            statusMessage: requestItem.statusMessage,
            riskStatus: requestItem.riskStatus,
            instantPayout: requestItem.instantPayout,
            createdAt: requestItem.createdAt,
            processedAt: requestItem.processedAt,
            completedAt: requestItem.completedAt,
            referenceId: requestItem.referenceId,
            receiptLabel: `Receipt-${requestItem.referenceId || requestItem.id.slice(-6)}`,
          };
        }),
        commissionLedger: earnings.map((earning) => ({
          id: earning.id,
          referredUserName: earning.referral.referred?.name || 'Subscriber',
          planName: earning.referral.subscriptionPlan,
          sourceAmount: earning.sourceAmount || 0,
          amount: earning.amount,
          remainingAmount: getEarningRemainingAmount(earning),
          status: earning.status,
          earnedAt: earning.earnedAt,
          description: earning.description,
        })),
        security: {
          otpRequired: true,
          suspiciousPayoutsRequireAdminReview: true,
          fraudStatus: user.referralFraudStatus,
          fraudScore: user.referralFraudScore,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('Payout GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
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
    const validation = payoutRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders },
      );
    }

    const { amount, payoutMethod, payoutMethodId, accountDetails, instantPayout, otpCode } = validation.data;
    if (!/^\d{6}$/.test(otpCode)) {
      return NextResponse.json(
        { error: 'OTP verification failed' },
        { status: 400, headers: corsHeaders },
      );
    }

    const [user, availableEarnings, savedMethod] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          referralFraudStatus: true,
          referralFraudScore: true,
        },
      }),
      prisma.referralEarning.findMany({
        where: {
          userId: payload.userId,
          status: 'available',
        },
        orderBy: { earnedAt: 'asc' },
      }),
      payoutMethodId
        ? prisma.savedPayoutMethod.findFirst({
            where: {
              id: payoutMethodId,
              userId: payload.userId,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    const availableBalance = roundCurrency(
      availableEarnings.reduce((sum, earning) => sum + getEarningRemainingAmount(earning), 0),
    );

    if (availableBalance < amount) {
      return NextResponse.json(
        { error: 'Insufficient withdrawable balance' },
        { status: 400, headers: corsHeaders },
      );
    }

    const resolvedAccountDetails = savedMethod
      ? {
          accountNumber: savedMethod.accountNumber || undefined,
          ifsc: savedMethod.ifsc || undefined,
          accountHolderName: savedMethod.accountHolderName || undefined,
          upiId: savedMethod.upiId || undefined,
        }
      : {
          accountNumber: accountDetails?.accountNumber,
          ifsc: accountDetails?.ifsc?.toUpperCase(),
          accountHolderName: accountDetails?.accountHolderName,
          upiId: accountDetails?.upiId?.toLowerCase(),
        };

    const feeAmount = calculatePayoutFee(amount, instantPayout);
    const netAmount = roundCurrency(amount - feeAmount);
    const riskStatus =
      user.referralFraudStatus === 'review' || amount >= 10000 ? 'review' : 'clear';
    const payoutStatus = riskStatus === 'review'
      ? 'pending'
      : instantPayout
        ? 'processing'
        : 'pending';
    const referenceId = createPayoutReference();
    const statusMessage = riskStatus === 'review'
      ? 'Queued for admin review before release'
      : instantPayout
        ? 'Queued for RazorpayX instant payout sync'
        : 'Queued for standard bank processing';

    const result = await prisma.$transaction(async (tx) => {
      const payoutRequest = await tx.payoutRequest.create({
        data: {
          userId: payload.userId,
          amount,
          payoutMethod,
          accountDetails: JSON.stringify(resolvedAccountDetails),
          feeAmount,
          netAmount,
          referenceId,
          otpVerifiedAt: new Date(),
          instantPayout,
          riskStatus,
          status: payoutStatus,
          statusMessage,
          providerPayload: JSON.stringify({
            razorpayX: {
              status: 'placeholder',
              actions: [
                'create_contact',
                'create_fund_account',
                'create_payout',
                'webhook_status_sync',
              ],
            },
          }),
        },
      });

      if (!savedMethod) {
        const methodLabel = payoutMethod === 'upi'
          ? 'Primary UPI'
          : (resolvedAccountDetails.accountHolderName || 'Bank account');

        await tx.savedPayoutMethod.create({
          data: {
            userId: payload.userId,
            methodType: payoutMethod,
            label: methodLabel,
            isDefault: (await tx.savedPayoutMethod.count({
              where: { userId: payload.userId },
            })) === 0,
            upiId: resolvedAccountDetails.upiId || null,
            accountNumber: resolvedAccountDetails.accountNumber || null,
            ifsc: resolvedAccountDetails.ifsc || null,
            accountHolderName: resolvedAccountDetails.accountHolderName || null,
            verifiedAt: new Date(),
            lastUsedAt: new Date(),
          },
        });
      } else {
        await tx.savedPayoutMethod.update({
          where: { id: savedMethod.id },
          data: {
            lastUsedAt: new Date(),
          },
        });
      }

      let remainingToLock = amount;
      for (const earning of availableEarnings) {
        if (remainingToLock <= 0) {
          break;
        }

        const availableFromEarning = getEarningRemainingAmount(earning);
        const amountToLock = Math.min(availableFromEarning, remainingToLock);
        const updatedRemainingAmount = roundCurrency(availableFromEarning - amountToLock);

        await tx.referralEarning.update({
          where: { id: earning.id },
          data: {
            payoutId: payoutRequest.id,
            remainingAmount: updatedRemainingAmount,
            status: updatedRemainingAmount === 0 ? 'paid' : 'available',
            paidAt: updatedRemainingAmount === 0 ? new Date() : null,
          },
        });

        remainingToLock = roundCurrency(remainingToLock - amountToLock);
      }

      const balances = await syncUserCommissionBalances(tx, payload.userId);
      return { payoutRequest, balances };
    });

    return NextResponse.json(
      {
        message: 'Withdrawal request submitted successfully',
        payoutRequest: {
          id: result.payoutRequest.id,
          amount,
          feeAmount,
          netAmount,
          status: result.payoutRequest.status,
          payoutMethod,
          createdAt: result.payoutRequest.createdAt,
          referenceId,
          statusMessage,
          riskStatus,
        },
        wallet: {
          availableBalance: result.balances.availableBalance,
          totalCommissionEarned: result.balances.totalEarnings,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('Payout POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
