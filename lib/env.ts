/**
 * Environment Configuration and Validation
 * This file validates required environment variables at startup
 */
import { parseAllowedOrigins } from './cors';
import { sanitizeEnvValue } from './env-values';

interface EnvConfig {
  // Required
  JWT_SECRET: string;
  JWT_REFRESH_SECRET: string;
  DATABASE_URL: string;
  ALLOWED_ORIGINS: string[];
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;

  // Optional with defaults
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;

  // External services (optional)
  GOOGLE_MAPS_API_KEY?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
}

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
] as const;

const optionalEnvVars = {
  NODE_ENV: 'development',
  PORT: 3000,
  GOOGLE_MAPS_API_KEY: '',
  RAZORPAY_WEBHOOK_SECRET: '',
} as const;

/**
 * Validate and parse environment variables
 */
function validateEnv(): EnvConfig {
  const missing: string[] = [];

  // Check required variables
  for (const key of requiredEnvVars) {
    if (!sanitizeEnvValue(process.env[key])) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const message = `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\nPlease create a .env file with these variables or set them in your environment.`;
    throw new Error(message);
  }

  // Validate JWT_SECRET strength
  const jwtSecret = sanitizeEnvValue(process.env.JWT_SECRET);
  if (jwtSecret.length < 32) {
    console.warn('⚠️  JWT_SECRET should be at least 32 characters for security');
  }
  if (process.env.NODE_ENV === 'production') {
    const weakSecrets = ['secret', 'password', 'changeme', 'your-secret', 'jwt-secret', 'development-default'];
    if (weakSecrets.some(weak => jwtSecret.toLowerCase().includes(weak))) {
      const msg = 'JWT_SECRET appears to be a weak/default value. Please use a strong random secret in production.';
      console.error('❌ Security Error:', msg);
      throw new Error(msg);
    }
  }

  // Validate Razorpay webhook secret in production
  if (process.env.NODE_ENV === 'production') {
    const webhookSecret = sanitizeEnvValue(process.env.RAZORPAY_WEBHOOK_SECRET);
    if (!webhookSecret || webhookSecret === 'your_webhook_secret_here') {
      throw new Error('RAZORPAY_WEBHOOK_SECRET must be configured in production');
    }
  }

  // Validate Redis URL in production
  if (process.env.NODE_ENV === 'production') {
    const redisUrl = sanitizeEnvValue(process.env.REDIS_URL);
    if (!redisUrl) {
      console.error('⚠️  WARNING: REDIS_URL not configured. Rate limiting will be per-instance only.');
    }
  }

  // Validate ALLOWED_ORIGINS
  if (process.env.NODE_ENV === 'production') {
    const origins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
    if (origins.includes('*')) {
      throw new Error('Wildcard CORS is not allowed in production');
    }
    if (origins.some(o => o.includes('localhost'))) {
      throw new Error('Localhost origins not allowed in production');
    }
  }

  // Validate Google Maps API Key in production
  if (process.env.NODE_ENV === 'production') {
    const mapsKey = sanitizeEnvValue(process.env.GOOGLE_MAPS_API_KEY);
    if (!mapsKey || mapsKey.startsWith('REPLACE_') || mapsKey === 'your-google-maps-api-key') {
      console.warn('⚠️  WARNING: GOOGLE_MAPS_API_KEY not configured or using default/placeholder value.');
    }
  }

  return {
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: sanitizeEnvValue(process.env.JWT_REFRESH_SECRET) || jwtSecret,
    DATABASE_URL: sanitizeEnvValue(process.env.DATABASE_URL),
    ALLOWED_ORIGINS: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    RAZORPAY_KEY_ID: sanitizeEnvValue(process.env.RAZORPAY_KEY_ID),
    RAZORPAY_KEY_SECRET: sanitizeEnvValue(process.env.RAZORPAY_KEY_SECRET),
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: parseInt(process.env.PORT || String(optionalEnvVars.PORT)),
    GOOGLE_MAPS_API_KEY: sanitizeEnvValue(process.env.GOOGLE_MAPS_API_KEY),
    RAZORPAY_WEBHOOK_SECRET: sanitizeEnvValue(process.env.RAZORPAY_WEBHOOK_SECRET),
  };
}

let envValidationError: Error | null = null;
let parsedEnv: EnvConfig;

try {
  parsedEnv = validateEnv();
} catch (err) {
  envValidationError = err instanceof Error ? err : new Error(String(err));
  parsedEnv = {
    JWT_SECRET: '',
    JWT_REFRESH_SECRET: '',
    DATABASE_URL: '',
    ALLOWED_ORIGINS: [],
    RAZORPAY_KEY_ID: '',
    RAZORPAY_KEY_SECRET: '',
    NODE_ENV: 'development',
    PORT: 3000,
    GOOGLE_MAPS_API_KEY: '',
    RAZORPAY_WEBHOOK_SECRET: '',
  };
}

export const env = parsedEnv;
export const getEnvValidationError = (): Error | null => envValidationError;

// Export individual values for convenience
export const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  DATABASE_URL,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  NODE_ENV,
  PORT,
  ALLOWED_ORIGINS,
  GOOGLE_MAPS_API_KEY,
  RAZORPAY_WEBHOOK_SECRET,
} = env;

export const isProduction = NODE_ENV === 'production';
export const isDevelopment = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';
