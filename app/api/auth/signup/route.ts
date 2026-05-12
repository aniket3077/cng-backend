import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signJwt, signRefreshToken } from '@/lib/auth';
import { corsHeaders } from '@/lib/api-utils';
import {
  assessReferralRisk,
  buildDeviceFingerprint,
  generateReferralCode,
} from '@/lib/referral-commission';

const signupSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  email: z.string().email().trim().toLowerCase(),
  phone: z.string().min(10).max(15, 'Invalid phone number'),
  vehicleNo: z.string().min(4).max(20).trim().toUpperCase(),
  password: z.string()
    .min(6, 'Password must be at least 6 characters')
    .max(100),
  referralCode: z.string().optional(),
  deviceFingerprint: z.string().optional(),
  referralSource: z.string().optional(),
});

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = signupSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validation.error.flatten() },
        { status: 400, headers: corsHeaders }
      );
    }

    const {
      name,
      email,
      phone,
      vehicleNo,
      password,
      referralCode,
      deviceFingerprint,
      referralSource,
    } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409, headers: corsHeaders }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    const { fingerprint, isStrongFingerprint } = buildDeviceFingerprint(request, deviceFingerprint);

    let referredBy: string | null = null;
    let referralRecordInput:
      | {
          referrerId: string;
          referralCode: string;
          deviceFingerprint: string | null;
          suspicious: boolean;
          eligibleForCommission: boolean;
          ineligibleReason: string | null;
          fraudFlags: string;
          riskScore: number;
        }
      | null = null;

    if (referralCode) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralCode.toUpperCase() },
        select: {
          id: true,
          email: true,
          phone: true,
          lastKnownDeviceFingerprint: true,
        },
      });

      if (!referrer) {
        return NextResponse.json(
          { error: 'Invalid referral code' },
          { status: 400, headers: corsHeaders }
        );
      }

      if (referrer) {
        const [existingUserOnFingerprint, existingReferralOnFingerprint] = await Promise.all([
          fingerprint
            ? prisma.user.findFirst({
                where: {
                  lastKnownDeviceFingerprint: fingerprint,
                  id: { not: referrer.id },
                },
                select: { id: true },
              })
            : Promise.resolve(null),
          fingerprint
            ? prisma.referral.findFirst({
                where: {
                  deviceFingerprint: fingerprint,
                },
                select: { id: true },
              })
            : Promise.resolve(null),
        ]);

        const referralAssessment = assessReferralRisk({
          fingerprint,
          isStrongFingerprint,
          referrerFingerprint: referrer.lastKnownDeviceFingerprint,
          existingUserOnFingerprint: Boolean(existingUserOnFingerprint),
          existingReferralOnFingerprint: Boolean(existingReferralOnFingerprint),
          sameIdentityAsReferrer: Boolean(
            referrer.email.toLowerCase() === email.toLowerCase() ||
            (referrer.phone && phone && referrer.phone === phone)
          ),
        });

        referredBy = referrer.id;
        referralRecordInput = {
          referrerId: referrer.id,
          referralCode: referralCode.toUpperCase(),
          deviceFingerprint: fingerprint,
          suspicious: referralAssessment.suspicious,
          eligibleForCommission: referralAssessment.eligibleForCommission,
          ineligibleReason: referralAssessment.ineligibleReason,
          fraudFlags: JSON.stringify(referralAssessment.fraudFlags),
          riskScore: referralAssessment.riskScore,
        };
      }
    }

    // Generate referral code for new user
    const newUserReferralCode = await createUniqueReferralCode();

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          phone,
          passwordHash,
          role: 'customer',
          referralCode: newUserReferralCode,
          referredBy,
          lastKnownDeviceFingerprint: fingerprint,
          referralJoinedAt: referredBy ? new Date() : null,
          referralFraudScore: referralRecordInput?.riskScore || 0,
          referralFraudStatus: referralRecordInput
            ? referralRecordInput.eligibleForCommission
              ? referralRecordInput.suspicious
                ? 'review'
                : 'clear'
              : 'blocked'
            : 'clear',
          vehicles: {
            create: {
              plate: vehicleNo,
              regionCode: vehicleNo.substring(0, 2).toUpperCase(),
            },
          },
        },
        include: {
          vehicles: true,
        },
      });

      if (referralRecordInput) {
        await tx.referral.create({
          data: {
            referrerId: referralRecordInput.referrerId,
            referredId: createdUser.id,
            referralCode: referralRecordInput.referralCode,
            status: 'pending',
            rewardAmount: 0,
            commissionRate: 0.2,
            paymentStatus: 'awaiting_payment',
            source: referralSource || 'signup',
            deviceFingerprint: referralRecordInput.deviceFingerprint,
            suspicious: referralRecordInput.suspicious,
            eligibleForCommission: referralRecordInput.eligibleForCommission,
            ineligibleReason: referralRecordInput.ineligibleReason,
            fraudFlags: referralRecordInput.fraudFlags,
          },
        });
      }

      return createdUser;
    });

    // Generate JWT token
    const token = signJwt({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Generate refresh token
    const refreshToken = signRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return NextResponse.json(
      {
        message: 'Account created successfully',
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          role: user.role,
          vehicles: user.vehicles,
        },
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Signup error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      code: (error as any)?.code,
      meta: (error as any)?.meta,
    });
      // Return more specific error messages for debugging
      let errorMessage = 'Internal server error';
      let statusCode = 500;

      if (error instanceof Error) {
        if (error.message.includes('Unique constraint failed')) {
          errorMessage = 'Email already registered';
          statusCode = 409;
        } else if (error.message.includes('prisma')) {
          errorMessage = 'Database error: ' + error.message;
        } else {
          errorMessage = error.message;
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode, headers: corsHeaders }
      );
  }
}

