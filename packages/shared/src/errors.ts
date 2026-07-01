export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AUTH_ERROR', message, 401, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} not found: ${id}` : `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('CONFLICT', message, 409, details);
  }
}

export class TenantError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('TENANT_VIOLATION', message, 403, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details);
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('AI_PROVIDER_ERROR', message, 502, details);
  }
}
