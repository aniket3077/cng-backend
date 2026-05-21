import { NextRequest } from 'next/server';

interface SecurityLogEntry {
  timestamp: string;
  ip: string;
  userAgent?: string;
  endpoint: string;
  method: string;
  userId?: string;
  email?: string;
  action: string;
  success: boolean;
  details?: any;
}

class SecurityLogger {
  private logs: SecurityLogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  private getClientIP(request: NextRequest): string {
    return request.ip || 
           request.headers.get('x-forwarded-for')?.split(',')[0] || 
           request.headers.get('x-real-ip') || 
           'unknown';
  }

  private getUserAgent(request: NextRequest): string | undefined {
    return request.headers.get('user-agent') || undefined;
  }

  logSecurityEvent(
    request: NextRequest,
    action: string,
    success: boolean,
    details?: any,
    userId?: string,
    email?: string
  ): void {
    const logEntry: SecurityLogEntry = {
      timestamp: new Date().toISOString(),
      ip: this.getClientIP(request),
      userAgent: this.getUserAgent(request),
      endpoint: request.url,
      method: request.method,
      userId,
      email,
      action,
      success,
      details
    };

    // Add to logs array
    this.logs.push(logEntry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    if (process.env.NODE_ENV !== 'production') {
      const logLevel = success ? 'INFO' : 'WARN';
      console.log(`[${logLevel}] SECURITY: ${action} | IP: ${logEntry.ip} | Success: ${success}`);
    }
  }

  logAuthenticationAttempt(
    request: NextRequest,
    email: string,
    success: boolean,
    reason?: string
  ): void {
    this.logSecurityEvent(
      request,
      'AUTHENTICATION_ATTEMPT',
      success,
      { reason },
      undefined,
      email
    );
  }

  logAdminAccess(
    request: NextRequest,
    userId: string,
    email: string,
    action: string,
    success: boolean
  ): void {
    this.logSecurityEvent(
      request,
      `ADMIN_ACCESS_${action.toUpperCase()}`,
      success,
      { adminAction: action },
      userId,
      email
    );
  }

  logSuspiciousActivity(
    request: NextRequest,
    action: string,
    details: any
  ): void {
    this.logSecurityEvent(
      request,
      `SUSPICIOUS_${action.toUpperCase()}`,
      false,
      details
    );
  }

  getRecentLogs(count: number = 50): SecurityLogEntry[] {
    return this.logs.slice(-count);
  }

  getFailedAuthAttempts(since: Date): SecurityLogEntry[] {
    return this.logs.filter(log => 
      !log.success && 
      log.action === 'AUTHENTICATION_ATTEMPT' &&
      new Date(log.timestamp) > since
    );
  }

  getLogsByIP(ip: string, since?: Date): SecurityLogEntry[] {
    return this.logs.filter(log => 
      log.ip === ip &&
      (!since || new Date(log.timestamp) > since)
    );
  }
}

// Export singleton instance
export const securityLogger = new SecurityLogger();

// Export types for use in other files
export type { SecurityLogEntry };
