import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt, { JwtPayload } from 'jsonwebtoken';
import {
  prisma,
  isPrismaInitialized,
  getPrismaInitError,
  isPrismaUnavailableError,
} from '@/lib/prisma';
import { corsHeaders } from '@/lib/api-utils';
import { generateOTP, sendPasswordResetOTP } from '@/lib/email';
import { JWT_SECRET } from '@/lib/env';
import { rateLimit, rateLimitConfigs } from '@/lib/rate-limit';

const PASSWORD_RESET_OTP_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_RESET_MAX_SENDS_PER_WINDOW = 3;
const PASSWORD_RESET_MAX_VERIFY_ATTEMPTS = 5;
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const PASSWORD_RESET_OTP_SESSION_TOKEN_TYPE = 'password_reset_otp';
const PASSWORD_RESET_SESSION_TOKEN_TYPE = 'password_reset_session';

const passwordResetIdentifierSchema = z.string().trim().min(1, 'Email or mobile number is required');
const resetPasswordValueSchema = z.string()
  .min(6, 'Password must be at least 6 characters')
  .max(100, 'Password must be 100 characters or less');

const passwordResetRequestShape = {
  identifier: passwordResetIdentifierSchema.optional(),
  email: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  target: z.string().trim().optional(),
  sessionToken: z.string().trim().min(1).optional(),
};

const requestOTPSchema = z.object({
  action: z.literal('send'),
  ...passwordResetRequestShape,
}).refine((data) => Boolean(data.identifier || data.email || data.mobile || data.phone || data.target), {
  message: 'Email or mobile number is required',
  path: ['identifier'],
});

const verifyOTPSchema = z.object({
  action: z.literal('verify'),
  ...passwordResetRequestShape,
  otp: z.string().trim().length(6, 'OTP must be 6 digits'),
}).refine((data) => Boolean(data.identifier || data.email || data.mobile || data.phone || data.target), {
  message: 'Email or mobile number is required',
  path: ['identifier'],
});

const resetPasswordSchema = z.object({
  action: z.literal('reset'),
  ...passwordResetRequestShape,
  otp: z.string().trim().length(6, 'OTP must be 6 digits').optional(),
  resetToken: z.string().trim().min(32, 'Reset session expired. Please verify OTP again.').optional(),
  newPassword: resetPasswordValueSchema,
}).refine((data) => Boolean(data.identifier || data.email || data.mobile || data.phone || data.target), {
  message: 'Email or mobile number is required',
  path: ['identifier'],
}).refine((data) => Boolean(data.resetToken || data.otp), {
  message: 'Reset session expired. Please request a new OTP.',
  path: ['resetToken'],
});

type AccountType = 'user' | 'owner';

interface PasswordResetSession {
  accountType: AccountType;
  email: string;
  deliveryChannel: 'email';
  deliveryTarget: string;
  expiresAt: number;
  lastSentAt: number;
  resendAvailableAt: number;
  sendCount: number;
  sendWindowStartedAt: number;
  verifyAttempts: number;
  otpHash?: string;
  resetToken?: string;
  resetTokenHash?: string;
  resetTokenExpiresAt?: number;
}

interface PasswordResetOtpSessionTokenPayload extends JwtPayload, PasswordResetSession {
  type: typeof PASSWORD_RESET_OTP_SESSION_TOKEN_TYPE;
}

interface PasswordResetFinalTokenPayload extends JwtPayload {
  type: typeof PASSWORD_RESET_SESSION_TOKEN_TYPE;
  accountType: AccountType;
  email: string;
  deliveryChannel: 'email';
  deliveryTarget: string;
}

interface AccountLookupResult {
  accountType: AccountType;
  email: string;
}

const passwordResetSessions = new Map<string, PasswordResetSession>();

setInterval(() => {
  const now = Date.now();

  passwordResetSessions.forEach((session, email) => {
    const activeUntil = Math.max(session.expiresAt, session.resetTokenExpiresAt ?? 0);
    if (activeUntil <= now) {
      passwordResetSessions.delete(email);
    }
  });
}, 60 * 60 * 1000);

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '');
}

function isValidPhone(value: string) {
  const normalizedPhone = normalizePhone(value);
  return normalizedPhone.length >= 10 && normalizedPhone.length <= 15;
}

function normalizeIdentifier(value: string) {
  const trimmedValue = value.trim();

  if (isValidEmail(trimmedValue)) {
    return {
      kind: 'email' as const,
      value: trimmedValue.toLowerCase(),
    };
  }

  if (isValidPhone(trimmedValue)) {
    return {
      kind: 'phone' as const,
      value: normalizePhone(trimmedValue),
    };
  }

  return null;
}

function getIdentifierFromBody(body: {
  identifier?: string;
  email?: string;
  mobile?: string;
  phone?: string;
  target?: string;
}) {
  return body.identifier?.trim()
    || body.email?.trim()
    || body.mobile?.trim()
    || body.phone?.trim()
    || body.target?.trim()
    || '';
}

function getValidationErrorMessage(error: z.ZodError) {
  return error.issues[0]?.message || 'Invalid input';
}

function logValidationFailure(action: string | undefined, body: Record<string, unknown>, error: z.ZodError) {
  console.warn('Password reset validation failed', {
    action: action || 'unknown',
    keys: Object.keys(body || {}),
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.') || 'form',
      message: issue.message,
    })),
  });
}

function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createOtpHash(email: string, otp: string) {
  return hashSecret(`${email.toLowerCase()}:${otp}`);
}

function createResetTokenHash(email: string, resetToken: string) {
  return hashSecret(`${email.toLowerCase()}:${resetToken}`);
}

function toPasswordResetSession(
  payload: PasswordResetOtpSessionTokenPayload | PasswordResetSession
): PasswordResetSession {
  return {
    accountType: payload.accountType,
    email: payload.email.toLowerCase(),
    deliveryChannel: payload.deliveryChannel,
    deliveryTarget: payload.deliveryTarget,
    expiresAt: payload.expiresAt,
    lastSentAt: payload.lastSentAt,
    resendAvailableAt: payload.resendAvailableAt,
    sendCount: payload.sendCount,
    sendWindowStartedAt: payload.sendWindowStartedAt,
    verifyAttempts: payload.verifyAttempts,
    otpHash: payload.otpHash,
    resetTokenExpiresAt: payload.resetTokenExpiresAt,
    resetTokenHash: payload.resetTokenHash,
  };
}

function maskEmail(email: string) {
  const [localPart, domainPart] = email.split('@');
  const visibleStart = localPart.slice(0, 2);
  const maskedLocal = `${visibleStart}${'*'.repeat(Math.max(localPart.length - 2, 2))}`;
  return `${maskedLocal}@${domainPart}`;
}

function getRetryAfterSeconds(retryAfterMs: number) {
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

function createPasswordResetOtpSessionToken(session: PasswordResetSession) {
  const expiresInSeconds = getRetryAfterSeconds(session.expiresAt - Date.now());
  return jwt.sign(
    {
      type: PASSWORD_RESET_OTP_SESSION_TOKEN_TYPE,
      ...session,
    },
    JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
}

function parsePasswordResetOtpSessionToken(token: string): PasswordResetOtpSessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as PasswordResetOtpSessionTokenPayload;
    return decoded.type === PASSWORD_RESET_OTP_SESSION_TOKEN_TYPE ? decoded : null;
  } catch {
    return null;
  }
}

function createPasswordResetFinalToken(
  session: Pick<PasswordResetSession, 'accountType' | 'email' | 'deliveryChannel' | 'deliveryTarget'>,
  expiresAt: number
) {
  const expiresInSeconds = getRetryAfterSeconds(expiresAt - Date.now());
  return jwt.sign(
    {
      type: PASSWORD_RESET_SESSION_TOKEN_TYPE,
      accountType: session.accountType,
      email: session.email.toLowerCase(),
      deliveryChannel: session.deliveryChannel,
      deliveryTarget: session.deliveryTarget,
    },
    JWT_SECRET,
    { expiresIn: expiresInSeconds }
  );
}

function parsePasswordResetFinalToken(token: string): PasswordResetFinalTokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as PasswordResetFinalTokenPayload;
    return decoded.type === PASSWORD_RESET_SESSION_TOKEN_TYPE ? decoded : null;
  } catch {
    return null;
  }
}

function doesSessionMatchAccount(
  session: Pick<PasswordResetSession, 'accountType' | 'email'>,
  account: AccountLookupResult
) {
  return session.accountType === account.accountType && session.email.toLowerCase() === account.email.toLowerCase();
}

async function findAccountByIdentifier(identifier: string): Promise<AccountLookupResult | null> {
  const normalizedIdentifier = normalizeIdentifier(identifier);

  if (!normalizedIdentifier) {
    return null;
  }

  if (normalizedIdentifier.kind === 'email') {
    const user = await prisma.user.findUnique({
      where: { email: normalizedIdentifier.value },
      select: { email: true },
    });

    if (user) {
      return {
        accountType: 'user',
        email: user.email,
      };
    }

    const owner = await prisma.stationOwner.findUnique({
      where: { email: normalizedIdentifier.value },
      select: { email: true },
    });

    if (owner) {
      return {
        accountType: 'owner',
        email: owner.email,
      };
    }

    return null;
  }

  const normalizedPhone = normalizedIdentifier.value;
  const lastTenDigits = normalizedPhone.slice(-10);
  const phoneFilter = {
    OR: [
      { phone: normalizedPhone },
      { phone: lastTenDigits },
      { phone: { endsWith: lastTenDigits } },
    ],
  };

  const user = await prisma.user.findFirst({
    where: phoneFilter,
    select: { email: true },
  });

  if (user) {
    return {
      accountType: 'user',
      email: user.email,
    };
  }

  const owner = await prisma.stationOwner.findFirst({
    where: phoneFilter,
    select: { email: true },
  });

  if (owner) {
    return {
      accountType: 'owner',
      email: owner.email,
    };
  }

  return null;
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = rateLimit(request, rateLimitConfigs.auth, { headers: corsHeaders });
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  if (!isPrismaInitialized()) {
    const prismaInitError = getPrismaInitError();
    console.error('Prisma not initialized while handling password reset:', prismaInitError);
    return NextResponse.json(
      {
        success: false,
        error: 'Password reset service temporarily unavailable',
        errorCode: 'PASSWORD_RESET_PRISMA_INIT',
      },
      { status: 503, headers: corsHeaders }
    );
  }

  let phase = 'parse_request';
  const makeErrorCode = () => `PASSWORD_RESET_${phase.toUpperCase()}`;

  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'send') {
      phase = 'validate_send_request';
      const validation = requestOTPSchema.safeParse(body);
      if (!validation.success) {
        logValidationFailure(action, body, validation.error);
        return NextResponse.json(
          {
            success: false,
            error: getValidationErrorMessage(validation.error),
            details: validation.error.flatten(),
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const identifier = getIdentifierFromBody(validation.data);
      const normalizedIdentifier = normalizeIdentifier(identifier);

      if (!normalizedIdentifier) {
        phase = 'normalize_send_identifier';
        return NextResponse.json(
          { success: false, error: 'Enter a valid email or mobile number' },
          { status: 400, headers: corsHeaders }
        );
      }

      phase = 'lookup_send_account';
      const account = await findAccountByIdentifier(identifier);

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'Account not found' },
          { status: 404, headers: corsHeaders }
        );
      }

      const accountKey = account.email.toLowerCase();
      const existingSessionToken = validation.data.sessionToken
        ? parsePasswordResetOtpSessionToken(validation.data.sessionToken)
        : null;
      const existingSession = passwordResetSessions.get(accountKey);
      const effectiveExistingSession =
        existingSessionToken && doesSessionMatchAccount(existingSessionToken, account)
          ? toPasswordResetSession(existingSessionToken)
          : existingSession;
      const now = Date.now();

      phase = 'send_rate_limit_checks';
      if (effectiveExistingSession && effectiveExistingSession.resendAvailableAt > now) {
        const retryAfter = getRetryAfterSeconds(effectiveExistingSession.resendAvailableAt - now);
        return NextResponse.json(
          {
            success: false,
            error: `Please wait ${retryAfter} seconds before requesting another OTP.`,
            retryAfter,
          },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Retry-After': retryAfter.toString(),
            },
          }
        );
      }

      const sendWindowStartedAt =
        effectiveExistingSession && effectiveExistingSession.sendWindowStartedAt + PASSWORD_RESET_OTP_EXPIRY_MS > now
          ? effectiveExistingSession.sendWindowStartedAt
          : now;
      const sendCount =
        effectiveExistingSession && effectiveExistingSession.sendWindowStartedAt + PASSWORD_RESET_OTP_EXPIRY_MS > now
          ? effectiveExistingSession.sendCount + 1
          : 1;

      if (sendCount > PASSWORD_RESET_MAX_SENDS_PER_WINDOW) {
        const retryAfter = getRetryAfterSeconds((sendWindowStartedAt + PASSWORD_RESET_OTP_EXPIRY_MS) - now);
        return NextResponse.json(
          {
            success: false,
            error: 'Too many OTP requests. Please try again later.',
            retryAfter,
          },
          {
            status: 429,
            headers: {
              ...corsHeaders,
              'Retry-After': retryAfter.toString(),
            },
          }
        );
      }

      const otp = generateOTP();
      const session: PasswordResetSession = {
        accountType: account.accountType,
        email: account.email.toLowerCase(),
        deliveryChannel: 'email',
        deliveryTarget: maskEmail(account.email),
        expiresAt: now + PASSWORD_RESET_OTP_EXPIRY_MS,
        lastSentAt: now,
        resendAvailableAt: now + PASSWORD_RESET_RESEND_COOLDOWN_MS,
        sendCount,
        sendWindowStartedAt,
        verifyAttempts: 0,
        otpHash: createOtpHash(account.email, otp),
      };

      const sessionToken = createPasswordResetOtpSessionToken(session);
      passwordResetSessions.set(accountKey, session);

      phase = 'send_reset_email';
      const emailSent = await sendPasswordResetOTP(account.email, otp);

      if (!emailSent) {
        passwordResetSessions.delete(accountKey);
        return NextResponse.json(
          {
            success: false,
            error: 'Password reset email service temporarily unavailable',
            errorCode: makeErrorCode(),
          },
          { status: 503, headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: true,
          message: 'OTP sent successfully',
          deliveryChannel: session.deliveryChannel,
          deliveryTarget: session.deliveryTarget,
          expiresIn: Math.floor(PASSWORD_RESET_OTP_EXPIRY_MS / 1000),
          resendAfter: Math.floor(PASSWORD_RESET_RESEND_COOLDOWN_MS / 1000),
          sessionToken,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (action === 'verify') {
      phase = 'validate_verify_request';
      const validation = verifyOTPSchema.safeParse(body);
      if (!validation.success) {
        logValidationFailure(action, body, validation.error);
        return NextResponse.json(
          {
            success: false,
            error: getValidationErrorMessage(validation.error),
            details: validation.error.flatten(),
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const identifier = getIdentifierFromBody(validation.data);
      const normalizedIdentifier = normalizeIdentifier(identifier);

      if (!normalizedIdentifier) {
        phase = 'normalize_verify_identifier';
        return NextResponse.json(
          { success: false, error: 'Enter a valid email or mobile number' },
          { status: 400, headers: corsHeaders }
        );
      }

      phase = 'lookup_verify_account';
      const account = await findAccountByIdentifier(identifier);

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'Account not found' },
          { status: 404, headers: corsHeaders }
        );
      }

      const accountKey = account.email.toLowerCase();
      const sessionTokenPayload = validation.data.sessionToken
        ? parsePasswordResetOtpSessionToken(validation.data.sessionToken)
        : null;
      const tokenSession =
        sessionTokenPayload && doesSessionMatchAccount(sessionTokenPayload, account)
          ? toPasswordResetSession(sessionTokenPayload)
          : null;
      const session = tokenSession || passwordResetSessions.get(accountKey);

      if (!session) {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired OTP' },
          { status: 401, headers: corsHeaders }
        );
      }

      const now = Date.now();
      phase = 'verify_otp_checks';

      if (session.expiresAt <= now) {
        passwordResetSessions.delete(accountKey);
        return NextResponse.json(
          { success: false, error: 'OTP expired' },
          { status: 401, headers: corsHeaders }
        );
      }

      if (session.verifyAttempts >= PASSWORD_RESET_MAX_VERIFY_ATTEMPTS) {
        passwordResetSessions.delete(accountKey);
        return NextResponse.json(
          { success: false, error: 'Too many invalid OTP attempts. Please request a new OTP.' },
          { status: 429, headers: corsHeaders }
        );
      }

      const isOtpValid = session.otpHash === createOtpHash(account.email, validation.data.otp);

      if (!isOtpValid) {
        const nextVerifyAttempts = session.verifyAttempts + 1;

        if (nextVerifyAttempts >= PASSWORD_RESET_MAX_VERIFY_ATTEMPTS) {
          passwordResetSessions.delete(accountKey);
          return NextResponse.json(
            { success: false, error: 'Too many invalid OTP attempts. Please request a new OTP.' },
            { status: 429, headers: corsHeaders }
          );
        }

        const nextSession: PasswordResetSession = {
          ...session,
          verifyAttempts: nextVerifyAttempts,
        };

        const nextSessionToken = createPasswordResetOtpSessionToken(nextSession);
        passwordResetSessions.set(accountKey, nextSession);

        return NextResponse.json(
          {
            success: false,
            error: 'Invalid OTP',
            remainingAttempts: PASSWORD_RESET_MAX_VERIFY_ATTEMPTS - nextVerifyAttempts,
            sessionToken: nextSessionToken,
          },
          { status: 401, headers: corsHeaders }
        );
      }

      const resetTokenExpiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY_MS;
      const resetToken = createPasswordResetFinalToken(session, resetTokenExpiresAt);
      phase = 'issue_reset_token';

      passwordResetSessions.set(accountKey, {
        ...session,
        expiresAt: resetTokenExpiresAt,
        verifyAttempts: 0,
        otpHash: '',
        resetTokenHash: createResetTokenHash(account.email, resetToken),
        resetTokenExpiresAt,
      });

      return NextResponse.json(
        {
          success: true,
          message: 'OTP verified successfully',
          resetToken,
          resetTokenExpiresIn: Math.floor(PASSWORD_RESET_TOKEN_EXPIRY_MS / 1000),
          deliveryTarget: session.deliveryTarget,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    if (action === 'reset') {
      phase = 'validate_reset_request';
      const validation = resetPasswordSchema.safeParse(body);
      if (!validation.success) {
        logValidationFailure(action, body, validation.error);
        return NextResponse.json(
          {
            success: false,
            error: getValidationErrorMessage(validation.error),
            details: validation.error.flatten(),
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const identifier = getIdentifierFromBody(validation.data);
      const normalizedIdentifier = normalizeIdentifier(identifier);

      if (!normalizedIdentifier) {
        phase = 'normalize_reset_identifier';
        return NextResponse.json(
          { success: false, error: 'Enter a valid email or mobile number' },
          { status: 400, headers: corsHeaders }
        );
      }

      phase = 'lookup_reset_account';
      const account = await findAccountByIdentifier(identifier);

      if (!account) {
        return NextResponse.json(
          { success: false, error: 'Account not found' },
          { status: 404, headers: corsHeaders }
        );
      }

      const accountKey = account.email.toLowerCase();
      const session = passwordResetSessions.get(accountKey);

      const now = Date.now();
      phase = 'reset_token_checks';
      const verifiedResetToken = validation.data.resetToken
        ? parsePasswordResetFinalToken(validation.data.resetToken)
        : null;

      if (verifiedResetToken && doesSessionMatchAccount(verifiedResetToken, account)) {
        // Verified via signed stateless token.
      } else if (validation.data.resetToken) {
        if (!session) {
          return NextResponse.json(
            { success: false, error: 'Reset session expired. Please request a new OTP.' },
            { status: 401, headers: corsHeaders }
          );
        }

        if (!session.resetTokenHash || !session.resetTokenExpiresAt || session.resetTokenExpiresAt <= now) {
          passwordResetSessions.delete(accountKey);
          return NextResponse.json(
            { success: false, error: 'Reset session expired. Please verify OTP again.' },
            { status: 401, headers: corsHeaders }
          );
        }

        const expectedResetTokenHash = createResetTokenHash(account.email, validation.data.resetToken);
        if (session.resetTokenHash !== expectedResetTokenHash) {
          return NextResponse.json(
            { success: false, error: 'Invalid reset session. Please verify OTP again.' },
            { status: 401, headers: corsHeaders }
          );
        }
      } else if (validation.data.otp && validation.data.sessionToken) {
        const sessionTokenPayload = parsePasswordResetOtpSessionToken(validation.data.sessionToken);

        if (!sessionTokenPayload || !doesSessionMatchAccount(sessionTokenPayload, account)) {
          return NextResponse.json(
            { success: false, error: 'Reset session expired. Please request a new OTP.' },
            { status: 401, headers: corsHeaders }
          );
        }

        const tokenSession = toPasswordResetSession(sessionTokenPayload);

        if (tokenSession.expiresAt <= now) {
          return NextResponse.json(
            { success: false, error: 'OTP expired' },
            { status: 401, headers: corsHeaders }
          );
        }

        const expectedOtpHash = createOtpHash(account.email, validation.data.otp);
        if (!tokenSession.otpHash || tokenSession.otpHash !== expectedOtpHash) {
          return NextResponse.json(
            { success: false, error: 'Invalid OTP' },
            { status: 401, headers: corsHeaders }
          );
        }

        // Generate reset token for password reset step
        const resetTokenExpiresAt = now + PASSWORD_RESET_TOKEN_EXPIRY_MS;
        const resetToken = createPasswordResetFinalToken(tokenSession, resetTokenExpiresAt);
        
        // Update session with reset token
        const updatedSession: PasswordResetSession = {
          ...tokenSession,
          resetToken,
          resetTokenExpiresAt,
          verifyAttempts: tokenSession.verifyAttempts + 1,
        };
        
        const updatedSessionToken = createPasswordResetOtpSessionToken(updatedSession);
        passwordResetSessions.set(accountKey, updatedSession);

        return NextResponse.json(
          {
            success: true,
            message: 'OTP verified successfully',
            resetToken,
            resetTokenExpiresIn: Math.floor(PASSWORD_RESET_TOKEN_EXPIRY_MS / 1000),
            sessionToken: updatedSessionToken,
          },
          { status: 200, headers: corsHeaders }
        );
      } else if (validation.data.otp) {
        if (!session) {
          return NextResponse.json(
            { success: false, error: 'Reset session expired. Please request a new OTP.' },
            { status: 401, headers: corsHeaders }
          );
        }

        if (session.expiresAt <= now) {
          passwordResetSessions.delete(accountKey);
          return NextResponse.json(
            { success: false, error: 'OTP expired' },
            { status: 401, headers: corsHeaders }
          );
        }

        const expectedOtpHash = createOtpHash(account.email, validation.data.otp);
        if (!session.otpHash || session.otpHash !== expectedOtpHash) {
          return NextResponse.json(
            { success: false, error: 'Invalid OTP' },
            { status: 401, headers: corsHeaders }
          );
        }
      }

      // Safety guard: if we reach here without a verified token, reject
      if (!verifiedResetToken && !validation.data.otp) {
        return NextResponse.json(
          { success: false, error: 'Reset session expired. Please request a new OTP.' },
          { status: 401, headers: corsHeaders }
        );
      }

      phase = 'hash_new_password';
      const passwordHash = await bcrypt.hash(validation.data.newPassword, 12);

      phase = 'persist_new_password';
      try {
        if (account.accountType === 'user') {
          await prisma.user.update({
            where: { email: account.email },
            data: { passwordHash },
          });
        } else {
          await prisma.stationOwner.update({
            where: { email: account.email },
            data: { passwordHash },
          });
        }

        passwordResetSessions.delete(accountKey);

        return NextResponse.json(
          {
            success: true,
            message: 'Password reset successfully',
          },
          { status: 200, headers: corsHeaders }
        );
      } catch (dbError) {
        return NextResponse.json(
          {
            success: false,
            error: 'Failed to update password. Please try again.',
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400, headers: corsHeaders }
    );
  } catch (error) {
    if (isPrismaUnavailableError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password reset service temporarily unavailable',
          errorCode: makeErrorCode(),
        },
        { status: 503, headers: corsHeaders }
      );
    }

    if (phase === 'send_reset_email') {
      return NextResponse.json(
        {
          success: false,
          error: 'Password reset email service temporarily unavailable',
          errorCode: makeErrorCode(),
        },
        { status: 503, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        errorCode: makeErrorCode(),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
