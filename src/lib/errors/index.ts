/**
 * Standardized Error Types for Forge Application
 */

// Base application error class
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'AppError';

    // Maintain proper stack trace in V8 environments
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      cause: this.cause?.message,
    };
  }
}

// Network-related errors
export class NetworkError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'NETWORK_ERROR', cause);
    this.name = 'NetworkError';
  }
}

// FTP/SFTP connection errors
export class FTPConnectionError extends AppError {
  constructor(
    message: string,
    public host?: string,
    cause?: Error
  ) {
    super(message, 'FTP_CONNECTION_ERROR', cause);
    this.name = 'FTPConnectionError';
  }
}

// Gemini API errors
export class GeminiAPIError extends AppError {
  constructor(
    message: string,
    public statusCode?: number,
    cause?: Error
  ) {
    super(message, 'GEMINI_API_ERROR', cause);
    this.name = 'GeminiAPIError';
  }
}

// File system errors
export class FileSystemError extends AppError {
  constructor(
    message: string,
    public path?: string,
    cause?: Error
  ) {
    super(message, 'FILE_SYSTEM_ERROR', cause);
    this.name = 'FileSystemError';
  }
}

// Tauri invoke errors
export class TauriInvokeError extends AppError {
  constructor(
    message: string,
    public command: string,
    cause?: Error
  ) {
    super(message, 'TAURI_INVOKE_ERROR', cause);
    this.name = 'TauriInvokeError';
  }
}

// Validation errors
export class ValidationError extends AppError {
  constructor(
    message: string,
    public field?: string,
    cause?: Error
  ) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

// Scraping errors
export class ScrapingError extends AppError {
  constructor(
    message: string,
    public url?: string,
    cause?: Error
  ) {
    super(message, 'SCRAPING_ERROR', cause);
    this.name = 'ScrapingError';
  }
}

/**
 * Result type for operations that can fail
 * Provides type-safe error handling without exceptions
 */
export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Create a successful result
 */
export function ok<T>(data: T): Result<T, never> {
  return { success: true, data };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * Wrap an async function to return a Result
 */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => AppError
): Promise<Result<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    if (error instanceof AppError) {
      return err(error);
    }
    return err(new AppError(
      error instanceof Error ? error.message : String(error),
      'UNKNOWN_ERROR',
      error instanceof Error ? error : undefined
    ));
  }
}

/**
 * Type guard to check if a value is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Get a user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Une erreur inattendue est survenue';
}
