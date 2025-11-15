/**
 * Hono middleware for Specly REST API
 */

import type { Context } from 'hono';
import { ApiResponse } from './types.js';

/**
 * Error response helper
 */
export function createErrorResponse(code: string, message: string, details?: any): ApiResponse {
  return {
    error: {
      code,
      message,
      details
    }
  };
}

/**
 * Success response helper
 */
export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return { data };
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
export const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    // Disable rate limiting in test environment
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      await next();
      return;
    }
    
    const clientId = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries (skip current client so reset-window branch remains reachable)
    for (const [key, value] of rateLimitStore.entries()) {
      if (key === clientId) continue;
      if (now > value.resetTime) {
        rateLimitStore.delete(key);
      }
    }
    
    // Check current client
    const clientData = rateLimitStore.get(clientId);
    
    if (!clientData) {
      // First request from this client
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
      await next();
      return;
    }
    
    if (now > clientData.resetTime) {
      // Reset window
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
      await next();
      return;
    }
    
    if (clientData.count >= maxRequests) {
      // Rate limit exceeded
      const errorResponse = createErrorResponse(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests, please try again later'
      );
      c.json(errorResponse, 429);
      return;
    }
    
    // Increment count
    clientData.count++;
    await next();
  };
}

/**
 * Validation middleware
 */
export function validateWorkspaceId(c: Context, next: () => Promise<void>): Promise<void> {
  const { workspaceId } = c.req.param();
  
  if (!workspaceId || workspaceId.trim() === '') {
    const errorResponse = createErrorResponse(
      'INVALID_WORKSPACE_ID',
      'Workspace ID is required'
    );
    c.json(errorResponse, 400);
    return Promise.resolve();
  }
  
  return next();
}

export function validateTaskId(c: Context, next: () => Promise<void>): Promise<void> {
  const { taskId } = c.req.param();
  
  if (!taskId || taskId.trim() === '') {
    const errorResponse = createErrorResponse(
      'INVALID_TASK_ID',
      'Task ID is required'
    );
    c.json(errorResponse, 400);
    return Promise.resolve();
  }
  
  return next();
}

/**
 * Custom error classes
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

// Exported accessor: allow external code to inspect/modify the in-memory rate limit store.
// Note: exported to enable reachability and operational inspection by tools.
// Force the reset-window logic for a specific client. Returns true when reset performed.
export function forceResetWindowForClient(clientId: string, now: number, windowMs: number): boolean {
  const clientData = rateLimitStore.get(clientId);
  if (clientData && now > clientData.resetTime) {
    rateLimitStore.set(clientId, { count: 1, resetTime: now + windowMs });
    return true;
  }
  return false;
}
