/**
 * API 限流器
 * 基于 p-limit 实现，支持并发控制和请求间隔控制
 */
import pLimit from 'p-limit';

export class RateLimiter {
  private limit: ReturnType<typeof pLimit>;
  private lastRequestTime = 0;
  private minDelay: number;

  /**
   * @param maxConcurrent 最大并发请求数，默认 3
   * @param minDelay 每个请求之间的最小延迟（毫秒），默认 100ms
   */
  constructor(maxConcurrent = 3, minDelay = 0) {
    this.limit = pLimit(maxConcurrent);
    this.minDelay = minDelay;
  }

  /**
   * 执行带限流的异步操作
   *
   * 间隔控制在获得并发槽之后进行，确保并发排队时 minDelay 依然生效
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(async () => {
      const now = Date.now();
      const waitTime = this.minDelay - (now - this.lastRequestTime);

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      this.lastRequestTime = Date.now();
      return fn();
    });
  }

  /**
   * 获取当前状态
   */
  getStats() {
    return {
      activeCount: this.limit.activeCount,
      pendingCount: this.limit.pendingCount,
      minDelay: this.minDelay,
    };
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒），默认 1000ms */
  initialDelay?: number;
  /** 延迟倍数，默认 2（指数退避） */
  backoffMultiplier?: number;
  /** 最大延迟时间（毫秒），默认 30000ms (30秒) */
  maxDelay?: number;
  /** 是否应该重试的判断函数 */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * 重试助手
 * 实现指数退避重试策略
 */
export class RetryHelper {
  private config: Required<RetryConfig>;

  constructor(config: RetryConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      initialDelay: config.initialDelay ?? 1000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxDelay: config.maxDelay ?? 30000,
      shouldRetry: config.shouldRetry ?? this.defaultShouldRetry,
    };
  }

  /**
   * 默认的重试判断逻辑
   * 网络错误、限流（429）和 5xx 服务器错误应该重试
   */
  private defaultShouldRetry(error: Error): boolean {
    // 网络错误
    if (error.message.includes('fetch failed') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('network')) {
      return true;
    }

    // 限流错误（官方 API: rate_limited；非官方 API: 429 Too Many Requests）
    if (isRateLimitError(error)) {
      return true;
    }

    // Notion API 特定错误
    if (error.message.includes('rate_limited') ||
        error.message.includes('service_unavailable') ||
        error.message.includes('internal_server_error')) {
      return true;
    }

    // 5xx HTTP 错误（如 "500 Internal Server Error"、"502 Bad Gateway"）
    if (/\b5\d{2}\b/.test(error.message)) {
      return true;
    }

    return false;
  }

  /**
   * 执行带重试的异步操作
   */
  async execute<T>(fn: () => Promise<T>, context?: string): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    while (attempt <= this.config.maxRetries) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // 检查是否应该重试
        if (attempt > this.config.maxRetries || !this.config.shouldRetry(lastError)) {
          break;
        }

        // 计算延迟时间（指数退避）
        let delay = Math.min(
          this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt - 1),
          this.config.maxDelay
        );

        // 限流错误：优先使用服务端 Retry-After 头，否则加重退避
        if (isRateLimitError(lastError)) {
          delay = Math.max(extractRetryAfterMs(lastError) ?? 0, delay * 2, 2000);
        }

        console.warn(
          `[Retry] Attempt ${attempt}/${this.config.maxRetries} failed${context ? ` (${context})` : ''}: ${lastError.message}`
        );
        console.warn(`[Retry] Waiting ${delay}ms before retry...`);

        // 等待后重试
        await this.sleep(delay);
      }
    }

    // 所有重试都失败
    console.error(
      `[Retry] All ${this.config.maxRetries} retries failed${context ? ` (${context})` : ''}: ${lastError!.message}`
    );
    throw lastError!;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 判断是否为限流错误（429 / Too Many Requests / rate_limited）
 */
export function isRateLimitError(error: any): boolean {
  const message = String(error?.message || '');
  return (
    message.includes('429') ||
    /too many requests/i.test(message) ||
    message.includes('rate_limited') ||
    error?.status === 429 ||
    error?.statusCode === 429
  );
}

/**
 * 从错误中提取 Retry-After 头（支持秒数和 HTTP 日期两种格式）
 * ofetch 的 FetchError 挂载了 response 属性
 */
export function extractRetryAfterMs(error: any): number | null {
  const retryAfter = error?.response?.headers?.get?.('retry-after');
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = Date.parse(retryAfter);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return null;
}

// 创建全局限流器实例（用于 Notion 官方 API）
export const notionRateLimiter = new RateLimiter(5, 50);

// 创建全局重试助手实例
export const notionRetryHelper = new RetryHelper({
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 30000,
});

// 非官方 API（notion-client）专用限流器：低并发 + 请求间隔
// Notion 私有接口限流较严格，高频调用会触发 429
export const notionUnofficialRateLimiter = new RateLimiter(2, 350);

// 非官方 API 专用重试助手：更多次数 + 更长初始延迟，覆盖 429 自愈
export const notionUnofficialRetryHelper = new RetryHelper({
  maxRetries: 4,
  initialDelay: 2000,
  backoffMultiplier: 2,
  maxDelay: 30000,
});
