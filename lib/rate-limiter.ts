import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, rateLimitConfigs, RateLimitConfig } from './rate-limit';
import { corsHeaders } from './api-utils';

export function withRateLimit(config: RateLimitConfig, handler: Function) {
  return async (request: NextRequest, ...args: any[]) => {
    const response = await rateLimit(request, config, { headers: corsHeaders });
    if (response) {
      return response;
    }

    return handler(request, ...args);
  };
}

export const rateLimiters = {
  auth: (handler: Function) => withRateLimit(rateLimitConfigs.auth, handler),
  general: (handler: Function) => withRateLimit(rateLimitConfigs.api, handler),
};
