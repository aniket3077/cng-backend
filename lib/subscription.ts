import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { verifyJwt } from './auth';

const GRACE_PERIOD_DAYS = 3;

// Subscription plan pricing configuration
export const PLAN_CONFIG = {
    free_trial: { price: 0, duration: 15, name: 'Free Trial' },
    '1_month': { price: 15, duration: 30, name: '1 Month' },
    '6_month': { price: 79, duration: 180, name: '6 Months' },
    '1_year': { price: 150, duration: 365, name: '1 Year' },
} as const;

export interface SubscriptionCheckResult {
  isValid: boolean;
  isExpired: boolean;
  isInGracePeriod: boolean;
  daysRemaining: number;
  subscriptionType: string | null;
  expiryDate: Date | null;
  message?: string;
}

/**
 * Check if owner's subscription is valid and active
 * Returns detailed subscription status including grace period
 */
export async function checkSubscription(ownerId: string): Promise<SubscriptionCheckResult> {
  const owner = await prisma.stationOwner.findUnique({
    where: { id: ownerId },
    select: {
      subscriptionType: true,
      subscriptionEndsAt: true,
    },
  });

  if (!owner) {
    return {
      isValid: false,
      isExpired: false,
      isInGracePeriod: false,
      daysRemaining: 0,
      subscriptionType: null,
      expiryDate: null,
      message: 'Owner not found',
    };
  }

  // No subscription
  if (!owner.subscriptionType || !owner.subscriptionEndsAt) {
    return {
      isValid: false,
      isExpired: false,
      isInGracePeriod: false,
      daysRemaining: 0,
      subscriptionType: null,
      expiryDate: null,
      message: 'No active subscription',
    };
  }

  const now = new Date();
  const expiryDate = new Date(owner.subscriptionEndsAt);
  const timeDiff = expiryDate.getTime() - now.getTime();
  const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

  // Active subscription
  if (daysRemaining > 0) {
    return {
      isValid: true,
      isExpired: false,
      isInGracePeriod: false,
      daysRemaining,
      subscriptionType: owner.subscriptionType,
      expiryDate,
    };
  }

  // Within grace period (expired but still allowed)
  if (daysRemaining >= -GRACE_PERIOD_DAYS) {
    return {
      isValid: true,
      isExpired: true,
      isInGracePeriod: true,
      daysRemaining,
      subscriptionType: owner.subscriptionType,
      expiryDate,
      message: `Subscription expired ${Math.abs(daysRemaining)} day(s) ago. Grace period ends in ${GRACE_PERIOD_DAYS + daysRemaining} day(s)`,
    };
  }

  // Fully expired
  return {
    isValid: false,
    isExpired: true,
    isInGracePeriod: false,
    daysRemaining,
    subscriptionType: owner.subscriptionType,
    expiryDate,
    message: 'Subscription has expired. Please renew to continue.',
  };
}

/**
 * Middleware to verify subscription validity for protected owner endpoints
 * Returns 403 if subscription is expired (past grace period)
 */
export async function requireActiveSubscription(request: NextRequest): Promise<NextResponse | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyJwt(token);
    
    if (!payload || payload.role !== 'owner') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const subscriptionStatus = await checkSubscription(payload.userId);

    if (!subscriptionStatus.isValid) {
      return NextResponse.json({
        error: 'Subscription required',
        message: subscriptionStatus.message || 'Please purchase or renew your subscription to access this feature',
        subscriptionStatus: {
          isExpired: subscriptionStatus.isExpired,
          expiryDate: subscriptionStatus.expiryDate,
          daysRemaining: subscriptionStatus.daysRemaining,
        },
      }, { status: 403 });
    }

    // Subscription is valid, allow request to proceed
    return null;
  } catch (error) {
    console.error('Subscription check error:', error);
    return NextResponse.json(
      { error: 'Failed to verify subscription' },
      { status: 500 }
    );
  }
}

/**
 * Helper to add subscription warning headers if in grace period
 */
export function addSubscriptionHeaders(
  response: NextResponse,
  status: SubscriptionCheckResult
): NextResponse {
  if (status.isInGracePeriod) {
    response.headers.set('X-Subscription-Warning', 'true');
    response.headers.set('X-Subscription-Message', status.message || '');
    response.headers.set('X-Days-Remaining', status.daysRemaining.toString());
  }
  return response;
}
