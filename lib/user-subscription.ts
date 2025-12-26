import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { SubscriptionCheckResult } from './subscription';

export async function checkUserSubscription(userId: string): Promise<SubscriptionCheckResult> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            subscriptionType: true,
            subscriptionEndsAt: true,
        },
    });

    if (!user) {
        return {
            isValid: false,
            isExpired: false,
            isInGracePeriod: false,
            daysRemaining: 0,
            subscriptionType: null,
            expiryDate: null,
            message: 'User not found',
        };
    }

    // No subscription
    if (!user.subscriptionType || !user.subscriptionEndsAt) {
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
    const expiryDate = new Date(user.subscriptionEndsAt);
    const timeDiff = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    // Active subscription
    if (daysRemaining >= 0) {
        return {
            isValid: true,
            isExpired: false,
            isInGracePeriod: false,
            daysRemaining,
            subscriptionType: user.subscriptionType,
            expiryDate,
        };
    }

    // Fully expired (no grace period for users for now, or use same constant)
    // Assuming no grace period for end-users for now
    return {
        isValid: false,
        isExpired: true,
        isInGracePeriod: false,
        daysRemaining,
        subscriptionType: user.subscriptionType,
        expiryDate,
        message: 'Subscription has expired. Please renew to continue.',
    };
}
