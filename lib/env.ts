/**
 * Environment Configuration and Validation
 * This file validates required environment variables at startup
 */
import { parseAllowedOrigins } from './cors';
import { sanitizeEnvValue } from './env-values';

interface EnvConfig {
  // Required
  JWT_SECRET: string;
  DATABASE_URL: string;
  ALLOWED_ORIGINS: string[];

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
    console.error('❌ Environment Validation Error:', message);
    
    // In production, throw to fail fast. In development, log warning but continue.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
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

  return {
    JWT_SECRET: jwtSecret,
    DATABASE_URL: sanitizeEnvValue(process.env.DATABASE_URL) || 'postgresql://localhost/postgres',
    ALLOWED_ORIGINS: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
    NODE_ENV: (process.env.NODE_ENV as EnvConfig['NODE_ENV']) || 'development',
    PORT: parseInt(process.env.PORT || String(optionalEnvVars.PORT)),
    GOOGLE_MAPS_API_KEY: sanitizeEnvValue(process.env.GOOGLE_MAPS_API_KEY),
    RAZORPAY_WEBHOOK_SECRET: sanitizeEnvValue(process.env.RAZORPAY_WEBHOOK_SECRET),
  };
}

// Validate on import with graceful error handling
let envValidationError: Error | null = null;
let tempEnv: EnvConfig;

try {
  tempEnv = validateEnv();
} catch (err) {
  envValidationError = err instanceof Error ? err : new Error(String(err));
  tempEnv = {
    JWT_SECRET: 'development-default-secret-min-32-characters-long',
    DATABASE_URL: 'postgresql://localhost/postgres',
    ALLOWED_ORIGINS: ['*'],
    NODE_ENV: 'development',
    PORT: 3000,
    GOOGLE_MAPS_API_KEY: '',
    RAZORPAY_WEBHOOK_SECRET: '',
  };
}

export const env = tempEnv;
export const getEnvValidationError = () => envValidationError;

// Export individual values for convenience
export const {
  JWT_SECRET,
  DATABASE_URL,
  NODE_ENV,
  PORT,
  ALLOWED_ORIGINS,
  GOOGLE_MAPS_API_KEY,
  RAZORPAY_WEBHOOK_SECRET,
} = env;

export const isProduction = NODE_ENV === 'production';
export const isDevelopment = NODE_ENV === 'development';
export const isTest = NODE_ENV === 'test';
