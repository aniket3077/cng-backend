import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { verifyJwt } from './auth';

const GRACE_PERIOD_DAYS = 3;

// Subscription plan pricing configuration
export const PLAN_CONFIG = {
    free_trial: {
      id: 'free_trial',
      price: 0,
      duration: 15,
      name: 'Free Trial',
      billingLabel: '15-day access',
      commissionEligible: false,
      cashbackHighlight: 'Explore premium routing before upgrading',
    },
    monthly: {
      id: 'monthly',
      price: 149,
      duration: 30,
      name: 'Monthly Plan',
      billingLabel: 'Billed monthly',
      commissionEligible: true,
      cashbackHighlight: 'Fast upgrade for first-time subscribers',
    },
    quarterly: {
      id: 'quarterly',
      price: 399,
      duration: 90,
      name: 'Quarterly Plan',
      billingLabel: 'Billed every 3 months',
      commissionEligible: true,
      cashbackHighlight: 'Higher retention and better commission yield',
    },
    annual_premium: {
      id: 'annual_premium',
      price: 999,
      duration: 365,
      name: 'Annual Premium',
      billingLabel: 'Billed yearly',
      commissionEligible: true,
      cashbackHighlight: 'Top conversion value with premium savings',
    },
} as const;

export type SubscriptionPlanId = keyof typeof PLAN_CONFIG;

const LEGACY_PLAN_ALIASES: Record<string, SubscriptionPlanId> = {
  '1_month': 'monthly',
  '6_month': 'quarterly',
  '1_year': 'annual_premium',
};

export function normalizePlanType(planType: string): SubscriptionPlanId | null {
  if (planType in PLAN_CONFIG) {
    return planType as SubscriptionPlanId;
  }

  return LEGACY_PLAN_ALIASES[planType] || null;
}

export function getPlanConfig(planType: string) {
  const normalizedPlan = normalizePlanType(planType);
  return normalizedPlan ? PLAN_CONFIG[normalizedPlan] : null;
}

export function getPaidPlans() {
  return Object.values(PLAN_CONFIG).filter((plan) => plan.commissionEligible);
}

export function getPublicSubscriptionPlans() {
  return Object.values(PLAN_CONFIG).map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    duration: plan.duration,
    billingLabel: plan.billingLabel,
    cashbackHighlight: plan.cashbackHighlight,
    commissionEligible: plan.commissionEligible,
  }));
}

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
    const payload = await verifyJwt(token);
    
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
