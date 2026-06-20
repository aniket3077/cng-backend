import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import { createIdempotencyReference, verifySignedRequest } from '@/lib/request-security';
import {
  MAX_WITHDRAWAL_AMOUNT,
  MIN_WITHDRAWAL_AMOUNT,
  roundCurrency,
  syncUserCommissionBalances,
} from '@/lib/referral-commission';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { verifyPayoutOtp } from '@/lib/payout-otp';
import { sendWithdrawalSubmittedEmail } from '@/lib/email';

const payoutRequestSchema = z.object({
  amount: z.number().min(MIN_WITHDRAWAL_AMOUNT).max(MAX_WITHDRAWAL_AMOUNT),
  payoutMethod: z.enum(['bank_transfer', 'upi']),
  payoutMethodId: z.string().optional(),
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

    const [user, earnings, savedPayoutMethods] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          referralFraudStatus: true,
          referralFraudScore: true,
          availableBalance: true,
          pendingWithdrawals: true,
          totalEarnings: true,
          withdrawals: {
            orderBy: { requestedAt: 'desc' },
          },
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
    const pendingCommissions = balances.pendingWithdrawals; // Set pendingCommissions = pendingWithdrawals for mobile backwards compatibility
    const totalWithdrawn = roundCurrency(
      user.withdrawals
        .filter((w) => w.status === 'paid')
        .reduce((sum, w) => sum + w.amount, 0),
    );

    return NextResponse.json(
      {
        wallet: {
          availableBalance: balances.availableBalance,
          pendingWithdrawals: balances.pendingWithdrawals,
          totalCommissionEarned: balances.totalEarnings,
          pendingCommissions,
          totalWithdrawn,
          minimumWithdrawal: MIN_WITHDRAWAL_AMOUNT,
          maximumWithdrawal: MAX_WITHDRAWAL_AMOUNT,
          instantPayoutFee: 'Free (Manual Processing)',
          razorpayXIntegration: 'Manually reviewed and processed within 24 hours',
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
        payoutHistory: user.withdrawals.map((w) => {
          const destination = w.paymentMethod === 'upi'
            ? w.upiId || 'Unknown UPI'
            : w.accountNumber ? `••••${w.accountNumber.slice(-4)}` : 'Bank Details';
          
          return {
            id: w.id,
            amount: w.amount,
            feeAmount: 0,
            netAmount: w.amount,
            destination,
            payoutMethod: w.paymentMethod,
            status: w.status,
            statusMessage: w.adminRemarks || (
              w.status === 'pending' ? 'Pending admin review' :
              w.status === 'processing' ? 'Approved & Processing' :
              w.status === 'paid' ? 'Completed' : 'Rejected'
            ),
            riskStatus: 'clear',
            instantPayout: false,
            createdAt: w.createdAt,
            processedAt: w.approvedAt,
            completedAt: w.paidAt,
            referenceId: w.id,
            receiptLabel: `Receipt-${w.id.slice(-6)}`,
            payoutDeadline: w.payoutDeadline,
            adminRemarks: w.adminRemarks,
          };
        }),
        commissionLedger: earnings.map((earning) => ({
          id: earning.id,
          referredUserName: earning.referral.referred?.name || 'Subscriber',
          planName: earning.referral.subscriptionPlan,
          sourceAmount: earning.sourceAmount || 0,
          amount: earning.amount,
          remainingAmount: earning.amount,
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
  } catch (_error) {
    return NextResponse.json(
      { error: 'Internal server error' },
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

    const rateLimitResponse = await rateLimit(request, rateLimitConfigs.expensive, {
      headers: corsHeaders,
      identifier: `payout:${payload.userId}`,
      errorMessage: 'Please wait before submitting another payout request.',
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const validation = payoutRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders },
      );
    }

    const signedRequest = verifySignedRequest(request, validation.data);
    if (!signedRequest.valid || !signedRequest.idempotencyKey) {
      return NextResponse.json(
        { error: 'Payout verification failed' },
        { status: 401, headers: corsHeaders },
      );
    }

    const { amount, payoutMethod, payoutMethodId, accountDetails, otpCode } = validation.data;
    
    // REQUIRE OTP Verification
    const otpValid = await verifyPayoutOtp(payload.userId, otpCode);
    if (!otpValid) {
      return NextResponse.json(
        { error: 'Invalid or expired OTP' },
        { status: 400, headers: corsHeaders },
      );
    }

    const referenceId = createIdempotencyReference('PAYOUT', signedRequest.idempotencyKey);
    
    // Prevent duplicate request by checking existing withdrawal with same referenceId / idempotency key
    const existingWithdrawal = await prisma.withdrawal.findFirst({
      where: {
        userId: payload.userId,
        id: referenceId, // We can use the reference ID as the transaction ID or search for it
      },
    });

    if (existingWithdrawal) {
      return NextResponse.json(
        {
          message: 'Withdrawal request submitted successfully',
          payoutRequest: {
            id: existingWithdrawal.id,
            amount: existingWithdrawal.amount,
            feeAmount: 0,
            netAmount: existingWithdrawal.amount,
            status: existingWithdrawal.status,
            payoutMethod: existingWithdrawal.paymentMethod,
            createdAt: existingWithdrawal.createdAt,
            referenceId: existingWithdrawal.id,
            statusMessage: 'Withdrawal request submitted successfully',
            riskStatus: 'clear',
          },
        },
        { headers: corsHeaders },
      );
    }

    const [user, savedMethod] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          name: true,
          availableBalance: true,
          referralFraudStatus: true,
          referralFraudScore: true,
        },
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

    if (user.availableBalance < amount) {
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

    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24-hour payout deadline

    const result = await prisma.$transaction(async (tx) => {
      // Deduct from user's available balance and add to pending balance
      await tx.user.update({
        where: { id: payload.userId },
        data: {
          availableBalance: { decrement: amount },
          pendingWithdrawals: { increment: amount },
        },
      });

      // Create withdrawal request
      const withdrawal = await tx.withdrawal.create({
        data: {
          id: referenceId, // Seed from idempotency reference ID to prevent duplicates
          userId: payload.userId,
          amount,
          paymentMethod: payoutMethod,
          upiId: resolvedAccountDetails.upiId || null,
          bankName: payoutMethod === 'bank_transfer' ? (resolvedAccountDetails.ifsc ? 'Bank Account' : null) : null,
          accountNumber: resolvedAccountDetails.accountNumber || null,
          ifscCode: resolvedAccountDetails.ifsc || null,
          status: 'pending',
          payoutDeadline: deadline,
        },
      });

      // Save payment method if not already saved
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

      const balances = await syncUserCommissionBalances(tx, payload.userId);
      return { withdrawal, balances };
    });

    // Send email notification for withdrawal submitted
    try {
      await sendWithdrawalSubmittedEmail(
        user.email,
        user.name || 'Customer',
        amount,
        payoutMethod,
        result.withdrawal.payoutDeadline
      );
    } catch (err) {
      console.error('Failed to send withdrawal submitted email:', err);
    }

    return NextResponse.json(
      {
        message: 'Withdrawal request submitted successfully',
        payoutRequest: {
          id: result.withdrawal.id,
          amount,
          feeAmount: 0,
          netAmount: amount,
          status: result.withdrawal.status,
          payoutMethod,
          createdAt: result.withdrawal.createdAt,
          referenceId: result.withdrawal.id,
          statusMessage: 'Withdrawals are manually reviewed and processed within 24 hours.',
          riskStatus: 'clear',
        },
        wallet: {
          availableBalance: result.balances.availableBalance,
          pendingWithdrawals: result.balances.pendingWithdrawals,
          totalCommissionEarned: result.balances.totalEarnings,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error('Failed to request payout:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders },
    );
  }
}
