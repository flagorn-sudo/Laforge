/**
 * Centralized logging utility for Forge application
 * Provides consistent logging with levels and formatting
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  data?: unknown;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  prefix?: string;
}

const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL_STYLES: Record<LogLevel, string> = {
  debug: 'color: #9e9e9e',
  info: 'color: #2196f3',
  warn: 'color: #ff9800',
  error: 'color: #f44336',
};

const LOG_LEVEL_ICONS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

class Logger {
  private config: LoggerConfig = {
    minLevel: import.meta.env.DEV ? 'debug' : 'info',
    enableConsole: true,
    prefix: '[La Forge]',
  };

  private history: LogEntry[] = [];
  private maxHistorySize = 1000;

  configure(config: Partial<LoggerConfig>) {
    this.config = { ...this.config, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.minLevel];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toLocaleTimeString();
    return `${this.config.prefix} [${timestamp}] ${LOG_LEVEL_ICONS[level]} ${message}`;
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      data,
    };

    // Add to history
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Console output
    if (this.config.enableConsole) {
      const formattedMessage = this.formatMessage(level, message);
      const style = LOG_LEVEL_STYLES[level];

      switch (level) {
        case 'debug':
          if (data !== undefined) {
            console.debug(`%c${formattedMessage}`, style, data);
          } else {
            console.debug(`%c${formattedMessage}`, style);
          }
          break;
        case 'info':
          if (data !== undefined) {
            console.info(`%c${formattedMessage}`, style, data);
          } else {
            console.info(`%c${formattedMessage}`, style);
          }
          break;
        case 'warn':
          if (data !== undefined) {
            console.warn(`%c${formattedMessage}`, style, data);
          } else {
            console.warn(`%c${formattedMessage}`, style);
          }
          break;
        case 'error':
          if (data !== undefined) {
            console.error(`%c${formattedMessage}`, style, data);
          } else {
            console.error(`%c${formattedMessage}`, style);
          }
          break;
      }
    }
  }

  debug(message: string, data?: unknown) {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown) {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.log('error', message, data);
  }

  /**
   * Create a scoped logger with a component prefix
   */
  scope(component: string): ScopedLogger {
    return new ScopedLogger(this, component);
  }

  /**
   * Get recent log history
   */
  getHistory(count?: number): LogEntry[] {
    const entries = count ? this.history.slice(-count) : [...this.history];
    return entries;
  }

  /**
   * Clear log history
   */
  clearHistory() {
    this.history = [];
  }

  /**
   * Log an error with stack trace
   */
  logError(error: unknown, context?: string) {
    const message = context ? `${context}: ` : '';

    if (error instanceof Error) {
      this.error(`${message}${error.message}`);
      if (error.stack) {
        this.debug('Stack trace:', error.stack);
      }
    } else {
      this.error(`${message}${String(error)}`);
    }
  }

  /**
   * Measure and log execution time
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.debug(`${label} completed in ${duration.toFixed(2)}ms`);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.error(`${label} failed after ${duration.toFixed(2)}ms`, error);
      throw error;
    }
  }
}

class ScopedLogger {
  constructor(
    private parent: Logger,
    private component: string
  ) {}

  private formatMessage(message: string): string {
    return `[${this.component}] ${message}`;
  }

  debug(message: string, data?: unknown) {
    this.parent.debug(this.formatMessage(message), data);
  }

  info(message: string, data?: unknown) {
    this.parent.info(this.formatMessage(message), data);
  }

  warn(message: string, data?: unknown) {
    this.parent.warn(this.formatMessage(message), data);
  }

  error(message: string, data?: unknown) {
    this.parent.error(this.formatMessage(message), data);
  }

  logError(error: unknown, context?: string) {
    this.parent.logError(error, context ? `[${this.component}] ${context}` : `[${this.component}]`);
  }

  time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return this.parent.time(`[${this.component}] ${label}`, fn);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export types
export type { LogLevel, LogEntry, LoggerConfig, ScopedLogger };
