import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const REFERRAL_COMMISSION_RATE = 0.2;
export const MIN_WITHDRAWAL_AMOUNT = 100;
export const MAX_WITHDRAWAL_AMOUNT = 50000;
export const INSTANT_PAYOUT_FEE_RATE = 0.015;
export const MAX_PAYOUT_FEE = 25;

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export function generateReferralCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  // SECURITY FIX: use crypto.randomBytes instead of Math.random for referral codes
  const randomBytes = crypto.randomBytes(length);
  for (let index = 0; index < length; index += 1) {
    code += chars.charAt(randomBytes[index] % chars.length);
  }

  return code;
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function calculateCommission(sourceAmount: number): number {
  return roundCurrency(sourceAmount * REFERRAL_COMMISSION_RATE);
}

export function calculatePayoutFee(amount: number, instantPayout: boolean): number {
  if (!instantPayout) {
    return 0;
  }

  return roundCurrency(Math.min(amount * INSTANT_PAYOUT_FEE_RATE, MAX_PAYOUT_FEE));
}

export function createPayoutReference(): string {
  return `PAYOUT-${Date.now().toString().slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function buildDeviceFingerprint(
  request: NextRequest,
  explicitFingerprint?: string | null,
): { fingerprint: string | null; isStrongFingerprint: boolean } {
  if (explicitFingerprint?.trim()) {
    return {
      fingerprint: explicitFingerprint.trim(),
      isStrongFingerprint: true,
    };
  }

  const headerFingerprint = request.headers.get('x-device-fingerprint');
  if (headerFingerprint?.trim()) {
    return {
      fingerprint: headerFingerprint.trim(),
      isStrongFingerprint: true,
    };
  }

  return {
    fingerprint: null,
    isStrongFingerprint: false,
  };
}

interface ReferralAssessmentInput {
  fingerprint: string | null;
  isStrongFingerprint: boolean;
  referrerFingerprint?: string | null;
  existingUserOnFingerprint?: boolean;
  existingReferralOnFingerprint?: boolean;
  sameIdentityAsReferrer?: boolean;
  recentReferralCount?: number;
  recentDeviceReferralCount?: number;
}

export function assessReferralRisk({
  fingerprint,
  isStrongFingerprint,
  referrerFingerprint,
  existingUserOnFingerprint,
  existingReferralOnFingerprint,
  sameIdentityAsReferrer,
  recentReferralCount,
  recentDeviceReferralCount,
}: ReferralAssessmentInput) {
  const flags: string[] = [];
  let riskScore = 0;
  let suspicious = false;
  let eligibleForCommission = true;
  let ineligibleReason: string | null = null;

  if (sameIdentityAsReferrer) {
    flags.push('self_referral_identity_match');
    riskScore += 90;
    eligibleForCommission = false;
    ineligibleReason = 'self_referral';
  }

  if (isStrongFingerprint && fingerprint && referrerFingerprint && fingerprint === referrerFingerprint) {
    flags.push('self_referral_device_match');
    riskScore += 95;
    eligibleForCommission = false;
    ineligibleReason = 'self_referral';
  }

  if (isStrongFingerprint && (existingUserOnFingerprint || existingReferralOnFingerprint)) {
    flags.push('duplicate_device_referral');
    riskScore += 85;
    eligibleForCommission = false;
    ineligibleReason = ineligibleReason || 'duplicate_device';
  }

  if (!isStrongFingerprint && fingerprint && (existingUserOnFingerprint || existingReferralOnFingerprint)) {
    flags.push('weak_device_match');
    riskScore += 35;
    suspicious = true;
  }

  if ((recentReferralCount || 0) >= 4) {
    flags.push('referral_velocity_limit');
    riskScore += 45;
    suspicious = true;
  }

  if (isStrongFingerprint && (recentDeviceReferralCount || 0) >= 2) {
    flags.push('device_velocity_limit');
    riskScore += 60;
    eligibleForCommission = false;
    ineligibleReason = ineligibleReason || 'referral_velocity';
  }

  if (riskScore >= 40) {
    suspicious = true;
  }

  return {
    suspicious,
    eligibleForCommission,
    ineligibleReason,
    riskScore,
    fraudFlags: flags,
  };
}

export function parseJson<T>(value?: string | null, fallback?: T): T | null {
  if (!value) {
    return fallback ?? null;
  }

  try {
    return JSON.parse(value) as T;
  } catch (_error) {
    return fallback ?? null;
  }
}

export function getEarningRemainingAmount(earning: {
  amount: number;
  remainingAmount?: number | null;
}) {
  if (typeof earning.remainingAmount === 'number') {
    return earning.remainingAmount;
  }

  return earning.amount;
}

export async function syncUserCommissionBalances(db: PrismaLike, userId: string) {
  const earnings = await db.referralEarning.findMany({
    where: { userId },
    select: {
      amount: true,
      remainingAmount: true,
      status: true,
    },
  });

  const totalEarnings = roundCurrency(
    earnings.reduce((sum, earning) => sum + earning.amount, 0),
  );
  const availableBalance = roundCurrency(
    earnings.reduce((sum, earning) => {
      if (earning.status !== 'available') {
        return sum;
      }

      return sum + getEarningRemainingAmount(earning);
    }, 0),
  );

  await db.user.update({
    where: { id: userId },
    data: {
      totalEarnings,
      availableBalance,
    },
  });

  return { totalEarnings, availableBalance };
}

export function buildMonthlyCommissionSeries(
  earnings: Array<{ amount: number; earnedAt: Date }>,
  months = 6,
) {
  const now = new Date();
  const series = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthLabel = cursor.toLocaleString('en-IN', { month: 'short' });
    const total = earnings.reduce((sum, earning) => {
      const earnedAt = new Date(earning.earnedAt);
      if (
        earnedAt.getFullYear() === cursor.getFullYear() &&
        earnedAt.getMonth() === cursor.getMonth()
      ) {
        return sum + earning.amount;
      }

      return sum;
    }, 0);

    series.push({
      label: monthLabel,
      amount: roundCurrency(total),
    });
  }

  return series;
}

export function maskDestination(accountDetails: Record<string, string | undefined> | null) {
  if (!accountDetails) {
    return 'Destination unavailable';
  }

  if (accountDetails.upiId) {
    return accountDetails.upiId;
  }

  if (accountDetails.accountNumber) {
    return `••••${accountDetails.accountNumber.slice(-4)}`;
  }

  return 'Destination unavailable';
}
