// ============================================
// MOLTCITY - Error Handler Plugin
// ============================================

import { FastifyPluginAsync, FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isDevelopment } from '../config/env.js';

// Custom error classes
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class InsufficientFundsError extends AppError {
  constructor(required: number, available: number) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      400,
      'INSUFFICIENT_FUNDS'
    );
    this.name = 'InsufficientFundsError';
  }
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    stack?: string;
  };
}

export const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  // Global error handler
  fastify.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const response: ErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };

    let statusCode = 500;

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      statusCode = 400;
      response.error.code = 'VALIDATION_ERROR';
      response.error.message = 'Validation failed';
      response.error.details = error.issues?.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })) || error.message;
    }
    // Handle our custom errors
    else if (error instanceof AppError) {
      statusCode = error.statusCode;
      response.error.code = error.code;
      response.error.message = error.message;
      if (error instanceof ValidationError && error.details) {
        response.error.details = error.details;
      }
    }
    // Handle Fastify validation errors
    else if ('validation' in error && error.validation) {
      statusCode = 400;
      response.error.code = 'VALIDATION_ERROR';
      response.error.message = 'Request validation failed';
      response.error.details = error.validation;
    }
    // Handle other errors
    else {
      response.error.message = error.message || 'An unexpected error occurred';
    }

    // Include stack trace in development
    if (isDevelopment() && error.stack) {
      response.error.stack = error.stack;
    }

    fastify.log.error({
      err: error,
      request: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
      },
    });

    reply.status(statusCode).send(response);
  });

  // 404 handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
};
