import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';
import {
  assessReferralRisk,
  buildDeviceFingerprint,
  buildMonthlyCommissionSeries,
  generateReferralCode,
  getEarningRemainingAmount,
  parseJson,
  syncUserCommissionBalances,
} from '@/lib/referral-commission';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';
import { getPublicSubscriptionPlans } from '@/lib/subscription';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

async function createUniqueReferralCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateReferralCode();
    const existing = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  return `${generateReferralCode(6)}${Date.now().toString().slice(-2)}`;
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

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        referralsGiven: {
          include: {
            referred: {
              select: {
                id: true,
                name: true,
                createdAt: true,
                subscriptionType: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        earnings: {
          include: {
            referral: {
              include: {
                referred: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: { earnedAt: 'desc' },
        },
        payoutRequests: {
          orderBy: { createdAt: 'desc' },
        },
        savedPayoutMethods: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = await createUniqueReferralCode();
      await prisma.user.update({
        where: { id: payload.userId },
        data: { referralCode },
      });
    }

    const balances = await syncUserCommissionBalances(prisma, payload.userId);
    const pendingCommissions = user.earnings
      .filter((earning) => earning.status === 'pending')
      .reduce((sum, earning) => sum + earning.amount, 0);
    const paidOutCommissions = user.payoutRequests
      .filter((payout) => payout.status === 'completed')
      .reduce((sum, payout) => sum + payout.amount, 0);
    const activeSubscribedReferrals = user.referralsGiven.filter(
      (referral) => referral.paymentStatus === 'paid' && referral.status === 'completed',
    ).length;
    const conversionRate = user.referralsGiven.length
      ? Math.round((activeSubscribedReferrals / user.referralsGiven.length) * 100)
      : 0;

    const referralHistory = user.referralsGiven.map((referral) => ({
      id: referral.id,
      referredUserId: referral.referredId,
      referredUserName: referral.referred?.name || 'Pending subscriber',
      subscriptionPlan: referral.subscriptionPlan,
      subscriptionAmount: referral.subscriptionAmount || 0,
      commissionEarned: referral.commissionEarned || 0,
      paymentStatus: referral.paymentStatus,
      referralStatus: referral.status,
      subscriptionDate: referral.completedAt || referral.conversionAt || referral.createdAt,
      suspicious: referral.suspicious,
      eligibleForCommission: referral.eligibleForCommission,
      ineligibleReason: referral.ineligibleReason,
      fraudFlags: parseJson<string[]>(referral.fraudFlags, []),
    }));

    const commissionHistory = user.earnings.map((earning) => ({
      id: earning.id,
      referredUserName: earning.referral.referred?.name || 'Subscriber',
      subscriptionPlan: earning.referral.subscriptionPlan,
      sourceAmount: earning.sourceAmount || earning.referral.subscriptionAmount || 0,
      commissionAmount: earning.amount,
      remainingAmount: getEarningRemainingAmount(earning),
      status: earning.status,
      earnedAt: earning.earnedAt,
      description: earning.description,
      paymentStatus: earning.referral.paymentStatus,
    }));

    const savedMethods = user.savedPayoutMethods.map((method) => ({
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
      verifiedAt: method.verifiedAt,
      lastUsedAt: method.lastUsedAt,
    }));

    return NextResponse.json(
      {
        share: {
          referralCode,
          referralLink: `https://cngbharat.com/referral?code=${referralCode}`,
          deepLink: `cngbharat://referral?code=${referralCode}`,
          inviteMessage: `Use my CNG Bharat referral code ${referralCode}. When you buy your first paid subscription, I earn 20% commission after payment verification.`,
        },
        overview: {
          totalReferralCommissionEarned: balances.totalEarnings,
          activeSubscribedReferrals,
          pendingCommissions,
          withdrawableBalance: balances.availableBalance,
          paidOutCommissions,
          totalReferrals: user.referralsGiven.length,
          conversionRate,
          monthlyGraph: buildMonthlyCommissionSeries(
            user.earnings.map((earning) => ({
              amount: earning.amount,
              earnedAt: earning.earnedAt,
            })),
          ),
        },
        wallet: {
          availableBalance: balances.availableBalance,
          minimumWithdrawal: 100,
          maximumWithdrawal: 50000,
          instantPayoutEnabled: true,
          otpRequired: true,
          payoutRail: 'Secure payout orchestration with verified payment release',
          savedMethods,
        },
        referralHistory,
        commissionHistory,
        payoutHistoryPreview: user.payoutRequests.slice(0, 5).map((payout) => ({
          id: payout.id,
          amount: payout.amount,
          netAmount: payout.netAmount || payout.amount,
          feeAmount: payout.feeAmount,
          status: payout.status,
          referenceId: payout.referenceId,
          createdAt: payout.createdAt,
        })),
        subscriptionPlans: getPublicSubscriptionPlans(),
        fraudSignals: {
          status: user.referralFraudStatus,
          score: user.referralFraudScore,
          monitor: [
            'Self-referral prevention',
            'Duplicate device referral monitoring',
            'Payment-verified commission only',
            'Manual review for suspicious payouts',
          ],
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
      identifier: `referral:${payload.userId}`,
      errorMessage: 'Please wait before trying another referral code.',
    });
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const body = await request.json();
    const referralCode = typeof body.referralCode === 'string'
      ? body.referralCode.trim().toUpperCase()
      : '';
    const referralSource = typeof body.referralSource === 'string'
      ? body.referralSource
      : 'manual_entry';
    const explicitFingerprint = typeof body.deviceFingerprint === 'string'
      ? body.deviceFingerprint
      : undefined;

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400, headers: corsHeaders },
      );
    }

    const [user, referrer] = await Promise.all([
      prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          phone: true,
          subscriptionType: true,
        },
      }),
      prisma.user.findUnique({
        where: { referralCode },
        select: {
          id: true,
          email: true,
          phone: true,
          lastKnownDeviceFingerprint: true,
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders },
      );
    }

    if (!referrer) {
      return NextResponse.json(
        { error: 'Referral code could not be linked to this account' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (referrer.id === payload.userId) {
      return NextResponse.json(
        { error: 'Referral code could not be linked to this account' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (user.subscriptionType && user.subscriptionType !== 'free_trial') {
      return NextResponse.json(
        { error: 'Referral codes must be applied before the first paid subscription' },
        { status: 400, headers: corsHeaders },
      );
    }

    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: payload.userId },
      select: { id: true },
    });

    if (existingReferral) {
      return NextResponse.json(
        { error: 'A referral is already linked to this account' },
        { status: 400, headers: corsHeaders },
      );
    }

    const { fingerprint, isStrongFingerprint } = buildDeviceFingerprint(request, explicitFingerprint);
    const velocityWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      existingUserOnFingerprint,
      existingReferralOnFingerprint,
      recentReferralCount,
      recentDeviceReferralCount,
    ] = await Promise.all([
      fingerprint
        ? prisma.user.findFirst({
          where: {
            lastKnownDeviceFingerprint: fingerprint,
            id: { notIn: [payload.userId, referrer.id] },
          },
          select: { id: true },
        })
        : Promise.resolve(null),
      fingerprint
        ? prisma.referral.findFirst({
          where: { deviceFingerprint: fingerprint },
          select: { id: true },
        })
        : Promise.resolve(null),
      prisma.referral.count({
        where: {
          referrerId: referrer.id,
          createdAt: { gte: velocityWindowStart },
        },
      }),
      fingerprint
        ? prisma.referral.count({
          where: {
            deviceFingerprint: fingerprint,
            createdAt: { gte: velocityWindowStart },
          },
        })
        : Promise.resolve(0),
    ]);

    const referralAssessment = assessReferralRisk({
      fingerprint,
      isStrongFingerprint,
      referrerFingerprint: referrer.lastKnownDeviceFingerprint,
      existingUserOnFingerprint: Boolean(existingUserOnFingerprint),
      existingReferralOnFingerprint: Boolean(existingReferralOnFingerprint),
      sameIdentityAsReferrer: Boolean(
        referrer.email.toLowerCase() === user.email.toLowerCase() ||
        (referrer.phone && user.phone && referrer.phone === user.phone)
      ),
      recentReferralCount,
      recentDeviceReferralCount,
    });

    const referral = await prisma.$transaction(async (tx) => {
      const createdReferral = await tx.referral.create({
        data: {
          referrerId: referrer.id,
          referredId: payload.userId,
          referralCode,
          status: 'pending',
          rewardAmount: 0,
          paymentStatus: 'awaiting_payment',
          source: referralSource,
          deviceFingerprint: fingerprint,
          suspicious: referralAssessment.suspicious,
          eligibleForCommission: referralAssessment.eligibleForCommission,
          ineligibleReason: referralAssessment.ineligibleReason,
          fraudFlags: JSON.stringify(referralAssessment.fraudFlags),
        },
      });

      await tx.user.update({
        where: { id: payload.userId },
        data: {
          referredBy: referrer.id,
          lastKnownDeviceFingerprint: fingerprint,
          referralJoinedAt: new Date(),
          referralFraudScore: referralAssessment.riskScore,
          referralFraudStatus: referralAssessment.eligibleForCommission
            ? referralAssessment.suspicious
              ? 'review'
              : 'clear'
            : 'blocked',
        },
      });

      return createdReferral;
    });

    return NextResponse.json(
      {
        message: referralAssessment.eligibleForCommission
          ? 'Referral linked. Commission will unlock after the first successful paid subscription.'
          : 'Referral linked for monitoring, but commission is blocked for this account.',
        referral,
        commissionPolicy: {
          trigger: 'First paid subscription only',
          rate: '20%',
          eligible: referralAssessment.eligibleForCommission,
          fraudFlags: referralAssessment.fraudFlags,
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
