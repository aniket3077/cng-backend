import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { requireAuth } from '@/lib/auth';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

// Generate referral code
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET - Get referral info and stats
export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request);

    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
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
                email: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        earnings: {
          where: { status: 'available' },
          orderBy: { earnedAt: 'desc' },
        },
        payoutRequests: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Generate referral code if user doesn't have one
    let referralCode = user.referralCode;
    if (!referralCode) {
      referralCode = generateReferralCode();
      await prisma.user.update({
        where: { id: payload.userId },
        data: { referralCode },
      });
    }

    const stats = {
      totalReferrals: user.referralsGiven.length,
      completedReferrals: user.referralsGiven.filter(r => r.status === 'completed').length,
      totalEarnings: user.totalEarnings,
      availableBalance: user.availableBalance,
      pendingEarnings: user.earnings.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.amount, 0),
      referralCode,
      referralLink: `https://cngbharat.com/referral?code=${referralCode}`,
    };

    return NextResponse.json(
      {
        stats,
        referrals: user.referralsGiven,
        earnings: user.earnings,
        payoutRequests: user.payoutRequests,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Referral GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST - Apply referral code
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
    const { referralCode } = body;

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find user with this referral code
    const referrer = await prisma.user.findUnique({
      where: { referralCode: referralCode.toUpperCase() },
    });

    if (!referrer) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Prevent self-referral
    if (referrer.id === payload.userId) {
      return NextResponse.json(
        { error: 'Cannot use your own referral code' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if current user already has a referral
    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: payload.userId },
    });

    if (existingReferral) {
      return NextResponse.json(
        { error: 'You have already used a referral code' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Create new referral record
    const newReferral = await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredId: payload.userId,
        referralCode: referralCode.toUpperCase(),
        status: 'completed',
        rewardAmount: 50,
        completedAt: new Date(),
      },
    });

    // Update current user with referral info
    await prisma.user.update({
      where: { id: payload.userId },
      data: { referredBy: referrer.id },
    });

    // Create earning for referrer
    const earning = await prisma.referralEarning.create({
      data: {
        userId: referrer.id,
        referralId: newReferral.id,
        amount: 50,
        type: 'referral',
        status: 'pending',
        earnedAt: new Date(),
      },
    });

    return NextResponse.json(
      {
        message: 'Referral code applied successfully!',
        referral: newReferral,
        earning,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Referral POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
