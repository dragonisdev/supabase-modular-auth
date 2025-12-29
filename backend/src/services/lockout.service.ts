import config from "../config/env.js";

interface LockoutRecord {
  count: number;
  lockedUntil?: Date;
  totalLockouts: number; // Track how many times this identifier has been locked
  lastAttempt: Date;
}

/**
 * Account Lockout Service
 * Prevents brute force attacks by tracking failed login attempts
 *
 * Features:
 * - Progressive lockout (longer lockouts for repeat offenders)
 * - IP + email based tracking
 * - Automatic cleanup of expired records
 *
 * NOTE: This uses in-memory storage. For production with multiple servers,
 * use Redis or a database to share state across instances.
 *
 * @example Redis implementation for production:
 * ```
 * import Redis from 'ioredis';
 * const redis = new Redis(process.env.REDIS_URL);
 * // Use redis.incr(), redis.expire() for atomic operations
 * ```
 */
class LockoutService {
  private failedAttempts: Map<string, LockoutRecord>;
  private readonly MAX_ATTEMPTS: number;
  private readonly BASE_LOCKOUT_DURATION_MS: number;
  private readonly MAX_LOCKOUT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours max
  private readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  private readonly RECORD_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.failedAttempts = new Map();
    this.MAX_ATTEMPTS = config.LOCKOUT_MAX_ATTEMPTS;
    this.BASE_LOCKOUT_DURATION_MS = config.LOCKOUT_DURATION_MS;

    // Clean up old entries periodically
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Generate a combined key for IP + email tracking
   * This prevents attackers from using multiple IPs on same account
   * and multiple accounts from same IP
   */
  private getCompositeKey(email: string, ip?: string): string[] {
    const keys: string[] = [`email:${email.toLowerCase()}`];
    if (ip) {
      keys.push(`ip:${ip}`);
      keys.push(`combo:${email.toLowerCase()}:${ip}`);
    }
    return keys;
  }

  /**
   * Calculate progressive lockout duration
   * Doubles with each subsequent lockout, up to max
   */
  private calculateLockoutDuration(totalLockouts: number): number {
    const multiplier = Math.pow(2, Math.min(totalLockouts, 10)); // Cap at 2^10
    return Math.min(this.BASE_LOCKOUT_DURATION_MS * multiplier, this.MAX_LOCKOUT_DURATION_MS);
  }

  /**
   * Check if an account/IP is locked
   */
  isLocked(identifier: string, ip?: string): boolean {
    const keys = this.getCompositeKey(identifier, ip);

    for (const key of keys) {
      const record = this.failedAttempts.get(key);

      if (record?.lockedUntil) {
        if (new Date() < record.lockedUntil) {
          return true;
        }
        // Lockout expired, but keep the record for progressive lockout
        record.lockedUntil = undefined;
      }
    }

    return false;
  }

  /**
   * Record a failed login attempt
   * Returns true if account should be locked
   */
  recordFailedAttempt(identifier: string, ip?: string): boolean {
    const keys = this.getCompositeKey(identifier, ip);
    let shouldLock = false;

    for (const key of keys) {
      const record = this.failedAttempts.get(key) || {
        count: 0,
        totalLockouts: 0,
        lastAttempt: new Date(),
      };

      record.count += 1;
      record.lastAttempt = new Date();

      if (record.count >= this.MAX_ATTEMPTS) {
        record.totalLockouts += 1;
        const lockoutDuration = this.calculateLockoutDuration(record.totalLockouts);
        record.lockedUntil = new Date(Date.now() + lockoutDuration);
        record.count = 0; // Reset count after lockout
        shouldLock = true;
      }

      this.failedAttempts.set(key, record);
    }

    return shouldLock;
  }

  /**
   * Clear failed attempts on successful login
   * Only clears count, not totalLockouts (for progressive lockout)
   */
  clearAttempts(identifier: string, ip?: string): void {
    const keys = this.getCompositeKey(identifier, ip);

    for (const key of keys) {
      const record = this.failedAttempts.get(key);
      if (record) {
        record.count = 0;
        record.lockedUntil = undefined;
        // Keep totalLockouts for progressive lockout on future attempts
      }
    }
  }

  /**
   * Full reset (use sparingly, e.g., after password change)
   */
  fullReset(identifier: string, ip?: string): void {
    const keys = this.getCompositeKey(identifier, ip);
    for (const key of keys) {
      this.failedAttempts.delete(key);
    }
  }

  /**
   * Get remaining lockout time in minutes
   */
  getRemainingLockoutTime(identifier: string, ip?: string): number {
    const keys = this.getCompositeKey(identifier, ip);
    let maxRemaining = 0;

    for (const key of keys) {
      const record = this.failedAttempts.get(key);

      if (record?.lockedUntil) {
        const remaining = record.lockedUntil.getTime() - Date.now();
        if (remaining > 0) {
          maxRemaining = Math.max(maxRemaining, Math.ceil(remaining / 60000));
        }
      }
    }

    return maxRemaining;
  }

  /**
   * Get current failed attempt count for an identifier
   */
  getFailedAttempts(identifier: string, ip?: string): number {
    const keys = this.getCompositeKey(identifier, ip);
    let maxAttempts = 0;

    for (const key of keys) {
      const record = this.failedAttempts.get(key);
      if (record) {
        maxAttempts = Math.max(maxAttempts, record.count);
      }
    }

    return maxAttempts;
  }

  /**
   * Get lockout status for security logging
   */
  getLockoutStatus(
    identifier: string,
    ip?: string,
  ): {
    isLocked: boolean;
    failedAttempts: number;
    remainingMinutes: number;
    totalLockouts: number;
  } {
    const keys = this.getCompositeKey(identifier, ip);
    let status = {
      isLocked: false,
      failedAttempts: 0,
      remainingMinutes: 0,
      totalLockouts: 0,
    };

    for (const key of keys) {
      const record = this.failedAttempts.get(key);
      if (record) {
        if (record.lockedUntil && new Date() < record.lockedUntil) {
          status.isLocked = true;
          const remaining = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60000);
          status.remainingMinutes = Math.max(status.remainingMinutes, remaining);
        }
        status.failedAttempts = Math.max(status.failedAttempts, record.count);
        status.totalLockouts = Math.max(status.totalLockouts, record.totalLockouts);
      }
    }

    return status;
  }

  /**
   * Clean up expired entries to prevent memory leaks
   */
  private cleanup(): void {
    const now = new Date();
    const expiredBefore = new Date(now.getTime() - this.RECORD_EXPIRY_MS);

    for (const [identifier, record] of this.failedAttempts.entries()) {
      // Remove records that are old and not locked
      if (!record.lockedUntil && record.lastAttempt < expiredBefore) {
        this.failedAttempts.delete(identifier);
      }
      // Remove records with expired lockouts that are also old
      if (record.lockedUntil && record.lockedUntil < expiredBefore) {
        this.failedAttempts.delete(identifier);
      }
    }
  }

  /**
   * Get stats for monitoring (safe to expose)
   */
  getStats(): { totalRecords: number; lockedAccounts: number } {
    let lockedAccounts = 0;
    const now = new Date();

    for (const record of this.failedAttempts.values()) {
      if (record.lockedUntil && record.lockedUntil > now) {
        lockedAccounts++;
      }
    }

    return {
      totalRecords: this.failedAttempts.size,
      lockedAccounts,
    };
  }
}

export default new LockoutService();
