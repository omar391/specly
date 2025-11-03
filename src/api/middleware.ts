/**
 * Express middleware for TaskPilot REST API
 */

import { Request, Response, NextFunction } from 'express';
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
 * Global error handler middleware
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('API Error:', error);

  // Default error response
  let statusCode = 500;
  let errorResponse = createErrorResponse(
    'INTERNAL_ERROR',
    'An internal server error occurred'
  );

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 422;
    errorResponse = createErrorResponse('VALIDATION_ERROR', error.message);
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    errorResponse = createErrorResponse('NOT_FOUND', error.message);
  } else if (error.name === 'BadRequestError') {
    statusCode = 400;
    errorResponse = createErrorResponse('BAD_REQUEST', error.message);
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Not found handler middleware
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse = createErrorResponse(
    'NOT_FOUND',
    `Endpoint not found: ${req.method} ${req.path}`
  );
  res.status(404).json(errorResponse);
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
}

/**
 * CORS middleware for API routes
 */
export function corsHandler(req: Request, res: Response, next: NextFunction): void {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Disable rate limiting in test environment
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      next();
      return;
    }
    
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    for (const [key, value] of rateLimitStore.entries()) {
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
      next();
      return;
    }
    
    if (now > clientData.resetTime) {
      // Reset window
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }
    
    if (clientData.count >= maxRequests) {
      // Rate limit exceeded
      const errorResponse = createErrorResponse(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests, please try again later'
      );
      res.status(429).json(errorResponse);
      return;
    }
    
    // Increment count
    clientData.count++;
    next();
  };
}

/**
 * Validation middleware
 */
export function validateWorkspaceId(req: Request, res: Response, next: NextFunction): void {
  const { workspaceId } = req.params;
  
  if (!workspaceId || workspaceId.trim() === '') {
    const errorResponse = createErrorResponse(
      'INVALID_WORKSPACE_ID',
      'Workspace ID is required'
    );
    res.status(400).json(errorResponse);
    return;
  }
  
  next();
}

export function validateTaskId(req: Request, res: Response, next: NextFunction): void {
  const { taskId } = req.params;
  
  if (!taskId || taskId.trim() === '') {
    const errorResponse = createErrorResponse(
      'INVALID_TASK_ID',
      'Task ID is required'
    );
    res.status(400).json(errorResponse);
    return;
  }
  
  next();
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
