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

// POST - Apply referral code during signup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referralCode } = body;

    if (!referralCode) {
      return NextResponse.json(
        { error: 'Referral code is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Find referral by code
    const referral = await prisma.referral.findUnique({
      where: { referralCode },
      include: {
        referrer: true,
        referred: true,
      },
    });

    if (!referral) {
      return NextResponse.json(
        { error: 'Invalid referral code' },
        { status: 404, headers: corsHeaders }
      );
    }

    if (referral.status === 'completed') {
      return NextResponse.json(
        { error: 'Referral code already used' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get current user (the one applying the code)
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const payload = await requireAuth(request);
    if (payload.role !== 'customer') {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check if user already has a referral
    const existingReferral = await prisma.referral.findFirst({
      where: { referredId: payload.userId },
    });

    if (existingReferral) {
      return NextResponse.json(
        { error: 'You have already used a referral code' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Update referral with referred user
    const updatedReferral = await prisma.referral.update({
      where: { id: referral.id },
      data: {
        referredId: payload.userId,
        status: 'completed',
        completedAt: new Date(),
      },
    });

    // Update user with referral info
    await prisma.user.update({
      where: { id: payload.userId },
      data: { referredBy: referral.referrerId },
    });

    // Create earning for referrer
    const earning = await prisma.referralEarning.create({
      data: {
        userId: referral.referrerId,
        referralId: updatedReferral.id,
        amount: referral.rewardAmount,
        type: 'referral',
        status: 'pending',
        description: `Referral bonus for ${payload.userId}`,
        availableAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Available after 7 days
      },
    });

    return NextResponse.json(
      {
        message: 'Referral code applied successfully',
        referral: updatedReferral,
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
